// Deepgram fallback transcription — used when a video's YouTube captions are
// missing or unusable. Deepgram's nova models handle Urdu/Hindi well.
//
// Deepgram ingests from a URL: we hand it a downloadable audio/media URL (from
// the Apify audio actor) and it fetches + transcribes. No audio bytes ever
// touch our server.

import { YOUTUBE_CONFIG, deepgramEnabled } from "./config";

export type DeepgramResult =
  | { ok: true; transcript: string; detectedLanguage?: string }
  | { ok: false; reason: string };

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

/**
 * Transcribe a remote audio/media URL with Deepgram. Returns the concatenated
 * transcript. Best-effort: any failure returns { ok:false } with a reason and
 * never throws to the caller.
 */
export async function transcribeWithDeepgram(audioUrl: string): Promise<DeepgramResult> {
  if (!deepgramEnabled()) {
    return { ok: false, reason: "DEEPGRAM_API_KEY not set" };
  }
  if (!audioUrl) {
    return { ok: false, reason: "no audio url to transcribe" };
  }

  const params = new URLSearchParams({
    model: YOUTUBE_CONFIG.deepgram.model,
    smart_format: "true",
    punctuate: "true",
  });
  if (YOUTUBE_CONFIG.deepgram.language) {
    params.set("language", YOUTUBE_CONFIG.deepgram.language);
  } else {
    params.set("detect_language", "true");
  }

  try {
    const res = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${YOUTUBE_CONFIG.deepgram.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
      // Long audio can take a while; give it room.
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: `deepgram ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = (await res.json()) as DeepgramResponse;
    const channel = body.results?.channels?.[0];
    const transcript = channel?.alternatives?.[0]?.transcript?.trim() ?? "";
    if (!transcript) {
      return { ok: false, reason: "deepgram returned empty transcript" };
    }
    const detectedLanguage = channel?.detected_language ?? channel?.alternatives?.[0]?.languages?.[0];
    return { ok: true, transcript, detectedLanguage };
  } catch (err) {
    return {
      ok: false,
      reason: `deepgram error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        languages?: string[];
      }>;
    }>;
  };
};
