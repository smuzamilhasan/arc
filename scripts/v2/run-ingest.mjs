// Ops script — trigger an Apify ingest for one client + source, end-to-end.
//
// Usage:
//   node scripts/v2/run-ingest.mjs --client 7 --source linkedin --handle muzamilhasan
//
// What it does:
//   1. Subscribes the VoiceExtractor worker (so extraction auto-fires when
//      samples land — same behavior as the production boot path)
//   2. Calls dispatchIngest with your inputs
//   3. Waits up to 60s for the async extractor to finish so you see the full
//      pipeline output before the process exits
//
// Required env (same as the api-server):
//   APIFY_TOKEN
//   DATABASE_URL
//   AI_INTEGRATIONS_OPENAI_API_KEY
//   AI_INTEGRATIONS_OPENAI_BASE_URL
//
// Build first:  cd artifacts/api-server && corepack pnpm run build

import {
  dispatchIngest,
  drizzleIngestRepo,
  ingestNotifier,
} from "../../artifacts/api-server/dist/services/ingestion/index.js";
import { startVoiceExtractionWorker } from "../../artifacts/api-server/dist/services/voiceExtractionService.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--client") out.client = Number(argv[++i]);
    else if (a === "--source") out.source = argv[++i];
    else if (a === "--handle") out.handle = argv[++i];
    else if (a === "--max-items") out.maxItems = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.client || !args.source || !args.handle) {
    console.error("Usage: node scripts/v2/run-ingest.mjs --client <id> --source <linkedin|x|youtube_transcript> --handle <handle-or-url>");
    process.exit(2);
  }

  // Subscribe the extractor BEFORE dispatching so we catch the
  // samples-ready event the dispatcher emits on success.
  startVoiceExtractionWorker();

  console.log(`[ingest] dispatching client=${args.client} source=${args.source} handle=${args.handle}`);
  const result = await dispatchIngest(
    {
      clientId: args.client,
      source: args.source,
      handle: args.handle,
      maxItems: args.maxItems ?? 100,
    },
    { repo: drizzleIngestRepo, notifier: ingestNotifier }
  );

  console.log("[ingest] result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "failed") {
    console.error("[ingest] FAILED — extractor will not run");
    process.exit(1);
  }

  // Give the extractor up to 60s to finish. The worker fires async via the
  // EventEmitter; without this wait the process would exit before it's done.
  console.log(`[ingest] waiting up to 60s for VoiceExtractor to finish…`);
  await new Promise((resolve) => setTimeout(resolve, 60_000));
  console.log(`[ingest] done. check voice_features + client_profile.voice_v2 in the DB.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
