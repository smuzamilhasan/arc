// X / Twitter normalizer.

import type { Normalizer } from "./types";

type XRaw = {
  text?: string;
  full_text?: string;
  fullText?: string;
  tweetText?: string;
  url?: string;
  tweetUrl?: string;
  createdAt?: string;
  created_at?: string;
  likeCount?: number;
  favoriteCount?: number;
  replyCount?: number;
  retweetCount?: number;
  // Reply / quote markers — we want voice samples, not replies-to-others
  isReply?: boolean;
  in_reply_to_status_id?: string | null;
};

export const xPostsNormalizer: Normalizer = (rawItem, ctx) => {
  const raw = rawItem as XRaw;

  // Skip replies (they're conversational fragments, weak voice signal).
  if (raw.isReply === true || raw.in_reply_to_status_id) return null;

  const content = (raw.text ?? raw.full_text ?? raw.fullText ?? raw.tweetText ?? "").trim();
  if (!content || content.length < 30) return null;

  return {
    source: ctx.source,
    platform: "x",
    content,
    metadata: {
      url: raw.tweetUrl ?? raw.url ?? null,
      published_at: pickIsoDate(raw.createdAt, raw.created_at),
      engagement: {
        likes: pickNumber(raw.likeCount, raw.favoriteCount),
        comments: pickNumber(raw.replyCount),
        shares: pickNumber(raw.retweetCount),
      },
      apify_run_id: ctx.runId,
      word_count: content.split(/\s+/).filter(Boolean).length,
    },
  };
};

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
