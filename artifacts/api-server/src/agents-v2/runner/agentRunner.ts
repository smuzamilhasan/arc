// AgentRunner — wraps every LLM call with contract enforcement.
//
// Pipeline:
//   1. Validate input against contract.input_schema
//   2. Build system prompt via contract.system_prompt(input)
//   3. Call the LLM with structured-output enforcement
//   4. Validate raw output against contract.output_schema
//   5. Run contract.assert_no_violations(output, input) — semantic post-checks
//   6. (Optional) run evaluator agent and attach rubric_score
//   7. Return typed AgentResult
//
// The runner is the single chokepoint where role-lock is enforced. No agent
// implementation bypasses this layer.

import type { z } from "zod/v4";
import type { RoleContract, AnyRoleContract } from "../contracts/roleContract";
import { renderContractHeader } from "../contracts/roleContract";
import type { AgentResult, RunOptions } from "../contracts/types";

// LLM client abstraction — concrete implementations live alongside provider
// adapters (openai, anthropic). The runner only needs structured-output
// enforcement; the rest is implementation detail.
export interface StructuredLLMClient {
  generate<O>(args: {
    system_prompt: string;
    user_prompt?: string;
    output_schema: z.ZodSchema<O>;
    model: string;
    temperature: number;
    max_tokens?: number;
  }): Promise<{
    output: O;
    tokens_used: number;
    latency_ms: number;
  }>;
}

export type AgentRunnerDeps = {
  llm: StructuredLLMClient;
  evaluator?: EvaluatorHook;
  // Hook for tracing each call (Sentry, Honeycomb, console, etc.)
  onTrace?: (event: TraceEvent) => void;
};

export type EvaluatorHook = (args: {
  contract: AnyRoleContract;
  input: unknown;
  output: unknown;
  traceId?: string;
}) => Promise<import("../contracts/types").RubricScore | undefined>;

export type TraceEvent =
  | { type: "validate_input"; traceId?: string; ok: boolean; error?: string }
  | { type: "llm_call"; traceId?: string; model: string; system_prompt_chars: number }
  | { type: "validate_output"; traceId?: string; ok: boolean; error?: string }
  | { type: "violations"; traceId?: string; violations: string[] }
  | { type: "result"; traceId?: string; kind: AgentResult<unknown>["kind"]; tokens_used?: number; latency_ms?: number };

export class AgentRunner<TInput, TOutput> {
  constructor(
    private contract: RoleContract<TInput, TOutput>,
    private deps: AgentRunnerDeps
  ) {}

  async run(rawInput: unknown, opts: RunOptions = {}): Promise<AgentResult<TOutput>> {
    const { contract, deps } = this;
    const trace = deps.onTrace ?? (() => {});

    // 1. Input validation -------------------------------------------------
    let input: TInput;
    try {
      input = contract.input_schema.parse(rawInput);
      trace({ type: "validate_input", traceId: opts.traceId, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      trace({ type: "validate_input", traceId: opts.traceId, ok: false, error });
      return {
        kind: "contract_violation",
        details: `Input failed schema validation: ${error}`,
      };
    }

    // 2. Build prompt -----------------------------------------------------
    const header = renderContractHeader(contract as AnyRoleContract);
    const system_prompt = `${header}\n${contract.system_prompt(input)}`;

    // 3. LLM call ---------------------------------------------------------
    trace({
      type: "llm_call",
      traceId: opts.traceId,
      model: opts.model ?? contract.default_model,
      system_prompt_chars: system_prompt.length,
    });

    let rawOutput: TOutput;
    let tokens_used = 0;
    let latency_ms = 0;
    try {
      const result = await deps.llm.generate<TOutput>({
        system_prompt,
        output_schema: contract.output_schema,
        model: opts.model ?? contract.default_model,
        temperature: contract.default_temperature,
        max_tokens: opts.maxTokens,
      });
      rawOutput = result.output;
      tokens_used = result.tokens_used;
      latency_ms = result.latency_ms;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        kind: "contract_violation",
        details: `LLM call failed or returned malformed output: ${error}`,
      };
    }

    // 4. Output schema validation ----------------------------------------
    let output: TOutput;
    try {
      output = contract.output_schema.parse(rawOutput);
      trace({ type: "validate_output", traceId: opts.traceId, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      trace({ type: "validate_output", traceId: opts.traceId, ok: false, error });
      return {
        kind: "contract_violation",
        details: `Output failed schema validation: ${error}`,
        raw_output: rawOutput,
      };
    }

    // 5. Refusal short-circuit -------------------------------------------
    if (isRefusal(output)) {
      const reason = (output as { refusal_reason: string }).refusal_reason;
      trace({ type: "result", traceId: opts.traceId, kind: "refused" });
      return { kind: "refused", reason };
    }

    // 6. Semantic post-checks --------------------------------------------
    const violations = contract.assert_no_violations
      ? contract.assert_no_violations(output, input)
      : [];
    if (violations.length > 0) {
      trace({ type: "violations", traceId: opts.traceId, violations });
      return {
        kind: "contract_violation",
        details: violations.join("; "),
        raw_output: output,
      };
    }

    // 7. Optional rubric scoring -----------------------------------------
    let rubric_score: import("../contracts/types").RubricScore | undefined;
    if (opts.withEval && deps.evaluator) {
      try {
        rubric_score = await deps.evaluator({
          contract: contract as AnyRoleContract,
          input,
          output,
          traceId: opts.traceId,
        });
      } catch {
        // Evaluation is best-effort — never blocks the main result.
      }
    }

    trace({
      type: "result",
      traceId: opts.traceId,
      kind: "ok",
      tokens_used,
      latency_ms,
    });

    return { kind: "ok", output, rubric_score, tokens_used, latency_ms };
  }
}

function isRefusal(output: unknown): output is { refuses: true; refusal_reason: string } {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { refuses?: boolean }).refuses === true &&
    typeof (output as { refusal_reason?: string }).refusal_reason === "string"
  );
}
