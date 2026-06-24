// VoiceExtractor — first concrete RoleContract on the v2 framework.
//
// Reads samples + existing profile; emits a typed ProfilePatch covering voice
// features, story candidates, reference candidates, worldview hypotheses.
//
// Pipeline (see docs/v2/prds/voice-extraction.md):
//   1. Deterministic pass (cheap, reproducible)
//   2. LLM pass — voice features (signature moves, formality, description)
//   3. LLM pass — story bank candidates
//   4. LLM pass — reference library candidates
//   5. LLM pass — worldview hypotheses
//
// This contract represents the OUTER agent — the single LLM-facing role with
// typed I/O. The internal multi-pass pipeline lives in `./pipeline.ts` so the
// runner sees one clean RoleContract.

import { z } from "zod/v4";
import type { RoleContract } from "../../contracts/roleContract";
import { voiceExtractorOutputSchema } from "../../contracts/outputs";
import type { VoiceExtractorOutput } from "../../contracts/outputs";

export const voiceExtractorInputSchema = z.object({
  client_id: z.number().int(),
  samples: z
    .array(
      z.object({
        id: z.number().int(),
        platform: z.string().nullable(),
        content: z.string().min(1),
        published_at: z.string().nullable().optional(),
      })
    )
    .min(1),
  existing_voice: z.unknown().optional(), // Existing voice_v2 layer for incremental updates
  existing_negative_space: z.unknown().optional(),
  deterministic_features: z.unknown(), // DeterministicVoiceOutput passed by pipeline
});
export type VoiceExtractorInput = z.infer<typeof voiceExtractorInputSchema>;

const MIN_SAMPLES_FOR_CONFIDENCE = 10;

export const voiceExtractorContract: RoleContract<VoiceExtractorInput, VoiceExtractorOutput> = {
  name: "voice_extractor",
  job: "Distill structured voice features, story candidates, references, and worldview hypotheses from real voice samples.",
  version: "0.1.0",

  allowed_actions: [
    "Emit voice_patch operations with sentence_stats, lexicon, punctuation, signature_moves, formality",
    "Emit story_append operations as candidates with source_sample_ids cited",
    "Emit reference_append operations as candidates with source_sample_ids cited",
    "Emit worldview hypotheses with evidence_sample_ids cited",
    "Refuse with refusal_reason when sample count or signal density is insufficient",
  ],
  forbidden_actions: [
    "Decide positioning, ICP, or strategic direction",
    "Draft user-facing content (posts, captions, narrative copy)",
    "Modify the calendar or emit calendar operations",
    "Invent stories, references, or beliefs without evidence_sample_ids",
    "Emit confidence > 0.7 with fewer than 10 evidence samples",
  ],
  escalates_to: "strategist",

  input_schema: voiceExtractorInputSchema,
  output_schema: voiceExtractorOutputSchema,

  context_requirements: [
    { key: "voice_samples", required: true },
    { key: "voice", required: false },
    { key: "negative_space", required: false },
  ],

  refusal_reasons: [
    "Fewer than 10 voice samples available",
    "Samples are too short (median < 50 words) to support feature extraction",
    "Sample variance suggests ghostwriting from multiple authors",
    "Negative space conflicts with prevalent lexicon (manual review needed)",
  ],

  default_model: "gpt-4o-2024-08-06",
  default_temperature: 0.2,
  enforce_structured_output: true,

  system_prompt: (input) => {
    const sampleCount = input.samples.length;
    return [
      `You have ${sampleCount} voice samples from one user.`,
      ``,
      `Your job: emit a ProfilePatch that captures their voice as STRUCTURED FEATURES, with `,
      `every claim backed by evidence_sample_ids from the input.`,
      ``,
      `Hard rules:`,
      `  - If sampleCount < ${MIN_SAMPLES_FOR_CONFIDENCE}, refuse.`,
      `  - Every story_append and reference_append MUST cite source_sample_ids.`,
      `  - Voice description (if emitted) must reference observable patterns, not adjectives.`,
      `  - Story candidates are SUMMARIES of stories the user has actually told, not invented anecdotes.`,
      `  - Reference candidates are names/concepts the user has actually cited, not aspirational.`,
      ``,
      `Output a profile_patch with the operations needed. Set the patch confidence to your`,
      `aggregate confidence across operations.`,
    ].join("\n");
  },

  assert_no_violations: (output, input) => {
    if (output.refuses) return [];
    const violations: string[] = [];
    const patch = output.profile_patch;
    // Story / reference appends must cite samples.
    for (const op of patch.ops) {
      if (op.op === "story_append" && op.source_sample_ids.length === 0) {
        violations.push("story_append without source_sample_ids");
      }
      if (op.op === "reference_append" && op.source_sample_ids.length === 0) {
        violations.push("reference_append without source_sample_ids");
      }
    }
    // Confidence floor relative to sample count.
    if (input.samples.length < MIN_SAMPLES_FOR_CONFIDENCE && output.confidence > 0.5) {
      violations.push(
        `Confidence ${output.confidence} too high for ${input.samples.length} samples (max 0.5 below ${MIN_SAMPLES_FOR_CONFIDENCE} samples)`
      );
    }
    return violations;
  },
};
