// Ingest dispatcher — orchestrates one ingest run per source.
//
// Responsibilities:
//   1. Look up the actor config for a source
//   2. Insert an ingest_runs row (status: queued → running → succeeded/failed)
//   3. Call Apify, normalize rows, dedupe vs existing voice_samples by content_hash
//   4. Persist new voice_samples
//   5. Update the ingest_runs row with samples_ingested / samples_deduped / cost
//   6. Emit IngestEvent for the voice extractor to consume
//
// All persistence is parameterized via the IngestRepo interface so the
// dispatcher can be unit-tested without a database.

import crypto from "node:crypto";
import { runActor, getDatasetItems, ApifyConfigError, type ApifyRunSummary } from "./apifyClient";
import { DEFAULT_ACTORS } from "./actors";
import { NORMALIZERS, splitYouTubeTranscript, type NormalizedSample } from "./normalizers";
import type { VoiceSampleSource } from "@workspace/db";

export type IngestRequest = {
  clientId: number;
  source: VoiceSampleSource;
  handle: string;
  maxItems?: number;
  /** Override actor id for this run (rare; usually defaults applied). */
  actorIdOverride?: string;
  /** Trace propagation. */
  traceId?: string;
};

export type IngestResult = {
  runId: number; // ingest_runs.id
  apifyRunId: string;
  status: "succeeded" | "failed";
  samplesIngested: number;
  samplesDeduped: number;
  costUsd: number;
  newSampleIds: number[];
  errorMessage?: string;
};

export type IngestEvent = {
  clientId: number;
  source: VoiceSampleSource;
  newSampleIds: number[];
};

export interface IngestRepo {
  /** Create the ingest_runs row and return its id. */
  createIngestRun(args: {
    clientId: number;
    source: VoiceSampleSource;
    actorId: string;
  }): Promise<number>;

  /** Mark the ingest_runs row as terminal with stats. */
  finishIngestRun(args: {
    id: number;
    status: "succeeded" | "failed";
    apifyRunId?: string;
    samplesIngested: number;
    samplesDeduped: number;
    costUsd: number;
    errorMessage?: string;
  }): Promise<void>;

  /** Existing content hashes for this client → for dedupe. */
  existingContentHashes(clientId: number): Promise<Set<string>>;

  /** Bulk insert new voice samples, returning their assigned ids. */
  insertVoiceSamples(samples: Array<{
    clientId: number;
    source: VoiceSampleSource;
    platform: string | null;
    content: string;
    contentHash: string;
    metadata: NormalizedSample["metadata"];
  }>): Promise<number[]>;
}

export interface IngestNotifier {
  emit(event: IngestEvent): Promise<void>;
}

export type IngestDeps = {
  repo: IngestRepo;
  notifier: IngestNotifier;
};

const DEFAULT_MAX_ITEMS = 100;

export async function dispatchIngest(
  req: IngestRequest,
  deps: IngestDeps
): Promise<IngestResult> {
  const actor = DEFAULT_ACTORS[req.source];
  if (!actor) {
    throw new Error(`No Apify actor configured for source: ${req.source}`);
  }
  const actorId = req.actorIdOverride ?? actor.actorId;

  const runRowId = await deps.repo.createIngestRun({
    clientId: req.clientId,
    source: req.source,
    actorId,
  });

  let apifyRun: ApifyRunSummary | undefined;

  try {
    const input = actor.buildInput(req.handle, req.maxItems ?? DEFAULT_MAX_ITEMS);
    apifyRun = await runActor(actorId, input, {
      maxCostUsd: actor.costCeilingUsd,
      traceId: req.traceId,
    });

    const rawItems = await getDatasetItems(apifyRun.defaultDatasetId);

    const normalizer = NORMALIZERS[actor.normalizer];

    const normalized: NormalizedSample[] = [];
    for (const raw of rawItems) {
      const out = normalizer(raw, { runId: apifyRun.id, source: req.source });
      if (out) normalized.push(out);
    }

    // YouTube: fan out long transcripts into ~500-word chunks.
    const expanded = expandLongTranscripts(normalized, apifyRun.id);

    // Dedupe by content_hash against existing samples for this client.
    const existing = await deps.repo.existingContentHashes(req.clientId);
    const fresh: Array<{
      clientId: number;
      source: VoiceSampleSource;
      platform: string | null;
      content: string;
      contentHash: string;
      metadata: NormalizedSample["metadata"];
    }> = [];
    let deduped = 0;
    for (const s of expanded) {
      const hash = sha256(normalizeForHash(s.content));
      if (existing.has(hash)) {
        deduped++;
        continue;
      }
      existing.add(hash); // protect against intra-batch dupes
      fresh.push({
        clientId: req.clientId,
        source: s.source,
        platform: s.platform,
        content: s.content,
        contentHash: hash,
        metadata: s.metadata,
      });
    }

    const newSampleIds = fresh.length ? await deps.repo.insertVoiceSamples(fresh) : [];

    await deps.repo.finishIngestRun({
      id: runRowId,
      status: "succeeded",
      apifyRunId: apifyRun.id,
      samplesIngested: newSampleIds.length,
      samplesDeduped: deduped,
      costUsd: apifyRun.usageUsd,
    });

    // Notify voice extractor (or downstream consumers).
    await deps.notifier.emit({
      clientId: req.clientId,
      source: req.source,
      newSampleIds,
    });

    return {
      runId: runRowId,
      apifyRunId: apifyRun.id,
      status: "succeeded",
      samplesIngested: newSampleIds.length,
      samplesDeduped: deduped,
      costUsd: apifyRun.usageUsd,
      newSampleIds,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await deps.repo
      .finishIngestRun({
        id: runRowId,
        status: "failed",
        apifyRunId: apifyRun?.id,
        samplesIngested: 0,
        samplesDeduped: 0,
        costUsd: apifyRun?.usageUsd ?? 0,
        errorMessage,
      })
      .catch(() => {});
    if (err instanceof ApifyConfigError) {
      // Re-throw config errors so the caller surfaces them to the operator.
      throw err;
    }
    return {
      runId: runRowId,
      apifyRunId: apifyRun?.id ?? "",
      status: "failed",
      samplesIngested: 0,
      samplesDeduped: 0,
      costUsd: apifyRun?.usageUsd ?? 0,
      newSampleIds: [],
      errorMessage,
    };
  }
}

function expandLongTranscripts(samples: NormalizedSample[], runId: string): NormalizedSample[] {
  const out: NormalizedSample[] = [];
  for (const s of samples) {
    if (s.source === "youtube_transcript") {
      const chunks = splitYouTubeTranscript(s.content);
      if (chunks.length <= 1) {
        out.push(s);
        continue;
      }
      for (const chunk of chunks) {
        out.push({
          ...s,
          content: chunk,
          metadata: {
            ...s.metadata,
            apify_run_id: runId,
            word_count: chunk.split(/\s+/).filter(Boolean).length,
          },
        });
      }
    } else {
      out.push(s);
    }
  }
  return out;
}

function normalizeForHash(content: string): string {
  // Collapse whitespace, lowercase — minor edits shouldn't create dupes, but
  // re-fetches of the same post should.
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
