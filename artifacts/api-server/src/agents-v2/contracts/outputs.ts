// Per-agent typed output schemas.
//
// These are what agents PRODUCE. Each one is checked against its schema before
// being trusted. Structural validation + assert_no_violations together enforce
// role boundaries.

import { z } from "zod/v4";
import { profilePatchSchema } from "./profilePatch";

// ---------- Evidence ----------

const evidenceRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("profile_slot"), layer: z.string(), field: z.string() }),
  z.object({ kind: z.literal("voice_sample"), sample_id: z.number().int() }),
  z.object({ kind: z.literal("story_bank"), story_id: z.number().int() }),
  z.object({ kind: z.literal("reference_library"), reference_id: z.number().int() }),
  z.object({ kind: z.literal("external"), url: z.string().url(), quote: z.string().optional() }),
]);

const refusalShape = {
  refuses: z.literal(true),
  refusal_reason: z.string().min(1),
} as const;

// ---------- Strategist ----------

export const strategyProposalSchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    scope: z.enum(["positioning", "icp", "values", "narrative_direction"]),
    rationale: z.string().min(1),
    patch: profilePatchSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(evidenceRefSchema).min(1),
  }),
  z.object(refusalShape),
]);
export type StrategyProposal = z.infer<typeof strategyProposalSchema>;

// ---------- Ghostwriter ----------

export const voiceEvidenceSchema = z.object({
  style_anchors: z.array(evidenceRefSchema).min(1),
  story_anchor: evidenceRefSchema.optional(),
  reference_anchors: z.array(evidenceRefSchema).default([]),
});

export const contentDraftSchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    platform: z.enum(["linkedin", "x", "newsletter", "youtube_caption", "blog"]),
    body: z.string().min(1),
    voice_evidence: voiceEvidenceSchema,
    honors_negative_space: z.literal(true),
    confidence: z.number().min(0).max(1),
  }),
  z.object(refusalShape),
]);
export type ContentDraft = z.infer<typeof contentDraftSchema>;

// ---------- Narrative ----------

export const narrativeDraftSchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    core_narrative: z.string().min(1),
    point_of_view: z.string().min(1),
    themes: z.array(z.string()).min(1),
    visible_foils: z.array(z.string()).min(1).describe("Generic narratives this is distinct from"),
    voice_coherence_note: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  z.object(refusalShape),
]);
export type NarrativeDraft = z.infer<typeof narrativeDraftSchema>;

// ---------- Planner ----------

const calendarOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    platform: z.string(),
    scheduledAt: z.string().datetime(),
    draftRef: z.string().nullable().optional(),
  }),
  z.object({
    op: z.literal("move"),
    postId: z.number().int(),
    scheduledAt: z.string().datetime(),
  }),
  z.object({
    op: z.literal("delete"),
    postId: z.number().int(),
  }),
  z.object({
    op: z.literal("reschedule"),
    postId: z.number().int(),
    reason: z.string(),
    scheduledAt: z.string().datetime(),
  }),
]);
export type CalendarOp = z.infer<typeof calendarOpSchema>;

export const plannerOutputSchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    ops: z.array(calendarOpSchema).min(1),
    rationale: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  z.object(refusalShape),
]);
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// ---------- Voice extractor ----------

export const voiceExtractorOutputSchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    profile_patch: profilePatchSchema,
    sample_count: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
  }),
  z.object(refusalShape),
]);
export type VoiceExtractorOutput = z.infer<typeof voiceExtractorOutputSchema>;

// ---------- Onboarder ----------

export const onboarderTurnSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    question_type: z.enum(["confirm", "drill", "probe", "verify"]),
    target_slot: z.string(),
    prompt_text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("patch"),
    patch: profilePatchSchema,
  }),
  z.object({
    kind: z.literal("wrap"),
    reason: z.enum(["coverage_complete", "perseveration", "user_paused"]),
    summary: z.string(),
  }),
]);
export type OnboarderTurn = z.infer<typeof onboarderTurnSchema>;

// ---------- Investigator ----------

export const researchSummarySchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    findings: z
      .array(
        z.object({
          claim: z.string(),
          sources: z
            .array(z.object({ url: z.string().url(), quote: z.string().optional() }))
            .min(1),
        })
      )
      .min(1),
    foils: z.array(z.string()).default([]).describe("Generic / competitor positions to differentiate from"),
    confidence: z.number().min(0).max(1),
  }),
  z.object(refusalShape),
]);
export type ResearchSummary = z.infer<typeof researchSummarySchema>;

// ---------- Manager ----------

export const planStepSchema = z.object({
  agent: z.string(),
  reason: z.string(),
  inputs_ref: z.string(),
  depends_on: z.array(z.number().int()).default([]),
});

export const planSchema = z.discriminatedUnion("refuses", [
  z.object({
    refuses: z.literal(false),
    steps: z.array(planStepSchema).min(1),
    rationale: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  z.object(refusalShape),
]);
export type Plan = z.infer<typeof planSchema>;

// ---------- Evaluator ----------

export const rubricScoreSchema = z.object({
  rubric: z.string(),
  fixture_id: z.string(),
  dimensions: z.record(
    z.string(),
    z.object({
      score: z.number().min(0).max(1),
      reasoning: z.string().optional(),
    })
  ),
  overall: z.number().min(0).max(1),
});
export type RubricScoreShape = z.infer<typeof rubricScoreSchema>;
