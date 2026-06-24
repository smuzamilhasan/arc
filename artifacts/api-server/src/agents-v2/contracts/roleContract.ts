// RoleContract — the typed interface every v2 agent declares.
//
// The contract is the agent. The implementation (system prompt, LLM call) is a
// detail. Anything the system needs to know about an agent — what it consumes,
// what it produces, what it's allowed to do, how it's evaluated — lives here.

import type { z } from "zod/v4";
import type {
  AgentRole,
  ContextRequirement,
  RubricScore,
  EvidenceRef,
} from "./types";

export interface RoleContract<TInput, TOutput> {
  // Identity ---------------------------------------------------------------
  name: AgentRole;
  /** One sentence — the agent's job. Loaded into the system prompt header. */
  job: string;
  /** Bump when the contract changes in a breaking way. Used by the eval cache. */
  version: string;

  // Role boundaries --------------------------------------------------------
  /** What this agent IS allowed to do. Shown to the model in the prompt. */
  allowed_actions: string[];
  /**
   * What this agent IS NOT allowed to do. Shown to the model in the prompt
   * AND enforced post-output by `assert_no_violations`.
   */
  forbidden_actions: string[];
  /** Where work goes when the agent encounters a forbidden action. */
  escalates_to?: AgentRole;

  // I/O contracts ----------------------------------------------------------
  input_schema: z.ZodSchema<TInput>;
  output_schema: z.ZodSchema<TOutput>;

  /** What slices of profile context this agent needs. Curator reads this. */
  context_requirements: ContextRequirement[];

  // Behavior ---------------------------------------------------------------
  /**
   * Build the system prompt from the typed input. Pure function — no I/O.
   * The prompt MUST include `job`, `allowed_actions`, `forbidden_actions`,
   * and `refusal_reasons` so the model knows the contract.
   */
  system_prompt: (input: TInput) => string;

  /**
   * Valid reasons for the agent to refuse (low signal, contradiction, etc.).
   * Surfaced in the prompt. Refusal is a first-class outcome.
   */
  refusal_reasons: string[];

  /**
   * Optional post-output checker. Runs after schema validation. Returns
   * non-empty array of violation descriptions to mark the result as
   * `contract_violation`.
   *
   * Use for invariants the type system can't encode (e.g. "ContentDraft must
   * cite at least one voice_evidence anchor", "StrategyProposal evidence list
   * must reference at least one profile slot").
   */
  assert_no_violations?: (output: TOutput, input: TInput) => string[];

  /**
   * Optional self-rubric score (in-context). Used during the eval harness to
   * grade outputs against rubric anchors specific to this role.
   */
  rubric?: RubricScore extends infer R ? R extends { rubric: string } ? string : never : never;

  // LLM defaults -----------------------------------------------------------
  /** Default model for this agent. Overridable per-run. */
  default_model: string;
  /** Default temperature. */
  default_temperature: number;
  /** Whether to enforce structured output via the provider's JSON-schema mode. */
  enforce_structured_output: true;
}

export type AnyRoleContract = RoleContract<unknown, unknown>;

// Helper: shape the prompt header from contract metadata so every agent shares
// the same role-lock framing.
export function renderContractHeader(contract: AnyRoleContract): string {
  const allowed = contract.allowed_actions.map((a) => `  • ${a}`).join("\n");
  const forbidden = contract.forbidden_actions.map((a) => `  • ${a}`).join("\n");
  const refusal = contract.refusal_reasons.map((r) => `  • ${r}`).join("\n");
  const escalate = contract.escalates_to
    ? `\nWhen work crosses your boundary, escalate to: ${contract.escalates_to}.\n`
    : "";
  return [
    `You are the ${contract.name} agent.`,
    `Your job: ${contract.job}`,
    "",
    "You ARE allowed to:",
    allowed,
    "",
    "You are FORBIDDEN to:",
    forbidden,
    escalate,
    "Refuse explicitly (emit refuses=true with a reason) when:",
    refusal,
    "",
    "Refusing is not failure. Producing a confident answer on thin signal IS failure.",
    "",
  ].join("\n");
}

// Helper: stub for evidence enforcement. Concrete contracts pass a per-output
// projector returning the evidence list to verify it's non-empty.
export function requireEvidence<O>(
  output: O,
  project: (o: O) => EvidenceRef[] | undefined
): string[] {
  const ev = project(output);
  if (!ev || ev.length === 0) {
    return ["Output missing required evidence references — refused over empty assertion."];
  }
  return [];
}
