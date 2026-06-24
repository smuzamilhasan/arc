// Ghostwriter v1 — baseline adapter for the eval harness.
//
// Wraps services/ghostwriter.ts (the v1 implementation) behind a RoleContract
// so the eval harness can run v1 + v2 against the same fixtures and rubric.
// This adapter is NOT a product path — the UI never calls it. It exists to
// produce baseline numbers for the "v2 must beat v1 by ≥20%" gate.
//
// Important: this adapter accepts the SAME input shape as v2 ghostwriter but
// translates to v1's flat-string voice/material model on its way in, and
// converts v1's free-text draft to a ContentDraft shape with EMPTY
// voice_evidence on its way out. The empty voice_evidence is intentional —
// v1 cannot cite samples it never sees. The rubric's `story_anchored`
// deterministic check correctly scores this as 0, which is the truth.

import { z } from "zod/v4";
import type { RoleContract } from "../../contracts/roleContract";
import { contentDraftSchema, type ContentDraft } from "../../contracts/outputs";
import { ghostwriterInputSchema, type GhostwriterInput } from "../ghostwriter/contract";

// Same input shape as v2 so fixtures feed the same data to both.
export type GhostwriterV1AdapterInput = GhostwriterInput;

// The contract's system_prompt is unused (the pipeline calls v1's draftContent
// directly), but we still declare one to satisfy the RoleContract interface.
// The eval runner will use this contract object purely as metadata.

export const ghostwriterV1AdapterContract: RoleContract<
  GhostwriterV1AdapterInput,
  ContentDraft
> = {
  name: "ghostwriter_v1",
  job: "Baseline wrapper around the v1 ghostwriter service for eval comparison.",
  version: "0.1.0-baseline",

  allowed_actions: [
    "Emit a ContentDraft translated from v1 draftContent output",
    "Refuse with refusal_reason if v1 produces zero drafts",
  ],
  forbidden_actions: [
    "Be exposed to users (this is an eval-only path)",
    "Modify the profile (v1 ghostwriter never did, neither does this adapter)",
  ],

  input_schema: ghostwriterInputSchema,
  output_schema: contentDraftSchema,

  context_requirements: [
    { key: "identity", required: true },
    { key: "positioning", required: false },
    { key: "voice", required: false },
    { key: "voice_samples", required: false },
    { key: "negative_space", required: false },
  ],

  refusal_reasons: [
    "v1 ghostwriter returned zero drafts",
    "v1 ghostwriter call failed",
  ],

  default_model: "n/a", // v1 picks its own model internally
  default_temperature: 0, // n/a — v1 controls
  enforce_structured_output: true,

  system_prompt: () =>
    "Adapter contract — v1 ghostwriter is called by the pipeline, not by this prompt.",

  // No semantic post-checks beyond schema validation. v1 outputs may legitimately
  // fail the deterministic rubric checks (no story_anchor, refused words may
  // slip through) — that's the BASELINE we want to measure, not a violation.
  // The rubric scoring catches the quality gap; treating it as a contract
  // violation here would just hide the baseline.
};
