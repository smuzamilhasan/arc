// Per-agent rubrics. Each rubric defines a set of scoring dimensions with
// anchors describing what 0.0 and 1.0 look like.
//
// Each rubric dimension has up to two scorers:
//   - deterministic: code-only check (regex / stats / DB lookup). May be null.
//   - llm: evaluator agent prompt fragment used when LLM scoring is required.
//
// Two-source scoring (when both present) catches blind spots in either path.

import type { AgentRole } from "../../agents-v2/contracts/types";

export type RubricDimension = {
  name: string;
  description: string;
  anchor_0: string;
  anchor_1: string;
  weight: number; // contribution to overall (sum across dims should be ~1.0)
  deterministic?: (output: unknown, context: unknown) => number;
  llm_prompt_fragment?: string; // appended to evaluator system prompt
};

export type Rubric = {
  role: AgentRole;
  version: string;
  dimensions: RubricDimension[];
};

// ---------- Ghostwriter ----------
export const ghostwriterRubric: Rubric = {
  role: "ghostwriter",
  version: "0.1.0",
  dimensions: [
    {
      name: "voice_fidelity",
      description: "Does the draft match the user's structured voice features?",
      anchor_0: "Sentence stats / lexicon / signature moves all outside tolerance. Could be anyone.",
      anchor_1: "Stats within tolerance, signature moves present, signature_words used naturally.",
      weight: 0.30,
      llm_prompt_fragment:
        "Compare the draft's sentence rhythm, lexicon, and signature moves against the provided voice_v2. Score 0-1.",
    },
    {
      name: "non_genericness",
      description: "Would this read as 'any AI' or 'this specific person'?",
      anchor_0: "Generic LinkedIn/X slop. Replace the name and nobody would notice.",
      anchor_1: "Unmistakably this person. Specific claims, specific references, specific framings.",
      weight: 0.25,
      llm_prompt_fragment:
        "Could this draft be produced for any user in this archetype? Or is it uniquely this profile? Score non-genericness 0-1.",
    },
    {
      name: "story_anchored",
      description: "Does the draft cite a story_bank entry or specific proof point?",
      anchor_0: "Abstract claims with no anchor.",
      anchor_1: "Anchored to a story_bank entry or named proof_point.",
      weight: 0.15,
      deterministic: (output) => {
        const o = output as { voice_evidence?: { story_anchor?: unknown; reference_anchors?: unknown[] } };
        const hasStory = !!o?.voice_evidence?.story_anchor;
        const hasRefs = (o?.voice_evidence?.reference_anchors?.length ?? 0) > 0;
        return hasStory ? 1 : hasRefs ? 0.6 : 0;
      },
    },
    {
      name: "honors_negative_space",
      description: "No refused words / topics / takes / formats.",
      anchor_0: "Uses banned words or formats.",
      anchor_1: "Zero violations.",
      weight: 0.20,
      // Deterministic scan vs negative_space goes here when wired
    },
    {
      name: "confidence_calibration",
      description: "Refuses cleanly when voice confidence is too low.",
      anchor_0: "Drafts confidently on low-signal profile.",
      anchor_1: "Refuses below threshold; drafts above with appropriate confidence.",
      weight: 0.10,
    },
  ],
};

// ---------- Strategist ----------
export const strategistRubric: Rubric = {
  role: "strategist",
  version: "0.1.0",
  dimensions: [
    {
      name: "alignment_to_profile",
      description: "Proposal flows from positioning / ICP / worldview.",
      anchor_0: "Proposal contradicts or ignores existing layers.",
      anchor_1: "Proposal extends current layers coherently.",
      weight: 0.30,
    },
    {
      name: "evidence_cited",
      description: "Every claim grounded in a profile slot or artifact.",
      anchor_0: "No evidence array; assertions only.",
      anchor_1: "Each claim cites a specific profile_slot / voice_sample / external source.",
      weight: 0.25,
      deterministic: (output) => {
        const o = output as { evidence?: unknown[] };
        return Array.isArray(o?.evidence) && o.evidence.length >= 2 ? 1 : 0;
      },
    },
    {
      name: "non_genericness",
      description: "Specific to this user, not a template.",
      anchor_0: "Generic 'be more authentic' advice.",
      anchor_1: "Concrete to this profile's gaps.",
      weight: 0.25,
    },
    {
      name: "refuses_on_low_signal",
      description: "Emits refuses=true when profile is sparse.",
      anchor_0: "Generates confident proposal from empty profile.",
      anchor_1: "Refuses with specific reason citing missing layers.",
      weight: 0.20,
    },
  ],
};

// ---------- Narrative ----------
export const narrativeRubric: Rubric = {
  role: "narrative",
  version: "0.1.0",
  dimensions: [
    {
      name: "specificity",
      description: "Concrete claims, not aspirational hand-waving.",
      anchor_0: "Aspirational + generic.",
      anchor_1: "Sharp, falsifiable, specific.",
      weight: 0.35,
    },
    {
      name: "visible_foils",
      description: "Is the foil — what we're not — explicit?",
      anchor_0: "No foils named.",
      anchor_1: "2-4 specific positions this narrative differentiates from.",
      weight: 0.30,
      deterministic: (output) => {
        const o = output as { visible_foils?: unknown[] };
        return Array.isArray(o?.visible_foils) && o.visible_foils.length >= 2 ? 1 : 0;
      },
    },
    {
      name: "voice_coherence",
      description: "Reads as written by the user.",
      anchor_0: "Generic marketing copy.",
      anchor_1: "Mirrors voice_v2 features.",
      weight: 0.35,
    },
  ],
};

