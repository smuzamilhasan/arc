// A scheduler provider is a thin adapter over one third-party scheduling tool
// (Typefully, Publer, ...). Callers (routes) never talk to a provider's HTTP API
// directly — they go through this interface so adding a provider is just adding
// a new implementation to the registry, with no changes to callers.

// Static, non-sensitive metadata about a provider, surfaced to the web app so it
// can render the Connections UI without hardcoding the provider list.
export type ProviderMeta = {
  id: string;
  label: string;
  // Whether this provider supports an API hand-off. Providers with no usable
  // public API (e.g. Later) are surfaced for awareness but rely on export.
  supportsApi: boolean;
  // Where the client finds their API key.
  apiKeyUrl?: string;
};

export type VerifyResult =
  | { ok: true; accountLabel?: string }
  | { ok: false; error: string };

export type CreateDraftInput = {
  // The post body to schedule.
  content: string;
  // ISO 8601 timestamp for when the scheduler should publish. When omitted the
  // provider uses its own "next free slot" behavior.
  scheduledAt?: string;
  // A short title, used only where a provider supports it.
  title?: string;
};

export type CreateDraftResult =
  | { ok: true; externalId?: string; url?: string }
  | { ok: false; error: string };

export interface SchedulerProvider {
  readonly meta: ProviderMeta;
  // Validate an API key by calling the provider. Must not throw for ordinary
  // auth failures — return { ok: false } with a human-readable error instead.
  verifyCredentials(apiKey: string, accountRef?: string): Promise<VerifyResult>;
  // Create a scheduled draft in the provider from a post. Must not throw for
  // ordinary provider errors — return { ok: false } with a readable error.
  createScheduledDraft(
    apiKey: string,
    input: CreateDraftInput,
    accountRef?: string,
  ): Promise<CreateDraftResult>;
}
