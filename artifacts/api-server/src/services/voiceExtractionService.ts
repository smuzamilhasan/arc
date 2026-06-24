// VoiceExtractionService — the end-to-end orchestrator.
//
// Wires:
//   ingestNotifier.emit(IngestEvent)
//     → fetch all samples for client
//     → runVoiceExtractor(...)
//     → applyProfilePatch(...)
//     → record an extraction_run for observability
//
// Also exposes a manual `extractForClient(clientId)` entry point used by the
// trigger route + ops scripts.

import {
  db,
  voiceSamplesTable,
  clientProfileTable,
  readLayer,
} from "@workspace/db";
import { eq } from "drizzle-orm";

import { ingestNotifier } from "./ingestion";
import { runVoiceExtractor } from "../agents-v2/roles/voiceExtractor";
import { openaiStructuredClient } from "../agents-v2/llm";
import { applyProfilePatch } from "../agents-v2/profilePatch";
import type { VoiceExtractorInput } from "../agents-v2/roles/voiceExtractor/contract";

const MIN_SAMPLES_TO_TRIGGER = 10;
const MAX_SAMPLES_FOR_EXTRACTION = 100;

export type ExtractionResult =
  | { kind: "ok"; client_id: number; sample_count: number; confidence: number; ops_applied: number }
  | { kind: "skipped"; client_id: number; reason: string }
  | { kind: "refused"; client_id: number; reason: string }
  | { kind: "error"; client_id: number; error: string };

export async function extractForClient(clientId: number): Promise<ExtractionResult> {
  const samples = await db
    .select({
      id: voiceSamplesTable.id,
      platform: voiceSamplesTable.platform,
      content: voiceSamplesTable.content,
      metadata: voiceSamplesTable.metadata,
    })
    .from(voiceSamplesTable)
    .where(eq(voiceSamplesTable.clientId, clientId))
    .limit(MAX_SAMPLES_FOR_EXTRACTION);

  if (samples.length < MIN_SAMPLES_TO_TRIGGER) {
    return {
      kind: "skipped",
      client_id: clientId,
      reason: `Only ${samples.length} samples available; need ≥ ${MIN_SAMPLES_TO_TRIGGER} to extract.`,
    };
  }

  const existingVoice = await getExistingVoiceLayer(clientId);
  const existingNegativeSpace = await getExistingNegativeSpaceLayer(clientId);

  const input: VoiceExtractorInput = {
    client_id: clientId,
    samples: samples.map((s) => ({
      id: s.id,
      platform: s.platform,
      content: s.content,
      published_at: s.metadata?.published_at ?? null,
    })),
    existing_voice: existingVoice,
    existing_negative_space: existingNegativeSpace,
    deterministic_features: {},
  };

  try {
    const result = await runVoiceExtractor(input, { llm: openaiStructuredClient });

    if (result.refuses) {
      return { kind: "refused", client_id: clientId, reason: result.refusal_reason };
    }

    const apply = await applyProfilePatch(result.profile_patch);
    return {
      kind: "ok",
      client_id: clientId,
      sample_count: result.sample_count,
      confidence: result.confidence,
      ops_applied: apply.ops_applied,
    };
  } catch (err) {
    return {
      kind: "error",
      client_id: clientId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getExistingVoiceLayer(clientId: number): Promise<unknown> {
  const rows = await db
    .select({ voiceV2: clientProfileTable.voiceV2 })
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  return readLayer("voice_v2", rows[0]?.voiceV2);
}

async function getExistingNegativeSpaceLayer(clientId: number): Promise<unknown> {
  const rows = await db
    .select({ negativeSpaceV2: clientProfileTable.negativeSpaceV2 })
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  return readLayer("negative_space_v2", rows[0]?.negativeSpaceV2);
}

let subscribed = false;

/**
 * Subscribe the extractor to ingest completion events. Idempotent; safe to
 * call from app bootstrap multiple times.
 */
export function startVoiceExtractionWorker(): void {
  if (subscribed) return;
  subscribed = true;

  ingestNotifier.on(async (event) => {
    // We trigger extraction even if the event reports zero new sample ids,
    // because the *total* sample count may have crossed the threshold from a
    // previous partial ingest.
    const result = await extractForClient(event.clientId);
    if (result.kind === "error") {
      console.error(`[voiceExtraction] failed for client ${event.clientId}:`, result.error);
    } else {
      console.log(`[voiceExtraction] ${result.kind} client=${event.clientId}`);
    }
  });
}
