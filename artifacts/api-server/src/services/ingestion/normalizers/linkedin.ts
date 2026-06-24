// LinkedIn posts normalizer.
//
// Maps the various shapes returned by LinkedIn post scrapers (the actor
// catalog is fluid) into our uniform NormalizedSample. We accept several
// commonly-observed field name shapes so a minor actor swap doesn't require
// a code change.

import type { Normalizer } from "./types";

type LinkedInRaw = {
  // Common field names across actor variants
  text?: string;
  postText?: string;
  content?: string;
  description?: string;
  postUrl?: string;
  url?: string;
  postedAt?: string;
  postedAtIso?: string;
  publishedAt?: string;
  timestamp?: string | number;
  numLikes?: number;
  likesCount?: number;
  numComments?: number;
  commentsCount?: number;
  numShares?: number;
  sharesCount?: number;
  reposts?: number;
};

export const linkedinPostsNormalizer: Normalizer = (rawItem, ctx) => {
  const raw = rawItem as LinkedInRaw;
  const content = (raw.text ?? raw.postText ?? raw.content ?? raw.description ?? "").trim();
  if (!content) return null; // empty — skip
  if (content.length < 30) return null; // too short to be useful for voice

  return {
    source: ctx.source,
    platform: "linkedin",
    content,
    metadata: {
      url: raw.postUrl ?? raw.url ?? null,
      published_at: pickIsoDate(raw.postedAtIso, raw.postedAt, raw.publishedAt, raw.timestamp),
      engagement: {
        likes: pickNumber(raw.numLikes, raw.likesCount),
        comments: pickNumber(raw.numComments, raw.commentsCount),
        shares: pickNumber(raw.numShares, raw.sharesCount, raw.reposts),
      },
      apify_run_id: ctx.runId,
      word_count: countWords(content),
    },
  };
};

function pickIsoDate(...candidates: Array<string | number | undefined>): string | null {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const d = typeof c === "number" ? new Date(c) : new Date(c);
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

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
