// Normalizer contract — each actor-specific normalizer transforms raw dataset
// rows into the uniform NormalizedSample shape that the dispatcher persists.
//
// Normalizers are pure functions. They never call the network. This makes them
// easy to unit-test against canned actor-output fixtures (added when concrete
// actor responses are observed in production runs).

import type { VoiceSampleSource } from "@workspace/db";

export type NormalizedSample = {
  source: VoiceSampleSource;
  platform: string | null;
  content: string;
  /** SHA-256 of normalized content for dedupe; computed by dispatcher. */
  metadata: {
    url: string | null;
    published_at: string | null;
    engagement: {
      likes: number | null;
      comments: number | null;
      shares: number | null;
    } | null;
    apify_run_id: string | null;
    word_count: number;
  };
};

export type Normalizer = (
  rawItem: unknown,
  context: { runId: string; source: VoiceSampleSource }
) => NormalizedSample | null;
