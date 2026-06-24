// YouTube transcript normalizer.
//
// Transcripts arrive as arrays of caption fragments or as concatenated text
// depending on the actor. We join fragments, then split into ~500-word chunks
// so the voice extractor can treat each chunk as a sample (extracting voice
// from a 60-minute transcript as one row is bad signal-to-noise).

import type { Normalizer, NormalizedSample } from "./types";

type YouTubeRaw = {
  transcript?:
    | string
    | Array<{ text?: string; start?: number; offset?: number; duration?: number }>;
  videoUrl?: string;
  url?: string;
  videoTitle?: string;
  title?: string;
  uploadDate?: string;
  publishedAt?: string;
  channelName?: string;
  viewCount?: number;
};

const CHUNK_WORDS = 500;

export const youtubeTranscriptsNormalizer: Normalizer = (rawItem, ctx) => {
  const raw = rawItem as YouTubeRaw;
  const text = joinTranscript(raw.transcript);
  if (!text || text.length < 200) return null;

  // Multiple chunks per video → caller persists each. To keep the normalizer
  // signature (one input → one sample), we concatenate but cap at the first
  // CHUNK_WORDS so we still produce a usable sample. The dispatcher fans out
  // additional chunks by re-invoking the splitter (see ./youtube-chunks.ts when
  // the splitter is wired in dispatcher).
  const firstChunk = takeFirstChunk(text, CHUNK_WORDS);

  const sample: NormalizedSample = {
    source: ctx.source,
    platform: "youtube",
    content: firstChunk,
    metadata: {
      url: raw.videoUrl ?? raw.url ?? null,
      published_at: pickIsoDate(raw.uploadDate, raw.publishedAt),
      engagement: { likes: null, comments: null, shares: pickNumber(raw.viewCount) },
      apify_run_id: ctx.runId,
      word_count: firstChunk.split(/\s+/).filter(Boolean).length,
    },
  };
  return sample;
};

/** Public splitter so the dispatcher can fan out long transcripts. */
export function splitYouTubeTranscript(text: string): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    const chunk = words.slice(i, i + CHUNK_WORDS).join(" ");
    if (chunk.length >= 200) chunks.push(chunk);
  }
  return chunks;
}

function joinTranscript(t: YouTubeRaw["transcript"]): string {
  if (!t) return "";
  if (typeof t === "string") return t.trim();
  return t
    .map((f) => (typeof f.text === "string" ? f.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function takeFirstChunk(text: string, words: number): string {
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.slice(0, words).join(" ");
}

function pickIsoDate(...candidates: Array<string | undefined>): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function pickNumber(...candidates: Array<number | undefined>): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return null;
}
