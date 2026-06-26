// dispatchYouTubeChannel — the persistence orchestrator for a YouTube channel
// calibration. Mirrors dispatcher.ts (LinkedIn/X) but for the multi-video
// channel flow: resolve → transcribe (captions + Deepgram fallback) → dedup →
// persist voice_samples → finish the ingest_run.

import crypto from "node:crypto";
import { ingestYouTubeChannel, type PerVideoOutcome } from "./channelIngest";
import type { IngestRepo } from "../dispatcher";

export type YouTubeDispatchResult = {
  runId: number;
  status: "succeeded" | "failed";
  videosResolved: number;
  transcriptsOk: number;
  samplesIngested: number;
  samplesDeduped: number;
  newSampleIds: number[];
  perVideo: PerVideoOutcome[];
  errorMessage?: string;
};

export async function dispatchYouTubeChannel(
  args: { clientId: number; channelUrl: string; maxVideos: number },
  deps: { repo: IngestRepo }
): Promise<YouTubeDispatchResult> {
  const runRowId = await deps.repo.createIngestRun({
    clientId: args.clientId,
    source: "youtube_transcript",
    actorId: "youtube-channel-pipeline",
  });

  try {
    const { samples, perVideo, videosResolved } = await ingestYouTubeChannel(
      args.channelUrl,
      args.maxVideos,
      `yt-run-${runRowId}`
    );

    // Dedup against existing samples for this client + within the batch.
    const existing = await deps.repo.existingContentHashes(args.clientId);
    const fresh: Parameters<IngestRepo["insertVoiceSamples"]>[0] = [];
    let deduped = 0;
    for (const s of samples) {
      const hash = sha256(s.content.toLowerCase().replace(/\s+/g, " ").trim());
      if (existing.has(hash)) {
        deduped++;
        continue;
      }
      existing.add(hash);
      fresh.push({
        clientId: args.clientId,
        source: "youtube_transcript",
        platform: s.platform,
        content: s.content,
        contentHash: hash,
        metadata: s.metadata,
      });
    }

    const newSampleIds = fresh.length ? await deps.repo.insertVoiceSamples(fresh) : [];
    const transcriptsOk = perVideo.filter((v) => v.method !== "none").length;

    await deps.repo.finishIngestRun({
      id: runRowId,
      status: "succeeded",
      apifyRunId: `yt-channel-${videosResolved}v`,
      samplesIngested: newSampleIds.length,
      samplesDeduped: deduped,
      costUsd: 0, // YouTube run cost is multi-actor; not aggregated for the demo
    });

    return {
      runId: runRowId,
      status: "succeeded",
      videosResolved,
      transcriptsOk,
      samplesIngested: newSampleIds.length,
      samplesDeduped: deduped,
      newSampleIds,
      perVideo,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await deps.repo
      .finishIngestRun({
        id: runRowId,
        status: "failed",
        samplesIngested: 0,
        samplesDeduped: 0,
        costUsd: 0,
        errorMessage,
      })
      .catch(() => {});
    return {
      runId: runRowId,
      status: "failed",
      videosResolved: 0,
      transcriptsOk: 0,
      samplesIngested: 0,
      samplesDeduped: 0,
      newSampleIds: [],
      perVideo: [],
      errorMessage,
    };
  }
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
