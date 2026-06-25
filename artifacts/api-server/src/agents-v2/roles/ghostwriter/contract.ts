// Ghostwriter v2 — the agent that directly fixes the v1 "generic output"
// diagnosis.
//
// v1 ghostwriter built drafts from self-reported adjectives (`personalityTone`)
// with NO access to actual user posts. v2 ghostwriter:
//
//   • Receives a curated slice of REAL voice samples to cite
//   • Receives confirmed story_bank entries to anchor against
//   • Receives confirmed reference_library entries
//   • Receives negative_space (refused topics/words/takes/formats)
//   • Receives anti_examples as foils
//   • MUST emit voice_evidence with ≥1 style anchor citing a real sample_id
//   • MUST set honors_negative_space=true after self-check
//   • Refuses when voice_v2.confidence < threshold for the platform
//
// Role-locked: cannot change positioning, ICP, calendar, or strategy.

import { z } from "zod/v4";
import type { RoleContract } from "../../contracts/roleContract";
import { contentDraftSchema, type ContentDraft } from "../../contracts/outputs";

// ---------- Input ----------

const proofPointInputSchema = z.object({
  kind: z.enum(["achievement", "result", "artifact", "talk", "press", "outcome"]),
  label: z.string(),
});

const positioningInputSchema = z
  .object({
    claim: z.string().nullable().optional(),
    adjacent_claims_rejected: z.array(z.string()).default([]),
    proof_points: z.array(proofPointInputSchema).default([]),
  })
  .nullable()
  .optional();

const voiceInputSchema = z
  .object({
    description: z.string().nullable().optional(),
    formality: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).default(0),
    sample_count: z.number().int().nonnegative().default(0),
    sentence_stats: z
      .object({
        avg_len: z.number(),
        p90_len: z.number(),
        declarative_ratio: z.number(),
        question_ratio: z.number(),
      })
      .partial()
      .optional(),
    lexicon: z
      .object({
        signature_words: z.array(z.string()).default([]),
        avoided_words: z.array(z.string()).default([]),
        banned_phrases: z.array(z.string()).default([]),
      })
      .partial()
      .optional(),
    signature_moves: z
      .array(z.object({ pattern: z.string(), frequency: z.number().min(0).max(1) }))
      .default([]),
  })
  .nullable()
  .optional();

const negativeSpaceInputSchema = z
  .object({
    refused_topics: z.array(z.string()).default([]),
    refused_words: z.array(z.string()).default([]),
    refused_takes: z.array(z.string()).default([]),
    refused_formats: z.array(z.string()).default([]),
  })
  .nullable()
  .optional();

const voiceSampleInputSchema = z.object({
  sample_id: z.number().int(),
  platform: z.string().nullable(),
  excerpt: z.string(),
});

const storyInputSchema = z.object({
  story_id: z.number().int(),
  summary: z.string(),
  themes: z.array(z.string()).default([]),
  last_used_at: z.string().nullable(),
});

const referenceInputSchema = z.object({
  reference_id: z.number().int(),
  kind: z.string(),
  label: z.string(),
});

const antiExampleInputSchema = z.object({
  sample_text: z.string(),
  why_not_this_voice: z.string(),
});

export const ghostwriterInputSchema = z.object({
  client_id: z.number().int(),
  brief: z.string().min(1).describe("What the draft is about — a topic, angle, or theme to expand on"),
  platform: z.enum(["linkedin", "x", "newsletter", "youtube_caption", "blog"]),
  format: z.enum(["post", "thread", "essay"]).default("post"),

  // Curated context from the v2 ContextCurator.
  identity: z.object({
    full_name: z.string(),
    headline: z.string(),
  }),
  positioning: positioningInputSchema,
  voice: voiceInputSchema,
  voice_samples: z.array(voiceSampleInputSchema).min(1),
  stories: z.array(storyInputSchema).default([]),
  references: z.array(referenceInputSchema).default([]),
  negative_space: negativeSpaceInputSchema,
  anti_examples: z.array(antiExampleInputSchema).default([]),

  // Correction feedback injected by the service on a retry after a contract
  // violation (e.g. "you used the banned word X — rewrite without it").
  retry_feedback: z.string().nullable().optional(),
});
export type GhostwriterInput = z.infer<typeof ghostwriterInputSchema>;

