import type { ActorNormalizerKey } from "../actors";
import type { Normalizer } from "./types";
import { linkedinPostsNormalizer } from "./linkedin";
import { xPostsNormalizer } from "./x";
import { youtubeTranscriptsNormalizer } from "./youtube";

export const NORMALIZERS: Record<ActorNormalizerKey, Normalizer> = {
  linkedin_posts_v1: linkedinPostsNormalizer,
  x_posts_v1: xPostsNormalizer,
  youtube_transcripts_v1: youtubeTranscriptsNormalizer,
};

export type { Normalizer, NormalizedSample } from "./types";
export { linkedinPostsNormalizer } from "./linkedin";
export { xPostsNormalizer } from "./x";
export { youtubeTranscriptsNormalizer, splitYouTubeTranscript } from "./youtube";