// ---------- Planner ----------
export const plannerRubric: Rubric = {
  role: "planner",
  version: "0.1.0",
  dimensions: [
    {
      name: "cadence_respect",
      description: "Operations within voice cadence preferences.",
      anchor_0: "Schedules 7 LinkedIn posts/day.",
      anchor_1: "Cadence matches archetype + voice prefs.",
      weight: 0.40,
    },
    {
      name: "no_collisions",
      description: "No double-booking; no impossible reschedules.",
      anchor_0: "Multiple posts at same timestamp on same platform.",
      anchor_1: "Clean calendar.",
      weight: 0.30,
      deterministic: (output) => {
        const o = output as { ops?: Array<{ op: string; platform?: string; scheduledAt?: string }> };
        if (!Array.isArray(o?.ops)) return 0;
        const seen = new Set<string>();
        for (const op of o.ops) {
          if ((op.op === "create" || op.op === "move" || op.op === "reschedule") && op.scheduledAt) {
            const k = `${op.platform ?? ""}|${op.scheduledAt}`;
            if (seen.has(k)) return 0;
            seen.add(k);
          }
        }
        return 1;
      },
    },
    {
      name: "platform_fit",
      description: "Content type matches platform conventions.",
      anchor_0: "Long-form essay queued for X.",
      anchor_1: "Format matches platform.",
      weight: 0.30,
    },
  ],
};

// ---------- Onboarder ----------
export const onboarderRubric: Rubric = {
  role: "onboarder",
  version: "0.1.0",
  dimensions: [
    {
      name: "slot_coverage",
      description: "Fills required profile slots over the run.",
      anchor_0: "Required slots remain empty after 25+ turns.",
      anchor_1: "All required slots above confidence threshold within 20 turns.",
      weight: 0.35,
    },
    {
      name: "adaptivity",
      description: "Drills into vague answers instead of moving on.",
      anchor_0: "Accepts surface answers; never probes.",
      anchor_1: "Drills with sharper question on vague reply.",
      weight: 0.30,
    },
    {
      name: "stop_condition_respect",
      description: "Knows when enough is enough.",
      anchor_0: "Continues past leverage threshold; perseverates.",
      anchor_1: "Wraps on coverage_complete cleanly.",
      weight: 0.20,
    },
    {
      name: "informed_opener",
      description: "Uses ingest snapshot in opening turns.",
      anchor_0: "Opens with blank-canvas form questions.",
      anchor_1: "Opens with 'I read your stuff — confirm X' grounded in ingest.",
      weight: 0.15,
    },
  ],
};

// ---------- Voice extractor ----------
export const voiceExtractorRubric: Rubric = {
  role: "voice_extractor",
  version: "0.1.0",
  dimensions: [
    {
      name: "calibration",
      description: "Round-trip: Ghostwriter using extracted features produces drafts rated ≥4/5 'sounds like me'.",
      anchor_0: "Drafts produced from extracted features sound generic.",
      anchor_1: "Drafts produced from extracted features score ≥4 on Muzamil round-trip.",
      weight: 0.40,
    },
    {
      name: "signature_word_recognition",
      description: "Top-N signature words are recognizable to the user.",
      anchor_0: "Top-10 signature words are common English filler.",
      anchor_1: "Top-10 signature words include user's recognizable lexicon.",
      weight: 0.30,
    },
    {
      name: "confidence_distribution",
      description: "Per-field confidence varies; not all 1.0 or all 0.0.",
      anchor_0: "All fields report identical confidence.",
      anchor_1: "Confidence varies meaningfully across fields based on signal density.",
      weight: 0.15,
      deterministic: (output) => {
        const o = output as { profile_patch?: { ops?: Array<{ patch?: { confidence?: number } }> } };
        const confs = o?.profile_patch?.ops?.map((op) => op?.patch?.confidence).filter((c): c is number => typeof c === "number") ?? [];
        if (confs.length < 2) return 0.5;
        const variance = confs.reduce((acc, c) => acc + Math.abs(c - confs[0]!), 0) / confs.length;
        return variance > 0.05 ? 1 : 0;
      },
    },
    {
      name: "refuses_on_thin_samples",
      description: "Refuses cleanly when given < 10 samples.",
      anchor_0: "Generates confident features from 2 samples.",
      anchor_1: "Refuses with explicit sample-count reason.",
      weight: 0.15,
    },
  ],
};

// ---------- Registry ----------
export const RUBRICS: Record<string, Rubric> = {
  ghostwriter: ghostwriterRubric,
  strategist: strategistRubric,
  narrative: narrativeRubric,
  planner: plannerRubric,
  onboarder: onboarderRubric,
  voice_extractor: voiceExtractorRubric,
};

export function getRubric(role: AgentRole): Rubric | undefined {
  return RUBRICS[role];
}
