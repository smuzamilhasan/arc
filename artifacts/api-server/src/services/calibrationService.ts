// CalibrationService — drives the calibration UI on /app/calibrate.
//
// Three operations:
//   1. previewFromHandle  — full pipeline (Apify → normalize → extract), but
//      DOES NOT apply the resulting ProfilePatch. UI shows the patch for review.
//   2. previewFromJson    — same as above but skips Apify (caller uploads the
//      JSON they already pulled, e.g. for offline iteration).
//   3. applyPatch         — apply a previously-previewed ProfilePatch.
//
// The deliberate separation of preview vs apply is the UX guarantee: the user
// always sees the extracted features and confirms before they land in the
// profile. No silent writes.

import {
  dispatchIngest,
  drizzleIngestRepo,
  ingestNotifier,
  type IngestRequest,
} from "./ingestion";
import { NORMALIZERS, type Normalizer } from "./ingestion/normalizers";
import { DEFAULT_ACTORS } from "./ingestion/actors";
import { dispatchYouTubeChannel } from "./ingestion/youtube/dispatchYouTubeChannel";
import { runVoiceExtractor } from "../agents-v2/roles/voiceExtractor/pipeline";
import { openaiStructuredClient } from "../agents-v2/llm";
import { applyProfilePatch, type ApplyProfilePatchResult } from "../agents-v2/profilePatch";
import type { VoiceExtractorOutput } from "../agents-v2/contracts/outputs";
import type { VoiceSampleSource } from "@workspace/db";
import type { ProfilePatch } from "../agents-v2/contracts/profilePatch";

export type YouTubeIngestSummary = {
  videosResolved: number;
  transcriptsOk: number;
  samplesIngested: number;
  perVideo: Array<{ videoUrl: string; title: string | null; method: string; words: number; reason?: string }>;
};

export type CalibrationPreviewResult =
  | {
      kind: "ok";
      sample_count: number;
      dropped: number;
      extractor: VoiceExtractorOutput;
      youtube?: YouTubeIngestSummary;
      /** True when we re-extracted from stored samples without re-fetching (no scraper cost). */
      usedCache?: boolean;
      cachedSampleCount?: number;
    }
  | { kind: "refused"; reason: string; youtube?: YouTubeIngestSummary; usedCache?: boolean; cachedSampleCount?: number }
  | { kind: "error"; error: string; youtube?: YouTubeIngestSummary };

export type PreviewFromHandleArgs = {
  clientId: number;
  source: VoiceSampleSource;
  handle: string;
  maxItems?: number;
  /**
   * If true, samples ARE persisted to voice_samples as part of preview (so they
   * can be cited by the Ghostwriter later). If false, we run the pipeline in
   * memory only. Default: true.
   */
  persistSamples?: boolean;
  /**
   * Force a fresh (paid) fetch from the source even if we already have stored
   * samples for this client+source. Default false → reuse stored samples and
   * just re-extract, so repeated calibrations don't repeatedly pay the scraper.
   */
  force?: boolean;
};

export async function previewFromHandle(
  args: PreviewFromHandleArgs
): Promise<CalibrationPreviewResult> {
  // FAILSAFE: don't pay the scraper again if we already have samples for this
  // client+source. The scraper (Apify) charges per run REGARDLESS of our
  // content-hash dedup (which only prevents duplicate DB rows, after the paid
  // fetch). So unless the caller forces a refresh, re-extract from what we
  // already stored — zero scraping cost.
  if (!args.force) {
    const existing = await countSamplesForSource(args.clientId, args.source);
    if (existing > 0) {
      const result = await extractFromStoredSamples(args.clientId, 0);
      if (result.kind === "ok" || result.kind === "refused") {
        return { ...result, usedCache: true, cachedSampleCount: existing };
      }
      return result;
    }
  }
  return previewViaFullIngest(args);
}

