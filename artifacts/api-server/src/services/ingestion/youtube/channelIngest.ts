// YouTube channel → transcripts ingest.
//
// Pipeline for one channel:
//   1. resolveChannelVideos  — channel url → up to N recent {videoUrl, title, audioUrl?}
//   2. fetchVideoTranscript  — per video, pull captions via Apify
//   3. (fallback) Deepgram   — if captions empty AND an audio url is available
//   4. chunk long transcripts into ~500-word samples
//
// Everything is defensive about actor output shapes (the YouTube actor catalog
// is fluid and multilingual captions come back in several formats). Failures on
// one video never abort the run — they're recorded and the rest proceed.

import { runActor, getDatasetItems } from "../apifyClient";
import { YOUTUBE_CONFIG } from "./config";
import { transcribeWithDeepgram } from "./deepgram";
import { splitYouTubeTranscript } from "../normalizers/youtube";
import type { NormalizedSample } from "../normalizers/types";

export type ResolvedVideo = {
  videoUrl: string;
  title: string | null;
  publishedAt: string | null;
  audioUrl: string | null;
};

export type PerVideoOutcome = {
  videoUrl: string;
  title: string | null;
  method: "captions" | "deepgram" | "none";
  words: number;
  reason?: string;
  /** Diagnostic: shape of the transcript-actor output (temporary, for tuning). */
  debug?: string;
};

export type ChannelIngestResult = {
  samples: NormalizedSample[];
  perVideo: PerVideoOutcome[];
  videosResolved: number;
};

export async function ingestYouTubeChannel(
  channelUrl: string,
  maxVideos: number,
  runId: string
): Promise<ChannelIngestResult> {
  const videos = await resolveChannelVideos(channelUrl, maxVideos);

  const samples: NormalizedSample[] = [];
  const perVideo: PerVideoOutcome[] = [];

  // Transcribe videos with bounded concurrency so a 30-video channel doesn't
  // fire 30 Apify runs at once.
  const CONCURRENCY = 4;
  for (let i = 0; i < videos.length; i += CONCURRENCY) {
    const batch = videos.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((v) => transcribeOneVideo(v, runId)));
    for (const r of results) {
      perVideo.push(r.outcome);
      samples.push(...r.samples);
    }
  }

  return { samples, perVideo, videosResolved: videos.length };
}

async function transcribeOneVideo(
  video: ResolvedVideo,
  runId: string
): Promise<{ outcome: PerVideoOutcome; samples: NormalizedSample[] }> {
  // 1. Try captions via Apify.
  const fetched = await fetchVideoTranscriptDebug(video.videoUrl).catch((e) => ({
    text: "",
    debug: `threw: ${e instanceof Error ? e.message : String(e)}`,
  }));
  let transcript = fetched.text;
  const debug = fetched.debug;
  let method: PerVideoOutcome["method"] = transcript ? "captions" : "none";
  let reason: string | undefined;

  // 2. Fallback to Deepgram if captions are empty/too short.
  if ((!transcript || transcript.length < 200) && video.audioUrl) {
    const dg = await transcribeWithDeepgram(video.audioUrl);
    if (dg.ok) {
      transcript = dg.transcript;
      method = "deepgram";
    } else if (!transcript) {
      reason = dg.reason;
    }
  } else if (!transcript) {
    reason = video.audioUrl ? "captions empty" : "captions empty; no audio url for fallback";
  }

  if (!transcript || transcript.length < 200) {
    return {
      outcome: { videoUrl: video.videoUrl, title: video.title, method: "none", words: 0, reason, debug },
      samples: [],
    };
  }

  // 3. Chunk long transcripts (a 15-min video ≈ 2000 words) into samples.
  const chunks = splitYouTubeTranscript(transcript);
  const samples: NormalizedSample[] = (chunks.length ? chunks : [transcript]).map((chunk) => ({
    source: "youtube_transcript",
    platform: "youtube",
    content: chunk,
    metadata: {
      url: video.videoUrl,
      published_at: video.publishedAt,
      engagement: { likes: null, comments: null, shares: null },
      apify_run_id: runId,
      word_count: chunk.split(/\s+/).filter(Boolean).length,
    },
  }));

  return {
    outcome: {
      videoUrl: video.videoUrl,
      title: video.title,
      method,
      words: transcript.split(/\s+/).filter(Boolean).length,
    },
    samples,
  };
}

