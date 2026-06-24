// Per-source Apify actor configuration.
//
// We keep the actor catalogue here so we can swap actors when a better one
// appears, without touching the dispatch / normalization layers. Each entry
// declares: the Apify actor id, how to build its input from a handle, and
// which normalizer translates its output rows to VoiceSampleRow.
//
// IMPORTANT: actor ids in this file are configurable defaults; the operator
// (you) should confirm them against the live Apify Store before running. See
// docs/v2/prds/apify-ingestion.md for the rationale.

import type { VoiceSampleSource } from "@workspace/db";

export type ActorConfig = {
  /** Logical source — matches voice_samples.source values. */
  source: VoiceSampleSource;
  /** Apify actor id (slug or numeric). */
  actorId: string;
  /** Human label for the operator UI / logs. */
  label: string;
  /** Approximate per-handle cost ceiling for one run. */
  costCeilingUsd: number;
  /** Build the actor's `input` payload from a user handle + max items. */
  buildInput(handle: string, maxItems: number): Record<string, unknown>;
  /** Key in actors.ts for the normalizer. Concrete normalizer lives in `./normalizers/`. */
  normalizer: ActorNormalizerKey;
};

export type ActorNormalizerKey =
  | "linkedin_posts_v1"
  | "x_posts_v1"
  | "youtube_transcripts_v1";

/**
 * Default actor catalog. These actor IDs are conventional placeholders — see
 * the Apify Store for the latest highest-rated actor per platform and update
 * here. Foundation PR ships with the canonical names so the operator only has
 * to swap a single string when a better actor appears.
 */
export const DEFAULT_ACTORS: Record<VoiceSampleSource, ActorConfig | null> = {
  linkedin: {
    source: "linkedin",
    actorId: "apimaestro/linkedin-profile-posts",
    label: "LinkedIn profile posts",
    costCeilingUsd: 1.0,
    buildInput: (handle, maxItems) => ({
      username: stripLinkedInPrefix(handle),
      limit: maxItems,
      // Some actor variants expect `profileUrls`; include both shapes
      // defensively so swapping actor ids doesn't require touching dispatch.
      profileUrls: [`https://www.linkedin.com/in/${stripLinkedInPrefix(handle)}/`],
    }),
    normalizer: "linkedin_posts_v1",
  },
  x: {
    source: "x",
    actorId: "apidojo/twitter-scraper-lite",
    label: "X / Twitter posts",
    costCeilingUsd: 1.0,
    buildInput: (handle, maxItems) => ({
      twitterHandles: [stripXPrefix(handle)],
      maxItems,
      onlyImage: false,
      onlyTwitterBlue: false,
    }),
    normalizer: "x_posts_v1",
  },
  youtube_transcript: {
    source: "youtube_transcript",
    actorId: "pintostudio/youtube-transcript-scraper",
    label: "YouTube transcripts",
    costCeilingUsd: 1.5,
    buildInput: (handle, maxItems) => ({
      // For channels: pass the channel URL. The dispatcher caller is responsible
      // for first resolving channel → recent video URLs and dispatching one run
      // per video. The handle here is a single video URL when used directly.
      videoUrl: handle,
      maxItems,
    }),
    normalizer: "youtube_transcripts_v1",
  },
  podcast_transcript: null, // ingested via manual transcript paste for v2; Apify pipeline lands in v3
  blog: null, // RSS pipeline ships in v3 alongside newsletter
  newsletter: null,
  manual_paste: null, // user-supplied; no actor
};

function stripLinkedInPrefix(handle: string): string {
  return handle
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")
    .replace(/\/$/, "")
    .replace(/^@/, "");
}

function stripXPrefix(handle: string): string {
  return handle
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "")
    .replace(/\/$/, "")
    .replace(/^@/, "");
}
