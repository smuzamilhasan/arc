import app from "./app";
import { logger } from "./lib/logger";
import { startProactiveScheduler } from "./services/proactiveScheduler";
import { startTypeformPoller } from "./services/typeform";
import { startVoiceExtractionWorker } from "./services/voiceExtractionService";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startProactiveScheduler();
  startTypeformPoller();
  // v2: subscribe the VoiceExtractor to ingestNotifier so a successful
  // Apify ingest auto-fires extraction. Idempotent — safe to call once at boot.
  // No-op until samples land in voice_samples; no cost until then.
  startVoiceExtractionWorker();
});
