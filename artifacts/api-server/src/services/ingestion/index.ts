// Apify ingestion service — public entry point.
//
// Usage from a route handler or job:
//
//   import { dispatchIngest, drizzleIngestRepo, ingestNotifier } from "./services/ingestion";
//   const result = await dispatchIngest(
//     { clientId, source: "linkedin", handle },
//     { repo: drizzleIngestRepo, notifier: ingestNotifier }
//   );
//
// Required env: APIFY_TOKEN. See docs/v2/prds/apify-ingestion.md.

export { dispatchIngest } from "./dispatcher";
export type { IngestRequest, IngestResult, IngestEvent, IngestRepo, IngestNotifier } from "./dispatcher";
export { drizzleIngestRepo } from "./repo";
export { ingestNotifier } from "./notifier";
export { DEFAULT_ACTORS } from "./actors";
export type { ActorConfig } from "./actors";
export { ApifyConfigError, ApifyRunError } from "./apifyClient";