// ---------- Tuning constants ----------

const MIN_VOICE_CONFIDENCE_BY_PLATFORM: Record<GhostwriterInput["platform"], number> = {
  linkedin: 0.5,
  x: 0.45,
  newsletter: 0.55,
  youtube_caption: 0.4,
  blog: 0.55,
};

const MAX_BODY_BY_PLATFORM: Record<GhostwriterInput["platform"], number> = {
  linkedin: 3000,
  x: 280,
  newsletter: 8000,
  youtube_caption: 5000,
  blog: 12000,
};

// ---------- Contract ----------

export const ghostwriterContract: RoleContract<GhostwriterInput, ContentDraft> = {
  name: "ghostwriter",
  job: "Draft content in the user's voice with evidence, or refuse when voice signal is too thin.",
  version: "0.2.0", // v2 of the ghostwriter role; v1 lived in services/ghostwriter.ts

  allowed_actions: [
    "Emit a ContentDraft with body cited to ≥1 voice_evidence style_anchor (a real voice_sample)",
    "Cite a story_anchor when grounding the draft in a confirmed story_bank entry",
    "Weave reference_library names in sparingly when contextually appropriate",
    "Set honors_negative_space=true ONLY after self-checking the body against refused_words/topics/takes/formats",
    "Refuse with refusal_reason when voice confidence is below the platform's threshold OR signal is too thin to draft confidently",
  ],
  forbidden_actions: [
    "Use any word from voice.lexicon.banned_phrases or negative_space.refused_words",
    "Address a topic listed in negative_space.refused_topics",
    "Take a position listed in negative_space.refused_takes",
    "Use a format listed in negative_space.refused_formats (e.g. engagement-bait hooks)",
    "Invent achievements, results, dates, names, or quotes not present in positioning.proof_points or voice_samples",
    "Update profile fields (positioning, ICP, voice features) — emit refusals upward, never a profile_patch",
    "Modify the calendar — that is the Planner's job",
    "Output any kind other than ContentDraft",
  ],
  escalates_to: "strategist",

  input_schema: ghostwriterInputSchema,
  output_schema: contentDraftSchema,

  context_requirements: [
    { key: "identity", required: true },
    { key: "positioning", required: true },
    { key: "voice", required: true },
    { key: "voice_samples", required: true },
    { key: "stories", required: false },
    { key: "references", required: false },
    { key: "negative_space", required: true },
    { key: "anti_examples", required: false },
  ],

  refusal_reasons: [
    "voice_v2.confidence below platform threshold; would produce generic output",
    "Fewer than 3 voice samples for the requested platform; insufficient grounding",
    "Brief conflicts with negative_space.refused_topics",
    "Brief asks for a format the user refused (e.g. engagement-bait hook)",
    "Cannot honor negative_space while addressing the brief",
  ],

  default_model: "gpt-4o-2024-08-06",
  default_temperature: 0.6,
  enforce_structured_output: true,

  system_prompt: (input) => buildSystemPrompt(input),

  assert_no_violations: (output, input) => {
    if (output.refuses) return [];
    const violations: string[] = [];

    // 1. voice_evidence.style_anchors must reference REAL sample ids from input.voice_samples.
    const validSampleIds = new Set(input.voice_samples.map((s) => s.sample_id));
    const styleAnchors = output.voice_evidence.style_anchors;
    if (styleAnchors.length === 0) {
      violations.push("voice_evidence.style_anchors is empty — every draft must cite ≥1 voice sample");
    }
    for (const a of styleAnchors) {
      if (a.kind !== "voice_sample") continue;
      if (!validSampleIds.has(a.sample_id)) {
        violations.push(
          `style_anchor cites sample_id=${a.sample_id} that is not in input.voice_samples`
        );
      }
    }

    // 2. story_anchor (if present) must reference a real story_id.
    const validStoryIds = new Set(input.stories.map((s) => s.story_id));
    if (output.voice_evidence.story_anchor && output.voice_evidence.story_anchor.kind === "story_bank") {
      if (!validStoryIds.has(output.voice_evidence.story_anchor.story_id)) {
        violations.push("story_anchor cites a story_id not in input.stories");
      }
    }

    // 3. reference_anchors must reference real reference_ids.
    const validRefIds = new Set(input.references.map((r) => r.reference_id));
    for (const ref of output.voice_evidence.reference_anchors) {
      if (ref.kind !== "reference_library") continue;
      if (!validRefIds.has(ref.reference_id)) {
        violations.push(`reference_anchor cites reference_id=${ref.reference_id} that is not in input.references`);
      }
    }

    // 4. Body must not exceed platform cap.
    const maxBody = MAX_BODY_BY_PLATFORM[output.platform];
    if (output.body.length > maxBody) {
      violations.push(`body length ${output.body.length} exceeds platform cap ${maxBody}`);
    }

    // 5. Deterministic negative_space scan — agent claims honors_negative_space=true;
    //    we verify against refused_words and banned_phrases.
    const lower = output.body.toLowerCase();
    const refusedWords = (input.negative_space?.refused_words ?? []).map((w) => w.toLowerCase());
    const bannedPhrases = (input.voice?.lexicon?.banned_phrases ?? []).map((p) => p.toLowerCase());
    for (const w of refusedWords) {
      if (w && lower.includes(w)) {
        violations.push(`body contains refused word: "${w}"`);
      }
    }
    for (const p of bannedPhrases) {
      if (p && lower.includes(p)) {
        violations.push(`body contains banned phrase: "${p}"`);
      }
    }

    // 6. Voice confidence floor for the platform.
    const voiceConfidence = input.voice?.confidence ?? 0;
    const floor = MIN_VOICE_CONFIDENCE_BY_PLATFORM[input.platform];
    if (voiceConfidence < floor && output.confidence > 0.5) {
      violations.push(
        `voice.confidence=${voiceConfidence.toFixed(2)} below platform floor ${floor}, yet output.confidence=${output.confidence.toFixed(2)} is high; expected refusal or low confidence`
      );
    }

    return violations;
  },
};

