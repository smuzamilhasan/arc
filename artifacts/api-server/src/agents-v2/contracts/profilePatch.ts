// ProfilePatch — the typed mutation surface for v2 profile layers.
//
// Agents NEVER write to the DB directly. They emit ProfilePatch operations,
// which the AgentRunner validates and applies through the typed accessors.
// This is what makes role-lock enforceable: Ghostwriter's output type literally
// cannot include a ProfilePatch.

import { z } from "zod/v4";
import {
  positioningV2Schema,
  icpV2Schema,
  voiceV2Schema,
  worldviewV2Schema,
  negativeSpaceV2Schema,
} from "@workspace/db";

// Each patch operation targets one layer. Partial-typed: agents emit only the
// fields they intend to change; accessors merge with the existing layer.

export const positioningPatchSchema = z.object({
  op: z.literal("positioning_patch"),
  patch: positioningV2Schema.partial(),
  rationale: z.string(),
});

export const icpPatchSchema = z.object({
  op: z.literal("icp_patch"),
  patch: icpV2Schema.partial(),
  rationale: z.string(),
});

export const voicePatchSchema = z.object({
  op: z.literal("voice_patch"),
  patch: voiceV2Schema.partial(),
  rationale: z.string(),
});

export const worldviewPatchSchema = z.object({
  op: z.literal("worldview_patch"),
  patch: worldviewV2Schema.partial(),
  rationale: z.string(),
});

export const negativeSpacePatchSchema = z.object({
  op: z.literal("negative_space_patch"),
  patch: negativeSpaceV2Schema.partial(),
  rationale: z.string(),
});

// Story bank, reference library, anti-examples — appends rather than partial patches.

export const storyAppendSchema = z.object({
  op: z.literal("story_append"),
  summary: z.string().min(1),
  body: z.string().min(1),
  themes: z.array(z.string()).default([]),
  source_sample_ids: z.array(z.number().int()).default([]),
  status: z.enum(["candidate", "confirmed"]).default("candidate"),
});

export const referenceAppendSchema = z.object({
  op: z.literal("reference_append"),
  kind: z.enum(["person", "book", "framework", "event", "company", "concept"]),
  label: z.string().min(1),
  context: z.string().default(""),
  source_sample_ids: z.array(z.number().int()).default([]),
  status: z.enum(["candidate", "confirmed"]).default("candidate"),
});

export const antiExampleAppendSchema = z.object({
  op: z.literal("anti_example_append"),
  sample_text: z.string().min(1),
  why_not_this_voice: z.string().default(""),
  source_url: z.string().url().nullable().optional(),
});

export const profilePatchOpSchema = z.discriminatedUnion("op", [
  positioningPatchSchema,
  icpPatchSchema,
  voicePatchSchema,
  worldviewPatchSchema,
  negativeSpacePatchSchema,
  storyAppendSchema,
  referenceAppendSchema,
  antiExampleAppendSchema,
]);
export type ProfilePatchOp = z.infer<typeof profilePatchOpSchema>;

export const profilePatchSchema = z.object({
  client_id: z.number().int(),
  ops: z.array(profilePatchOpSchema).min(1),
  // Aggregate confidence across the patch. Below 0.4 → onboarder probes again
  // rather than committing.
  confidence: z.number().min(0).max(1),
  // For audit / debug — which agent produced this patch.
  produced_by: z.string(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
