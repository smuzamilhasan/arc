// Profile v2 — structured layers stored as JSONB columns on client_profile.
//
// These are ADDITIVE: v1 services keep reading their existing string fields.
// v2 agents read these typed layers via accessors in `./accessors.ts`.
//
// Each layer is validated by Zod on write. JSONB columns hold the parsed shape.
//
// See docs/v2/prds/profile-schema-v2.md for the design.

import { z } from "zod/v4";

// ---------- Positioning ----------

export const proofPointSchema = z.object({
  kind: z.enum(["achievement", "result", "artifact", "talk", "press", "outcome"]),
  label: z.string().min(1),
  evidence_url: z.string().url().nullable().optional(),
  metric: z.string().nullable().optional(),
});
export type ProofPoint = z.infer<typeof proofPointSchema>;

export const positioningV2Schema = z.object({
  claim: z.string().min(1).describe("The one sentence positioning"),
  category: z.string().nullable().optional().describe("The space/category they play in"),
  unique_mechanism: z.string().nullable().optional().describe("Their signature framework/methodology"),
  wedge: z.string().nullable().optional().describe("The sharpest entry point"),
  defensibility: z.string().describe("Why this claim is defensible for this user specifically"),
  adjacent_claims_rejected: z.array(z.string()).default([]).describe("Nearby claims this user explicitly does NOT make"),
  proof_points: z.array(proofPointSchema).default([]),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type PositioningV2 = z.infer<typeof positioningV2Schema>;

// ---------- ICP ----------

export const icpArchetypeSchema = z.object({
  label: z.string().min(1),
  jobs_to_be_done: z.array(z.string()).default([]),
  watering_holes: z.array(z.string()).default([]),
  what_they_read: z.array(z.string()).default([]),
  where_they_get_stuck: z.array(z.string()).default([]),
  pains: z.array(z.string()).default([]),
  desires: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  buying_triggers: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(5).default(3),
});
export type IcpArchetype = z.infer<typeof icpArchetypeSchema>;

export const icpV2Schema = z.object({
  archetypes: z.array(icpArchetypeSchema).default([]),
  secondary_audiences: z.array(z.string()).default([]),
  estimated_tam: z.string().nullable().optional(),
  disqualifications: z.array(z.string()).default([]).describe("Who this is NOT for"),
  confidence: z.number().min(0).max(1).default(0),
  last_updated: z.string().datetime().optional(),
});
export type IcpV2 = z.infer<typeof icpV2Schema>;

// ---------- Voice ----------
// Structured voice features. Populated by voice extraction agent.

export const sentenceStatsSchema = z.object({
  avg_len: z.number().nonnegative(),
  p90_len: z.number().nonnegative(),
  declarative_ratio: z.number().min(0).max(1),
  question_ratio: z.number().min(0).max(1),
  imperative_ratio: z.number().min(0).max(1).default(0),
  fragment_ratio: z.number().min(0).max(1).default(0),
});
export type SentenceStats = z.infer<typeof sentenceStatsSchema>;

export const lexiconSchema = z.object({
  signature_words: z.array(z.string()).default([]).describe("High-IDF terms this user uses distinctively"),
  avoided_words: z.array(z.string()).default([]).describe("Terms this user rarely or never uses"),
  banned_phrases: z.array(z.string()).default([]).describe("Terms the user has explicitly banned"),
});
export type Lexicon = z.infer<typeof lexiconSchema>;

export const punctuationSignatureSchema = z.object({
  em_dash_density: z.number().min(0),
  colon_use: z.number().min(0),
  ellipsis_use: z.number().min(0),
  exclamation_density: z.number().min(0).default(0),
});
export type PunctuationSignature = z.infer<typeof punctuationSignatureSchema>;

export const signatureMoveSchema = z.object({
  pattern: z.string().describe("e.g. 'opens with contrarian framing', 'ends with rhetorical question'"),
  frequency: z.number().min(0).max(1),
  examples_sample_ids: z.array(z.number().int()).default([]),
});
export type SignatureMove = z.infer<typeof signatureMoveSchema>;

export const voiceV2Schema = z.object({
  sentence_stats: sentenceStatsSchema.optional(),
  lexicon: lexiconSchema.optional(),
  punctuation: punctuationSignatureSchema.optional(),
  signature_moves: z.array(signatureMoveSchema).default([]),
  formality: z.number().min(0).max(1).optional(),
  description: z.string().optional().describe("LLM-written voice description, secondary to features"),
  // Qualitative style (extracted or confirmed in onboarding).
  tone_descriptors: z.array(z.string()).default([]),
  humor_style: z.string().nullable().optional(),
  emotional_register: z.string().nullable().optional(),
  pov: z.string().nullable().optional().describe("e.g. first-person, we, instructional"),
  reading_level: z.string().nullable().optional(),
  language: z.string().nullable().optional().describe("content language, e.g. English, Urdu"),
  script: z.string().nullable().optional().describe("e.g. latin, roman_urdu, devanagari"),
  confidence: z.number().min(0).max(1).default(0).describe("Aggregate confidence; Ghostwriter refuses below threshold"),
  sample_count: z.number().int().nonnegative().default(0),
  last_extracted_at: z.string().datetime().optional(),
});
export type VoiceV2 = z.infer<typeof voiceV2Schema>;

// ---------- Worldview ----------

export const worldviewBeliefSchema = z.object({
  claim: z.string().min(1),
  why_held: z.string(),
  where_it_shows_up: z.array(z.string()).default([]).describe("Topics / contexts where this belief surfaces"),
  confidence: z.number().min(0).max(1).default(0),
  evidence_sample_ids: z.array(z.number().int()).default([]),
});
export type WorldviewBelief = z.infer<typeof worldviewBeliefSchema>;

export const worldviewV2Schema = z.object({
  beliefs: z.array(worldviewBeliefSchema).default([]).describe("3-7 non-negotiable beliefs"),
  thesis: z.string().nullable().optional().describe("The big idea everything ladders up to"),
  contrarian_takes: z.array(z.string()).default([]),
  values: z.array(z.string()).default([]),
  mission: z.string().nullable().optional().describe("North star / the change they want"),
  last_updated: z.string().datetime().optional(),
});
export type WorldviewV2 = z.infer<typeof worldviewV2Schema>;

// ---------- Negative space ----------

export const negativeSpaceV2Schema = z.object({
  refused_topics: z.array(z.string()).default([]),
  refused_words: z.array(z.string()).default([]),
  refused_takes: z.array(z.string()).default([]).describe("Specific positions the user refuses to take"),
  refused_formats: z.array(z.string()).default([]).describe("e.g. 'no engagement-bait hooks', 'no listicles'"),
  last_updated: z.string().datetime().optional(),
});
export type NegativeSpaceV2 = z.infer<typeof negativeSpaceV2Schema>;

// ---------- Aggregate ----------

export const profileV2LayersSchema = z.object({
  positioning_v2: positioningV2Schema.nullable().optional(),
  icp_v2: icpV2Schema.nullable().optional(),
  voice_v2: voiceV2Schema.nullable().optional(),
  worldview_v2: worldviewV2Schema.nullable().optional(),
  negative_space_v2: negativeSpaceV2Schema.nullable().optional(),
});
export type ProfileV2Layers = z.infer<typeof profileV2LayersSchema>;