// ---------- Helpers ----------

function buildSystemPrompt(input: GhostwriterInput): string {
  const voice = input.voice;
  const voiceDesc = voice?.description ?? "(no description yet)";
  const sigWords = voice?.lexicon?.signature_words?.slice(0, 12).join(", ") ?? "(none)";
  const sigMoves = voice?.signature_moves?.slice(0, 5).map((m) => m.pattern).join("; ") ?? "(none)";
  const refusedTopics = input.negative_space?.refused_topics?.join(", ") || "(none)";
  const refusedWords = input.negative_space?.refused_words?.join(", ") || "(none)";
  const refusedTakes = input.negative_space?.refused_takes?.join(", ") || "(none)";
  const refusedFormats = input.negative_space?.refused_formats?.join(", ") || "(none)";

  const samplesPreview = input.voice_samples
    .slice(0, 6)
    .map((s) => `[sample ${s.sample_id} on ${s.platform ?? "?"}]\n${truncate(s.excerpt, 400)}`)
    .join("\n\n");

  const storiesPreview = input.stories.length
    ? input.stories
        .slice(0, 6)
        .map((s) => `[story ${s.story_id}] ${s.summary}`)
        .join("\n")
    : "(none confirmed yet)";

  const refsPreview = input.references.length
    ? input.references
        .slice(0, 10)
        .map((r) => `[ref ${r.reference_id}] ${r.kind}: ${r.label}`)
        .join("\n")
    : "(none confirmed yet)";

  const antiExamplesPreview = input.anti_examples.length
    ? input.anti_examples
        .slice(0, 3)
        .map((a) => `✗ ${truncate(a.sample_text, 200)} — because: ${a.why_not_this_voice}`)
        .join("\n")
    : "(none provided)";

  return [
    `You are drafting a ${input.format} for ${input.platform}.`,
    `Brief: ${input.brief}`,
    ``,
    `WHO:`,
    `  ${input.identity.full_name} — ${input.identity.headline}`,
    `  Positioning claim: ${input.positioning?.claim ?? "(not yet sharp)"}`,
    `  Adjacent rejected: ${input.positioning?.adjacent_claims_rejected?.join("; ") ?? "(none)"}`,
    ``,
    `VOICE (the only voice you write in):`,
    `  Description: ${voiceDesc}`,
    `  Signature words: ${sigWords}`,
    `  Signature moves: ${sigMoves}`,
    `  Confidence: ${voice?.confidence?.toFixed(2) ?? "0.00"}  Sample count: ${voice?.sample_count ?? 0}`,
    ``,
    `NEGATIVE SPACE (HARD CONSTRAINTS):`,
    `  Refused topics: ${refusedTopics}`,
    `  Refused words: ${refusedWords}`,
    `  Refused takes: ${refusedTakes}`,
    `  Refused formats: ${refusedFormats}`,
    ``,
    `REAL VOICE SAMPLES (cite ≥1 by sample_id):`,
    samplesPreview,
    ``,
    `CONFIRMED STORY BANK (anchor here when relevant):`,
    storiesPreview,
    ``,
    `REFERENCE LIBRARY (weave in sparingly):`,
    refsPreview,
    ``,
    `ANTI-EXAMPLES (sound NOTHING like the user — your draft must not pattern-match these):`,
    antiExamplesPreview,
    ``,
    `Hard rules:`,
    `  - Output a ContentDraft. Set platform="${input.platform}".`,
    `  - voice_evidence.style_anchors MUST include ≥1 voice_sample sample_id from the list above.`,
    `  - If you ground in a story, set story_anchor to its story_id.`,
    `  - If you cite a reference, include its reference_id in reference_anchors.`,
    `  - Set honors_negative_space=true ONLY after self-check against refused_*.`,
    `  - Body length cap: ${MAX_BODY_BY_PLATFORM[input.platform]} chars.`,
    `  - If voice.confidence < ${MIN_VOICE_CONFIDENCE_BY_PLATFORM[input.platform]} OR signal is too thin, REFUSE with refusal_reason.`,
    `  - Never invent achievements, dates, quotes, or names not in positioning.proof_points or the samples.`,
    `  - Never use hype words (crush, hack, explode, 10x, guru) — those are project-wide bans.`,
    ``,
    `Calibration check before output: would the user recognize this as their voice if you showed it to them blind?`,
    `If unsure → lower output.confidence. If clearly no → refuse.`,
    ``,
    `BANNED WORDS — these must NOT appear anywhere in the body (case-insensitive):`,
    `  ${[...(input.negative_space?.refused_words ?? []), ...(input.voice?.lexicon?.banned_phrases ?? [])].join(", ") || "(none)"}`,
    `  Before finalizing, scan your body word by word and remove any of the above.`,
    ...(input.retry_feedback
      ? [
          ``,
          `⚠️ CORRECTION REQUIRED — your previous attempt was rejected:`,
          `  ${input.retry_feedback}`,
          `  Produce a new draft that fixes this exactly. Do not repeat the mistake.`,
        ]
      : []),
  ].join("\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + " …";
}

export { MIN_VOICE_CONFIDENCE_BY_PLATFORM, MAX_BODY_BY_PLATFORM };
