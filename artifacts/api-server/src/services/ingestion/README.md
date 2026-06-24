# Apify ingestion service

Pulls a user's public footprint (LinkedIn / X / YouTube transcripts) via Apify actors, normalizes to `voice_samples`, dedupes by content hash, and notifies the voice extractor.

See `docs/v2/prds/apify-ingestion.md` for design rationale.

## Architecture

```
dispatchIngest(req)
   │
   ▼
ingest_runs (status: running) ◄──┐
   │                              │ (finishIngestRun on success/failure)
   ▼                              │
runActor(actorId, input) ── Apify HTTP ───► run polling ─► dataset items
   │
   ▼
normalize per source ─► dedupe vs existing content_hash
   │
   ▼
insertVoiceSamples ─► newSampleIds
   │
   ▼
ingestNotifier.emit(IngestEvent) ─► voice extractor subscribes
```

## File map

```
ingestion/
├── apifyClient.ts        # Typed Apify HTTP wrapper + run polling
├── actors.ts             # Per-source actor catalog (DEFAULT_ACTORS)
├── dispatcher.ts         # Orchestrator (the public dispatchIngest function)
├── repo.ts               # Drizzle IngestRepo implementation
├── notifier.ts           # In-process IngestNotifier (EventEmitter)
├── normalizers/
│   ├── types.ts          # Normalizer = (rawItem, context) => NormalizedSample | null
│   ├── linkedin.ts       # Accepts several LinkedIn actor field shapes defensively
│   ├── x.ts              # Skips replies, normalizes engagement metrics
│   ├── youtube.ts        # Splits transcripts into ~500-word chunks
│   └── index.ts          # NORMALIZERS map
├── index.ts              # Public entry point
└── README.md
```

## Required env

```bash
APIFY_TOKEN=<your apify api token>
```

Set in Railway env for the api-server. Locally, add to `.env` next to other secrets.

## Operator workflow (first run)

1. **Confirm actor selection.** Check `actors.ts` — `apimaestro/linkedin-profile-posts`, `apidojo/twitter-scraper-lite`, `pintostudio/youtube-transcript-scraper` are placeholders. Browse the [Apify Store](https://apify.com/store) for the current highest-rated actor per platform and update the `actorId` strings.
2. **Set `APIFY_TOKEN` env var.**
3. **Trigger first ingest for Muzamil (calibration user)** via a route, script, or REPL:

```ts
import { dispatchIngest, drizzleIngestRepo, ingestNotifier } from "./services/ingestion";

await dispatchIngest(
  { clientId: <muzamil's client_profile.id>, source: "linkedin", handle: "muzamilhasan" },
  { repo: drizzleIngestRepo, notifier: ingestNotifier }
);
```

4. **Verify** `voice_samples` table has rows and `ingest_runs` row is `succeeded`.
5. **Voice extractor** auto-runs when subscribed to `ingestNotifier` (wired in v2/voice-extractor-route follow-up).

## Cost ceilings

Hardcoded per-source in `actors.ts` (`costCeilingUsd`). The client aborts the Apify run if usage exceeds the ceiling. Foundation defaults:

- LinkedIn: $1.00
- X: $1.00
- YouTube transcripts: $1.50

Total per-user first-ingest cap: $5 (per PRD).

## Dedupe

Each sample's content is normalized (lowercase + whitespace-collapse) and SHA-256'd. The hash is unique per `(client_id, content_hash)`. Re-running ingest on the same user is idempotent — only new posts land.

## Failure modes handled

- **Apify config missing** → `ApifyConfigError` re-raised so the operator sees it
- **Actor down / 4xx / 5xx** → `ApifyRunError`, `ingest_runs.status = 'failed'` with error message
- **Run timeout (>10 min default)** → abort + fail
- **Cost ceiling breach** → abort + fail
- **Empty result / actor returns nothing** → succeeds with 0 samples; logged
- **Malformed rows** → normalizer returns `null`, row skipped silently (count surfaces as the difference between dataset size and `samplesIngested`)

## Privacy

We store only the user's own public content. Per the PRD:

- Consent UX gates the handle collection (UI lands with conversational onboarding)
- User can purge all samples; cascades to voice_features re-computation
- No re-publishing of ingested content anywhere outside the user's own assistant context

## Out of scope for this PR

- OAuth-based ingestion (for sources where it's available) — later, replaces Apify for those
- Real-time tracking of new posts — v3 (would require webhooks per platform)
- Podcast transcripts, blog/newsletter RSS — v3
