// YouTube ingest configuration — all actor ids + Deepgram settings are
// env-driven so they can be swapped without a code change. Sensible defaults
// are provided so the primary (Apify caption) path works out of the box once
// APIFY_TOKEN is set.

export const YOUTUBE_CONFIG = {
  // Apify actor that takes a CHANNEL url and returns its recent videos.
  // streamers/youtube-scraper accepts channel URLs and returns video entries.
  channelActorId: process.env.YT_CHANNEL_ACTOR_ID || "streamers/youtube-scraper",

  // Apify actor that takes a VIDEO url and returns its transcript/captions.
  transcriptActorId:
    process.env.YT_TRANSCRIPT_ACTOR_ID || "pintostudio/youtube-transcript-scraper",

  // Optional Apify actor that returns a downloadable AUDIO/MEDIA url for a
  // video — only needed to feed the Deepgram fallback. If unset, the Deepgram
  // fallback is skipped for videos whose caption fetch came back empty.
  audioActorId: process.env.YT_AUDIO_ACTOR_ID || "",

  // Generous ceiling for a 30-video channel run (cost is not a concern for the
  // calibration demo; we optimize later).
  costCeilingUsd: Number(process.env.YT_COST_CEILING_USD || "12"),

  // ---- Deepgram fallback (multilingual ASR; great at Urdu/Hindi) ----
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || "",
    // nova-2 supports many languages incl. ur/hi. Override per client if needed.
    model: process.env.DEEPGRAM_MODEL || "nova-2",
    // Empty → let Deepgram auto-detect the language. Set "ur" / "hi" to force.
    language: process.env.DEEPGRAM_LANGUAGE || "",
  },
} as const;

export function deepgramEnabled(): boolean {
  return YOUTUBE_CONFIG.deepgram.apiKey.length > 0;
}
