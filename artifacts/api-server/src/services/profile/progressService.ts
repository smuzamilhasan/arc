// Progressive-profiling engine.
//
//   loadSnapshot(clientId)        → the profile state the registry checks
//   computeCompleteness(snapshot) → overall % + per-section + missing fields
//   nextQuestions(snapshot, ...)  → the highest-leverage gaps to ask now
//   captureAnswer(client, key, a) → map a freeform answer into the right layer
//
// This is what lets the profile fill across many touchpoints over time instead
// of one giant form.

import {
  db,
  clientProfileTable,
  storyBankTable,
  referenceLibraryTable,
  voiceSamplesTable,
  readLayer,
  patchLayer,
  type ProfileV2LayerKey,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { openaiStructuredClient } from "../../agents-v2/llm";
import { z } from "zod/v4";
import {
  PROFILE_FIELDS,
  fieldByKey,
  type ProfileField,
  type FieldTouchpoint,
  type ProfileSnapshot,
} from "./fieldRegistry";

// Map an accessor layer key → the Drizzle column on client_profile.
const LAYER_COLUMN: Partial<Record<ProfileV2LayerKey, keyof typeof clientProfileTable.$inferSelect>> = {
  positioning_v2: "positioningV2",
  icp_v2: "icpV2",
  voice_v2: "voiceV2",
  worldview_v2: "worldviewV2",
  negative_space_v2: "negativeSpaceV2",
  goals_v2: "goalsV2",
  offers_v2: "offersV2",
  operating_prefs_v2: "operatingPrefsV2",
  content_strategy_v2: "contentStrategyV2",
  channels_v2: "channelsV2",
  market_context_v2: "marketContextV2",
  reputation_v2: "reputationV2",
  identity_v2: "identityV2",
};

export async function loadSnapshot(clientId: number): Promise<ProfileSnapshot> {
  const [profile] = await db.select().from(clientProfileTable).where(eq(clientProfileTable.id, clientId)).limit(1);
  if (!profile) return {};

  const [storyCount, refCount, sampleCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(storyBankTable).where(eq(storyBankTable.clientId, clientId)),
    db.select({ n: sql<number>`count(*)::int` }).from(referenceLibraryTable).where(eq(referenceLibraryTable.clientId, clientId)),
    db.select({ n: sql<number>`count(*)::int` }).from(voiceSamplesTable).where(eq(voiceSamplesTable.clientId, clientId)),
  ]);

  const safe = <K extends ProfileV2LayerKey>(key: K, raw: unknown) => {
    try {
      return readLayer(key, raw);
    } catch {
      return raw ?? null;
    }
  };

  return {
    identity_v2: safe("identity_v2", profile.identityV2) as ProfileSnapshot["identity_v2"],
    positioning_v2: safe("positioning_v2", profile.positioningV2) as ProfileSnapshot["positioning_v2"],
    icp_v2: safe("icp_v2", profile.icpV2) as ProfileSnapshot["icp_v2"],
    voice_v2: safe("voice_v2", profile.voiceV2) as ProfileSnapshot["voice_v2"],
    worldview_v2: safe("worldview_v2", profile.worldviewV2) as ProfileSnapshot["worldview_v2"],
    negative_space_v2: safe("negative_space_v2", profile.negativeSpaceV2) as ProfileSnapshot["negative_space_v2"],
    goals_v2: safe("goals_v2", profile.goalsV2) as ProfileSnapshot["goals_v2"],
    offers_v2: safe("offers_v2", profile.offersV2) as ProfileSnapshot["offers_v2"],
    operating_prefs_v2: safe("operating_prefs_v2", profile.operatingPrefsV2) as ProfileSnapshot["operating_prefs_v2"],
    content_strategy_v2: safe("content_strategy_v2", profile.contentStrategyV2) as ProfileSnapshot["content_strategy_v2"],
    channels_v2: safe("channels_v2", profile.channelsV2) as ProfileSnapshot["channels_v2"],
    market_context_v2: safe("market_context_v2", profile.marketContextV2) as ProfileSnapshot["market_context_v2"],
    reputation_v2: safe("reputation_v2", profile.reputationV2) as ProfileSnapshot["reputation_v2"],
    counts: {
      voice_samples: sampleCount[0]?.n ?? 0,
      stories: storyCount[0]?.n ?? 0,
      references: refCount[0]?.n ?? 0,
    },
  };
}

export type Completeness = {
  overall_pct: number;
  core_pct: number;
  sections: Array<{ section: string; filled: number; total: number }>;
  missing: Array<{ key: string; label: string; section: string; priority: number; core: boolean }>;
};

export function computeCompleteness(snapshot: ProfileSnapshot): Completeness {
  const sections = new Map<string, { filled: number; total: number }>();
  const missing: Completeness["missing"] = [];
  let filledAll = 0;
  let coreFilled = 0;
  let coreTotal = 0;

  for (const f of PROFILE_FIELDS) {
    const filled = safeFilled(f, snapshot);
    const s = sections.get(f.section) ?? { filled: 0, total: 0 };
    s.total += 1;
    if (filled) {
      s.filled += 1;
      filledAll += 1;
    } else {
      missing.push({ key: f.key, label: f.label, section: f.section, priority: f.priority, core: f.core });
    }
    sections.set(f.section, s);
    if (f.core) {
      coreTotal += 1;
      if (filled) coreFilled += 1;
    }
  }

  return {
    overall_pct: Math.round((filledAll / PROFILE_FIELDS.length) * 100),
    core_pct: coreTotal > 0 ? Math.round((coreFilled / coreTotal) * 100) : 100,
    sections: [...sections.entries()].map(([section, v]) => ({ section, ...v })),
    missing: missing.sort((a, b) => a.priority - b.priority),
  };
}

