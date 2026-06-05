import type { SchedulerProvider, ProviderMeta } from "./types";
import { typefullyProvider } from "./typefully";

export type { SchedulerProvider, ProviderMeta, VerifyResult, CreateDraftInput, CreateDraftResult } from "./types";

// The registry of supported scheduler providers. Add a new provider here and
// every caller (connect/verify, hand-off) picks it up automatically.
const PROVIDERS: Record<string, SchedulerProvider> = {
  [typefullyProvider.meta.id]: typefullyProvider,
};

export function getProvider(id: string): SchedulerProvider | undefined {
  return PROVIDERS[id];
}

export function isSupportedProvider(id: string): boolean {
  return id in PROVIDERS;
}

// Public, non-sensitive metadata for every supported provider, for the
// Connections UI.
export function listProviderMeta(): ProviderMeta[] {
  return Object.values(PROVIDERS).map((p) => p.meta);
}
