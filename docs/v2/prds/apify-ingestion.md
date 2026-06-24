# PRD — Apify ingestion pipeline

## Problem

Voice training in v1 is based entirely on self-reported text. The richest signal — the user's actual posts, talks, transcripts — is never ingested.

## Outcome

A pipeline that, given a user's public handles, ingests their public footprint via Apify actors, normalizes to a uniform `voice_sample` row shape, and triggers voice extraction.

## Sources (in priority order)

| Source | Apify actor (representative) | Why |
|---|---|---|
| LinkedIn posts | `apimaestro/linkedin-profile-posts` or equivalent | Highest signal for ICP |
| X / Twitter | `apidojo/twitter-scraper-lite` or equivalent | Second-highest |
| YouTube transcripts | `streamers/youtube-scraper` | Long-form voice signal |
| Podcast appearances | manual URL list + transcription | Most raw voice |
| Blog / newsletter | RSS or scraper | Long-form written |
| Comments / replies | secondary pass | Most unfiltered |

Actor selection is configurable per source so we can swap when a better actor appears.

## Pipeline

```
user provides handles
   │
   ▼
ingest scheduler ──► Apify run dispatched per source ──► raw JSON
   │                                                       │
   │  ◄────── status polling ──────────────────────────────┘
   ▼
normalizer: actor-specific → uniform VoiceSampleRow
   │
   ▼
dedupe (content_hash) → write to voice_samples
   │
   ▼
emit IngestEvent(client_id, sample_ids) → voice extraction agent
```

## Schema (already in profile-schema-v2 PRD)

`voice_samples` table holds normalized rows. `ingest_runs` table tracks Apify runs (cost, status, errors).

## Cost + rate limiting

- Per-user cap on first ingest: $5 Apify spend max
- Per-user cadence: re-pull every 30 days unless user requests sooner
- Per-source rate limits respected (LinkedIn especially)
- Apify cost logged per run for ROI tracking

## Consent + privacy

- Explicit consent screen during onboarding before any handle is queried
- Stored data is the user's own public content; we don't store third parties'
- Deletion: user can purge all samples; cascades to voice_features re-computation
- No re-publishing of ingested data anywhere

## Failure modes

- Actor down → degrade to next source, surface in onboarding
- Handle private / not found → ask user
- Empty result → log + ask user for paste-in fallback
- Apify quota exceeded → queue + notify

## Acceptance

- Apify client wrapper with typed actor invocation
- LinkedIn ingest end-to-end on Muzamil's real handle
- 50+ samples land in `voice_samples` with correct dedupe
- IngestEvent triggers voice extraction stub (extraction agent ships in its own PRD)
- Consent UX present in onboarding

## Out of scope

- OAuth-based ingestion (where Apify isn't needed) — later
- Real-time tracking of new posts — v3
- Cross-user discovery / similarity — out of scope entirely