// ---------- Channel resolution ----------

export async function resolveChannelVideos(
  channelUrl: string,
  maxVideos: number
): Promise<ResolvedVideo[]> {
  const run = await runActor(
    YOUTUBE_CONFIG.channelActorId,
    {
      // streamers/youtube-scraper accepts startUrls; include several shapes
      // defensively so swapping actors doesn't require touching this.
      startUrls: [{ url: channelUrl }],
      maxResults: maxVideos,
      maxResultsShorts: 0,
      maxResultStreams: 0,
      // common alt fields other actors expect:
      channelUrls: [channelUrl],
      maxVideos,
    },
    { maxCostUsd: YOUTUBE_CONFIG.costCeilingUsd }
  );

  const items = await getDatasetItems<Record<string, unknown>>(run.defaultDatasetId);
  const videos: ResolvedVideo[] = [];
  for (const raw of items) {
    const v = parseVideoEntry(raw);
    if (v) videos.push(v);
    if (videos.length >= maxVideos) break;
  }
  return videos;
}

function parseVideoEntry(raw: Record<string, unknown>): ResolvedVideo | null {
  const url =
    str(raw.url) ??
    str(raw.videoUrl) ??
    str(raw.link) ??
    (str(raw.id) ? `https://www.youtube.com/watch?v=${str(raw.id)}` : null);
  if (!url || !/youtu\.?be|watch\?v=/.test(url)) return null;
  return {
    videoUrl: url,
    title: str(raw.title) ?? str(raw.name) ?? null,
    publishedAt: pickIsoDate(raw.date, raw.publishedAt, raw.uploadDate, raw.publishDate),
    // Some scrapers return a downloadable media url; only used for Deepgram.
    audioUrl: str(raw.audioUrl) ?? str(raw.downloadUrl) ?? str(raw.audio) ?? null,
  };
}

// ---------- Transcript fetch ----------

export async function fetchVideoTranscript(videoUrl: string): Promise<string> {
  return (await fetchVideoTranscriptDebug(videoUrl)).text;
}

// Returns the transcript text plus a compact diagnostic of the actor's raw
// output shape, so we can tune parsing/actor choice against a live run.
async function fetchVideoTranscriptDebug(
  videoUrl: string
): Promise<{ text: string; debug: string }> {
  let run;
  try {
    run = await runActor(
      YOUTUBE_CONFIG.transcriptActorId,
      {
        // Defensive across transcript-actor variants.
        videoUrl,
        startUrls: [{ url: videoUrl }],
        urls: [videoUrl],
        videoUrls: [videoUrl],
      },
      { maxCostUsd: YOUTUBE_CONFIG.costCeilingUsd }
    );
  } catch (e) {
    return { text: "", debug: `actor-run-error: ${e instanceof Error ? e.message : String(e)}` };
  }
  const items = await getDatasetItems<Record<string, unknown>>(run.defaultDatasetId);
  const text = joinTranscriptItems(items);
  let debug = `items=${items.length}`;
  if (items.length > 0 && !text) {
    const first = items[0]!;
    debug += ` keys=[${Object.keys(first).slice(0, 12).join(",")}]`;
    debug += ` sample=${JSON.stringify(first).slice(0, 300)}`;
  }
  return { text, debug };
}

// Transcript actors return one of: a single item with a `transcript` string;
// a single item with a `transcript` array of {text}; or many items each a
// caption fragment {text}. Handle all.
function joinTranscriptItems(items: Array<Record<string, unknown>>): string {
  if (items.length === 0) return "";

  // Case A: one item carrying the whole transcript.
  if (items.length === 1) {
    const only = items[0]!;
    const t = only.transcript ?? only.text ?? only.captions ?? only.content;
    if (typeof t === "string") return t.trim();
    if (Array.isArray(t)) return joinFragments(t);
  }

  // Case B: many items, each a fragment.
  return joinFragments(items);
}

function joinFragments(arr: unknown[]): string {
  return arr
    .map((f) => {
      if (typeof f === "string") return f;
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        return str(o.text) ?? str(o.caption) ?? str(o.content) ?? "";
      }
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- helpers ----------

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pickIsoDate(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" || typeof c === "number") {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}
