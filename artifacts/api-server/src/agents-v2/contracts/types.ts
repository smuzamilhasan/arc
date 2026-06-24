// Core types for the v2 agent framework.
//
// Design principles (see docs/v2/architecture.md + docs/v2/prds/agent-contracts.md):
//   - Typed input/output schemas per agent (Zod)
//   - Role contracts with allowed/forbidden actions
//   - Deterministic context curation
//   - Refusal is a first-class outcome
//   - Contract violations caught at runtime, not by trusting the LLM

import type { z } from "zod/v4";

// Canonical agent role names. Adding a role here requires registering a contract.
export const AGENT_ROLES = [
  "onboarder",
  "voice_extractor",
  "strategist",
  "narrative",
  "planner",
  "ghostwriter",
  "investigator",
  "manager",
  "evaluator",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

// A single key the curator can include in an agent's input ProfileContext.
export type ContextKey =
  | "identity"
  | "positioning"
  | "icp"
  | "voice"
  | "voice_samples"
  | "narrative"
  | "worldview"
  | "stories"
  | "references"
  | "negative_space"
  | "anti_examples"
  | "audit"
  | "industry_overview"
  | "platforms"
  | "content_strategy"
  | "recent_drafts"
  | "calendar_window";

export type ContextRequirement = {
  key: ContextKey;
  // soft cap; curator may truncate to fit. Bytes, not tokens — token estimation is per-agent.
  max_bytes?: number;
  // required → curator throws if the slice is empty; otherwise returns undefined.
  required?: boolean;
};

// AgentResult: union of success, refusal, and contract violation outcomes.
// Refusal is a first-class outcome — agents trained to refuse when signal is thin.
export type AgentResult<O> =
  | { kind: "ok"; output: O; rubric_score?: RubricScore; tokens_used?: number; latency_ms?: number }
  | { kind: "refused"; reason: string; details?: Record<string, unknown> }
  | { kind: "contract_violation"; details: string; raw_output?: unknown };

export type RubricScore = {
  rubric: string;
  dimensions: Record<string, { score: number; reasoning?: string }>;
  overall: number;
  fixture_id?: string;
};

export type RunOptions = {
  // Run the evaluator agent after the main call and attach rubric_score.
  withEval?: boolean;
  // Override default model for this call. Used by eval harness for A/B.
  model?: string;
  // Hard token cap. Forces refusal if would exceed.
  maxTokens?: number;
  // Identifier for tracing across multi-agent flows.
  traceId?: string;
};

// Evidence reference — every claim an agent makes should cite back to a source.
export type EvidenceRef =
  | { kind: "profile_slot"; layer: string; field: string }
  | { kind: "voice_sample"; sample_id: number }
  | { kind: "story_bank"; story_id: number }
  | { kind: "reference_library"; reference_id: number }
  | { kind: "external"; url: string; quote?: string };

// Helper: extract the inferred input/output types from a contract.
export type InferContractInput<C> = C extends { input_schema: z.ZodSchema<infer I> } ? I : never;
export type InferContractOutput<C> = C extends { output_schema: z.ZodSchema<infer O> } ? O : never;
