// LinkedIn posts normalizer.
//
// Maps the various shapes returned by LinkedIn post scrapers (the actor
// catalog is fluid) into our uniform NormalizedSample. We accept several
// commonly-observed field name shapes so a minor actor swap doesn't require
// a code change.
//
// Verified against `harvestapi/linkedin-profile-posts` output observed
// 2026-06-24. Other actor shapes (postUrl, postedAtIso, flat numLikes) are
// kept as fallbacks for forward-compat.

import type { Normalizer } from "./types";

type HarvestapiPostedAt = {
  timestamp?: number;
  date?: string;
};

type HarvestapiEngagement = {
  likes?: number;
  comments?: number;
  shares?: number;
  reposts?: number;
};

type HarvestapiRepostedBy = {
  name?: string;
  publicIdentifier?: string;
};

type LinkedInRaw = {
  // Common field names across actor variants
  text?: string;
  postText?: string;
  content?: string;
  description?: string;

  // URL — harvestapi uses `linkedinUrl`, older actors use postUrl / url
  linkedinUrl?: string;
  postUrl?: string;
  url?: string;

  // Date — harvestapi uses `postedAt: {timestamp, date}`, older actors use flat strings
  postedAt?: string | HarvestapiPostedAt;
  postedAtIso?: string;
  publishedAt?: string;
  timestamp?: string | number;

  // Engagement — harvestapi nests under `engagement`, older actors flatten
  engagement?: HarvestapiEngagement;
  numLikes?: number;
  likesCount?: number;
  numComments?: number;
  commentsCount?: number;
  numShares?: number;
  sharesCount?: number;
  reposts?: number;

  // Repost detection — harvestapi sets `repostedBy` on reshares
  repostedBy?: HarvestapiRepostedBy | null;
};

export const linkedinPostsNormalizer: Normalizer = (rawItem, ctx) => {
  const raw = rawItem as LinkedInRaw;

  // SKIP reposts — the `content` on a repost is OTHER PEOPLE'S writing, which
  // would poison voice training. harvestapi sets `repostedBy.name` when this
  // happens. (Some actor variants might not set it; the field defaults to
  // missing/null on originals so this check is safe.)
  if (raw.repostedBy && typeof raw.repostedBy === "object" && raw.repostedBy.name) {
    return null;
  }

  const content = (raw.text ?? raw.postText ?? raw.content ?? raw.description ?? "").trim();
  if (!content) return null; // empty — skip
  if (content.length < 30) return null; // too short to be useful for voice

  return {
    source: ctx.source,
    platform: "linkedin",
    content,
    metadata: {
      url: raw.linkedinUrl ?? raw.postUrl ?? raw.url ?? null,
      published_at: pickIsoDate(
        raw.postedAtIso,
        // harvestapi: postedAt is an object — read `.date` if present
        typeof raw.postedAt === "object" ? raw.postedAt?.date : raw.postedAt,
        typeof raw.postedAt === "object" ? raw.postedAt?.timestamp : undefined,
        raw.publishedAt,
        raw.timestamp
      ),
      engagement: {
        likes: pickNumber(raw.engagement?.likes, raw.numLikes, raw.likesCount),
        comments: pickNumber(raw.engagement?.comments, raw.numComments, raw.commentsCount),
        shares: pickNumber(
          raw.engagement?.shares,
          raw.engagement?.reposts,
          raw.numShares,
          raw.sharesCount,
          raw.reposts
        ),
      },
      apify_run_id: ctx.runId,
      word_count: countWords(content),
    },
  };
};

function pickIsoDate(...candidates: Array<string | number | undefined | null>): string | null {
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
