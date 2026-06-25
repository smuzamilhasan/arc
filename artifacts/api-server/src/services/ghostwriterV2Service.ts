// GhostwriterV2 service — assembles input, runs the agent, returns the draft.
//
// Wraps the v2 framework's AgentRunner with the curator loader so route
// handlers see one clean API. v1 ghostwriter (services/ghostwriter.ts) is
// untouched; this service runs alongside behind a feature flag set by the
// route handler.

import { AgentRunner } from "../agents-v2/runner/agentRunner";
import {
  ghostwriterContract,
  type GhostwriterInput,
} from "../agents-v2/roles/ghostwriter";
import { openaiStructuredClient } from "../agents-v2/llm";
import { curate } from "../agents-v2/curator/contextCurator";
import { drizzleCuratorLoader } from "../agents-v2/curator/loader";
import type { ContentDraft } from "../agents-v2/contracts/outputs";
import type { AgentResult } from "../agents-v2/contracts/types";

export type DraftRequest = {
  clientId: number;
  brief: string;
  platform: GhostwriterInput["platform"];
  format?: GhostwriterInput["format"];
};

export type DraftResult =
  | { kind: "ok"; draft: ContentDraft & { refuses: false }; tokens_used?: number; latency_ms?: number }
  | { kind: "refused"; reason: string }
  | { kind: "violation"; details: string };

export async function draftWithGhostwriterV2(req: DraftRequest): Promise<DraftResult> {
  // 1. Curate.
  const ctx = await curate(req.clientId, ghostwriterContract.context_requirements, drizzleCuratorLoader);

  // 2. Guard: required slices must exist.
  if (!ctx.identity) {
    return { kind: "violation", details: "client has no identity layer" };
  }
  if (!ctx.voice_samples || ctx.voice_samples.length === 0) {
    return {
      kind: "refused",
      reason: "No voice samples available for this client. Run ingest + extraction first.",
    };
  }

  // 3. Build input.
  const input: GhostwriterInput = {
    client_id: req.clientId,
    brief: req.brief,
    platform: req.platform,
    format: req.format ?? "post",
    identity: {
      full_name: ctx.identity.full_name,
      headline: ctx.identity.headline,
    },
    positioning: ctx.positioning
      ? {
          claim: ctx.positioning.claim,
          adjacent_claims_rejected: ctx.positioning.adjacent_claims_rejected,
          proof_points: ctx.positioning.proof_points.map((p) => ({ kind: p.kind, label: p.label })),
        }
      : null,
    voice: ctx.voice
      ? {
          description: ctx.voice.description ?? null,
          formality: ctx.voice.formality,
          confidence: ctx.voice.confidence,
          sample_count: ctx.voice.sample_count,
          sentence_stats: ctx.voice.sentence_stats,
          lexicon: ctx.voice.lexicon,
          signature_moves: ctx.voice.signature_moves.map((m) => ({
            pattern: m.pattern,
            frequency: m.frequency,
          })),
        }
      : null,
    voice_samples: ctx.voice_samples,
    stories: ctx.stories ?? [],
    references: ctx.references ?? [],
    negative_space: ctx.negative_space ?? null,
    anti_examples: ctx.anti_examples ?? [],
  };

  // 4. Run, with up to 2 self-correction retries on contract violations.
  //    LLMs occasionally slip a banned word or miss a citation despite the
  //    prompt; rather than fail the whole draft, we feed the violation back and
  //    let the model fix it. Refusals and persistent violations pass through.
  const runner = new AgentRunner(ghostwriterContract, { llm: openaiStructuredClient });
  const MAX_ATTEMPTS = 3;
  let result = await runner.run(input);
  for (let attempt = 2; attempt <= MAX_ATTEMPTS && result.kind === "contract_violation"; attempt++) {
    result = await runner.run({ ...input, retry_feedback: result.details });
  }

  // 5. Translate AgentResult into DraftResult.
  return translate(result);
}

export function translate(result: AgentResult<ContentDraft>): DraftResult {
  if (result.kind === "ok") {
    if (result.output.refuses) {
      return { kind: "refused", reason: result.output.refusal_reason };
    }
    return {
      kind: "ok",
      draft: result.output,
      tokens_used: result.tokens_used,
      latency_ms: result.latency_ms,
    };
  }
  if (result.kind === "refused") {
    return { kind: "refused", reason: result.reason };
  }
  return { kind: "violation", details: result.details };
}
