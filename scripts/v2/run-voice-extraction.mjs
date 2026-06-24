// Ops script — run voice extraction for one client without going through the
// HTTP route. Use during calibration or to bootstrap Muzamil's profile.
//
// Usage:
//   node scripts/v2/run-voice-extraction.mjs --client 7
//
// Required env (same as the api-server):
//   DATABASE_URL
//   AI_INTEGRATIONS_OPENAI_API_KEY
//   AI_INTEGRATIONS_OPENAI_BASE_URL

import { extractForClient } from "../../artifacts/api-server/dist/services/voiceExtractionService.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--client") out.client = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.client) {
    console.error("Missing --client <id>");
    process.exit(2);
  }
  const result = await extractForClient(args.client);
  console.log(JSON.stringify(result, null, 2));
  if (result.kind === "error") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
