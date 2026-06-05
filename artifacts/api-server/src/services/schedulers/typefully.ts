import type {
  SchedulerProvider,
  VerifyResult,
  CreateDraftInput,
  CreateDraftResult,
} from "./types";

// Typefully exposes a small REST API authenticated with the client's own API
// key via the `X-API-KEY: Bearer <key>` header. We use it to verify the key and
// to create scheduled drafts. Docs: https://support.typefully.com/en/articles/8718287-typefully-api
const BASE_URL = "https://api.typefully.com/v1";
const REQUEST_TIMEOUT_MS = 15000;

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "X-API-KEY": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const typefullyProvider: SchedulerProvider = {
  meta: {
    id: "typefully",
    label: "Typefully",
    supportsApi: true,
    apiKeyUrl: "https://typefully.com/settings/integrations",
  },

  async verifyCredentials(apiKey: string): Promise<VerifyResult> {
    if (!apiKey.trim()) {
      return { ok: false, error: "API key is empty." };
    }
    try {
      // Listing recently-scheduled drafts is a cheap, read-only call that 200s
      // for a valid key and 401s for a bad one.
      const res = await fetchWithTimeout(`${BASE_URL}/drafts/recently-scheduled/`, {
        method: "GET",
        headers: authHeaders(apiKey),
      });
      if (res.ok) {
        return { ok: true, accountLabel: "Typefully account" };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Typefully rejected that API key. Double-check it and try again." };
      }
      return { ok: false, error: `Typefully returned an unexpected error (HTTP ${res.status}).` };
    } catch {
      return { ok: false, error: "Could not reach Typefully. Please try again." };
    }
  },

  async createScheduledDraft(
    apiKey: string,
    input: CreateDraftInput,
  ): Promise<CreateDraftResult> {
    try {
      const body: Record<string, unknown> = {
        content: input.content,
        // Typefully splits long content into a thread automatically when asked.
        threadify: true,
      };
      // Typefully accepts either an ISO 8601 date or the literal
      // "next-free-slot" for `schedule-date`.
      body["schedule-date"] = input.scheduledAt ?? "next-free-slot";

      const res = await fetchWithTimeout(`${BASE_URL}/drafts/`, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: "Typefully rejected the API key. Reconnect and try again." };
        }
        return { ok: false, error: `Typefully could not schedule this post (HTTP ${res.status}).` };
      }

      // Response includes the created draft; surface its id/url when present.
      const data = (await res.json().catch(() => null)) as
        | { id?: number | string; share_url?: string }
        | null;
      const externalId = data?.id != null ? String(data.id) : undefined;
      const url = data?.share_url;
      return { ok: true, externalId, url };
    } catch {
      return { ok: false, error: "Could not reach Typefully. Please try again." };
    }
  },
};