/** The highest-leverage UNFILLED, ASKABLE fields for a given touchpoint. */
export function nextQuestions(
  snapshot: ProfileSnapshot,
  touchpoint: FieldTouchpoint,
  n = 1
): Array<{ key: string; label: string; section: string; question: string; why?: string }> {
  return PROFILE_FIELDS.filter(
    (f) =>
      f.question &&
      // micro surfaces both micro-tagged and any unanswered onboarding field
      (f.touchpoint === touchpoint || (touchpoint === "micro" && f.touchpoint === "onboarding")) &&
      !safeFilled(f, snapshot)
  )
    .sort((a, b) => a.priority - b.priority)
    .slice(0, n)
    .map((f) => ({ key: f.key, label: f.label, section: f.section, question: f.question!, why: f.why }));
}

function safeFilled(f: ProfileField, snapshot: ProfileSnapshot): boolean {
  try {
    return f.isFilled(snapshot);
  } catch {
    return false;
  }
}

// ---------- Capture: freeform answer → structured layer write ----------

const captureOutputSchema = z.object({
  // The model returns a flat JSON patch for the field's layer. We validate
  // loosely here (record) and let patchLayer's Zod do strict validation on write.
  patch: z.record(z.string(), z.unknown()),
  // If the answer carried no usable signal for this field.
  empty: z.boolean().default(false),
});

export type CaptureResult =
  | { ok: true; field: string; layer: string }
  | { ok: false; reason: string };

export async function captureAnswer(
  clientId: number,
  fieldKey: string,
  answer: string
): Promise<CaptureResult> {
  const field = fieldByKey(fieldKey);
  if (!field) return { ok: false, reason: `unknown field ${fieldKey}` };
  if (!field.layer || !(field.layer in LAYER_COLUMN)) {
    return { ok: false, reason: `field ${fieldKey} has no writable layer` };
  }
  const layerKey = field.layer as ProfileV2LayerKey;

  // Ask the model to turn the freeform answer into a JSON patch for this layer.
  const system = [
    `You convert a user's freeform answer into a structured JSON patch for one`,
    `layer of their personal-brand profile.`,
    `Field being filled: "${field.label}" (layer ${layerKey}).`,
    `The user was asked: "${field.question}"`,
    ``,
    `Return { patch: {...}, empty: bool }. The patch object updates ONLY the`,
    `keys you can fill from the answer, using the layer's shape. Examples of the`,
    `layer's keys: ${describeLayer(layerKey)}.`,
    `Use arrays where the layer expects arrays. Set a sensible confidence (0-1).`,
    `If the answer has no usable signal, return empty=true with patch={}.`,
    `Never invent facts the user didn't say.`,
  ].join("\n");

  let result;
  try {
    result = await openaiStructuredClient.generate({
      system_prompt: system,
      user_prompt: `Answer: ${answer}`,
      output_schema: captureOutputSchema,
      model: "gpt-4o-2024-08-06",
      temperature: 0.2,
    });
  } catch (err) {
    return { ok: false, reason: `capture LLM failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (result.output.empty || Object.keys(result.output.patch).length === 0) {
    return { ok: false, reason: "no usable signal in answer" };
  }

  // Merge via the typed accessor (validates), then write the column.
  try {
    const column = LAYER_COLUMN[layerKey]!;
    const [existing] = await db.select().from(clientProfileTable).where(eq(clientProfileTable.id, clientId)).limit(1);
    const current = existing ? readLayer(layerKey, (existing as Record<string, unknown>)[column as string]) : null;
    const merged = patchLayer(layerKey, current as never, result.output.patch as never);
    await db
      .update(clientProfileTable)
      .set({ [column]: merged, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(clientProfileTable.id, clientId));
    return { ok: true, field: fieldKey, layer: layerKey };
  } catch (err) {
    return { ok: false, reason: `write failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function describeLayer(key: ProfileV2LayerKey): string {
  switch (key) {
    case "goals_v2":
      return "brand_goals[], business_goals[], success_metrics[], time_horizon, current_state, desired_state, confidence";
    case "offers_v2":
      return "offerings[{name,type,description,price_note}], lead_magnets[], promoting_now, preferred_ctas[], confidence";
    case "operating_prefs_v2":
      return "content_time_per_week, approval_style('review_all'|'trust_high_confidence'|'autonomous'), risk_tolerance(0-1), sustainable_cadence, confidence";
    case "content_strategy_v2":
      return "pillars[{name,description}], formats[], recurring_series[], content_mix{educational,personal,promotional}, confidence";
    case "channels_v2":
      return "channels[{platform,handle,url,is_primary,audience_size,cadence}], confidence";
    case "identity_v2":
      return "geography_base, geography_market[], languages[], content_script, credentials[], career_arc, confidence";
    case "reputation_v2":
      return "current_perception, desired_perception, perception_gap, confidence";
    case "icp_v2":
      return "archetypes[{label,jobs_to_be_done[],watering_holes[],where_they_get_stuck[]}], disqualifications[], confidence";
    case "positioning_v2":
      return "claim, defensibility, adjacent_claims_rejected[], proof_points[], confidence";
    case "negative_space_v2":
      return "refused_topics[], refused_words[], refused_takes[], refused_formats[]";
    case "worldview_v2":
      return "beliefs[{claim,why_held,confidence}]";
    default:
      return "(see schema)";
  }
}