async function previewViaFullIngest(
  args: PreviewFromHandleArgs
): Promise<CalibrationPreviewResult> {
  // YouTube takes a CHANNEL url and fans out across its recent videos
  // (captions + Deepgram fallback), so it has its own dispatch rather than the
  // single-actor LinkedIn/X path.
  if (args.source === "youtube_transcript") {
    let ytSummary: YouTubeIngestSummary | undefined;
    try {
      const yt = await dispatchYouTubeChannel(
        {
          clientId: args.clientId,
          channelUrl: args.handle,
          maxVideos: args.maxItems ?? 30,
        },
        { repo: drizzleIngestRepo }
      );
      ytSummary = {
        videosResolved: yt.videosResolved,
        transcriptsOk: yt.transcriptsOk,
        samplesIngested: yt.samplesIngested,
        perVideo: yt.perVideo,
      };
      if (yt.status === "failed") {
        return { kind: "error", error: yt.errorMessage ?? "youtube ingest failed", youtube: ytSummary };
      }
    } catch (err) {
      return {
        kind: "error",
        error: `youtube ingest failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const result = await extractFromStoredSamples(args.clientId, 0);
    return { ...result, youtube: ytSummary };
  }

  const ingestReq: IngestRequest = {
    clientId: args.clientId,
    source: args.source,
    handle: args.handle,
    maxItems: args.maxItems ?? 100,
  };

  let ingestResult;
  try {
    ingestResult = await dispatchIngest(ingestReq, {
      repo: drizzleIngestRepo,
      notifier: ingestNotifier,
    });
  } catch (err) {
    return {
      kind: "error",
      error: `ingest failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (ingestResult.status === "failed") {
    return { kind: "error", error: ingestResult.errorMessage ?? "ingest failed" };
  }

  // Even on success the dispatcher emits the IngestEvent which (in
  // production) starts the worker. The preview flow should run extraction
  // synchronously and return the patch unapplied. We re-load samples for this
  // client (including any prior ingests) and run the extractor here.
  return extractFromStoredSamples(args.clientId, ingestResult.samplesDeduped ?? 0);
}

/**
 * Load all stored voice_samples for a client and run the voice extractor over
 * them (no apply). Shared by the LinkedIn/X path and the YouTube channel path.
 */
async function extractFromStoredSamples(
  clientId: number,
  dropped: number
): Promise<CalibrationPreviewResult> {
  const samples = await loadAllSamplesForClient(clientId);

  if (samples.length < 10) {
    return {
      kind: "refused",
      reason: `Only ${samples.length} samples available after ingest; extractor requires ≥ 10.`,
    };
  }

  const result = await runVoiceExtractor(
    {
      client_id: clientId,
      identity_full_name: await loadClientName(clientId),
      samples: samples.map((s) => ({
        id: s.id,
        platform: s.platform,
        content: s.content,
        published_at: null,
      })),
      existing_voice: null,
      existing_negative_space: null,
      deterministic_features: {},
    },
    { llm: openaiStructuredClient }
  );

  if (result.refuses) {
    return { kind: "refused", reason: result.refusal_reason };
  }

  return {
    kind: "ok",
    sample_count: result.sample_count,
    dropped,
    extractor: result,
  };
}

export type PreviewFromJsonArgs = {
  clientId: number;
  source: VoiceSampleSource;
  /** Raw JSON array from an Apify dataset export. */
  rawItems: unknown[];
};

export async function previewFromJson(
  args: PreviewFromJsonArgs
): Promise<CalibrationPreviewResult> {
  const actor = DEFAULT_ACTORS[args.source];
  if (!actor) {
    return { kind: "error", error: `no normalizer configured for source ${args.source}` };
  }
  const normalizer: Normalizer = NORMALIZERS[actor.normalizer];

  // Normalize. We assign synthetic ids (the items are not persisted in this
  // path, so the extractor's voice_evidence will reference these synthetic ids).
  const samples: Array<{ id: number; platform: string | null; content: string }> = [];
  let nextId = 1;
  let dropped = 0;
  for (const raw of args.rawItems) {
    const out = normalizer(raw, {
      runId: "calibration-from-json",
      source: args.source,
    });
    if (!out) {
      dropped++;
      continue;
    }
    samples.push({ id: nextId++, platform: out.platform, content: out.content });
  }

  if (samples.length < 10) {
    return {
      kind: "refused",
      reason: `Only ${samples.length} samples after normalization; extractor requires ≥ 10.`,
    };
  }

  const result = await runVoiceExtractor(
    {
      client_id: args.clientId,
      identity_full_name: await loadClientName(args.clientId),
      samples: samples.map((s) => ({
        id: s.id,
        platform: s.platform,
        content: s.content,
        published_at: null,
      })),
      existing_voice: null,
      existing_negative_space: null,
      deterministic_features: {},
    },
    { llm: openaiStructuredClient }
  );

  if (result.refuses) {
    return { kind: "refused", reason: result.refusal_reason };
  }
  return {
    kind: "ok",
    sample_count: result.sample_count,
    dropped,
    extractor: result,
  };
}

export async function applyReviewedPatch(
  patch: ProfilePatch
): Promise<ApplyProfilePatchResult> {
  return applyProfilePatch(patch);
}

// ---------- Internal ----------

async function countSamplesForSource(
  clientId: number,
  source: VoiceSampleSource
): Promise<number> {
  const { db, voiceSamplesTable } = await import("@workspace/db");
  const { eq, and, sql } = await import("drizzle-orm");
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(voiceSamplesTable)
    .where(and(eq(voiceSamplesTable.clientId, clientId), eq(voiceSamplesTable.source, source)));
  return rows[0]?.n ?? 0;
}

async function loadClientName(clientId: number): Promise<string | null> {
  const { db, clientProfileTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ fullName: clientProfileTable.fullName })
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  return rows[0]?.fullName ?? null;
}

async function loadAllSamplesForClient(
  clientId: number
): Promise<Array<{ id: number; platform: string | null; content: string }>> {
  const { db, voiceSamplesTable } = await import("@workspace/db");
  const { eq, desc } = await import("drizzle-orm");
  const rows = await db
    .select({
      id: voiceSamplesTable.id,
      platform: voiceSamplesTable.platform,
      content: voiceSamplesTable.content,
    })
    .from(voiceSamplesTable)
    .where(eq(voiceSamplesTable.clientId, clientId))
    .orderBy(desc(voiceSamplesTable.ingestedAt))
    .limit(150);
  return rows;
}
