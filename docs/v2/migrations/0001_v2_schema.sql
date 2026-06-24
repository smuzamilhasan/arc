-- ============================================================================
-- v2 schema migration — review artifact, generated from drizzle-kit
-- ============================================================================
--
-- This file is a HUMAN-REVIEW ARTIFACT. The project's runtime workflow is
-- `drizzle-kit push`, not `drizzle-kit migrate`, so this file is not executed
-- by an automated migrator.
--
-- To APPLY in dev:
--   1. Review every statement below.
--   2. Back up the dev DB.
--   3. From repo root:  cd lib/db && corepack pnpm push
--      (this syncs schema state from src/schema/index.ts to the DB)
--
-- To APPLY in prod:
--   1. Take a backup (scripts/backup-prod-db.mjs).
--   2. Apply this exact SQL via psql, NOT via drizzle-kit push, so the prod
--      apply is bounded to the statements you reviewed here.
--   3. After the apply, smoke-test `clientProfileTable` reads to confirm v1
--      services are unaffected (the columns added are nullable JSONB; v1
--      services never touch them, so nothing should break).
--
-- All changes are ADDITIVE. No v1 column is dropped or renamed.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Add v2 structured layers to client_profile (nullable JSONB, additive)
-- ----------------------------------------------------------------------------

ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "positioning_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "icp_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "voice_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "worldview_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "negative_space_v2" jsonb;


-- ----------------------------------------------------------------------------
-- 2) voice_samples — real artifacts ingested from public footprint or paste
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "voice_samples" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "source" text NOT NULL,           -- linkedin | x | youtube_transcript | ...
    "platform" text,
    "content" text NOT NULL,
    "content_hash" text NOT NULL,      -- sha256 of normalized content (dedupe)
    "ingested_at" timestamp DEFAULT now() NOT NULL,
    "metadata" jsonb                   -- url, published_at, engagement, ...
);

CREATE INDEX IF NOT EXISTS "voice_samples_client_idx"
    ON "voice_samples" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "voice_samples_hash_idx"
    ON "voice_samples" USING btree ("client_id", "content_hash");


-- ----------------------------------------------------------------------------
-- 3) voice_features — point-in-time snapshots of computed voice features
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "voice_features" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "computed_at" timestamp DEFAULT now() NOT NULL,
    "features" jsonb NOT NULL,
    "sample_count" integer DEFAULT 0 NOT NULL,
    "confidence" real DEFAULT 0 NOT NULL,
    "input_digest" jsonb NOT NULL      -- { sample_ids[], hash } for cache invalidation
);

CREATE INDEX IF NOT EXISTS "voice_features_client_idx"
    ON "voice_features" USING btree ("client_id", "computed_at");


-- ----------------------------------------------------------------------------
-- 4) story_bank — redeployable anecdotes, candidate → confirmed
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "story_bank" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "summary" text NOT NULL,
    "body" text NOT NULL,
    "themes" text[] DEFAULT '{}' NOT NULL,
    "source_sample_ids" integer[] DEFAULT '{}' NOT NULL,
    "audience_resonance" jsonb,
    "status" text DEFAULT 'candidate' NOT NULL,  -- candidate | confirmed | archived
    "confidence" integer DEFAULT 0 NOT NULL,      -- 0-100
    "last_used_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "story_bank_client_idx"
    ON "story_bank" USING btree ("client_id", "status");


-- ----------------------------------------------------------------------------
-- 5) reference_library — people, books, frameworks, events the user cites
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "reference_library" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "kind" text NOT NULL,              -- person | book | framework | event | company | concept
    "label" text NOT NULL,
    "context" text DEFAULT '' NOT NULL,
    "citation_count" integer DEFAULT 0 NOT NULL,
    "last_cited_at" timestamp,
    "source_sample_ids" integer[] DEFAULT '{}' NOT NULL,
    "status" text DEFAULT 'candidate' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "reference_library_client_idx"
    ON "reference_library" USING btree ("client_id", "status");
CREATE INDEX IF NOT EXISTS "reference_library_kind_idx"
    ON "reference_library" USING btree ("client_id", "kind");


-- ----------------------------------------------------------------------------
-- 6) anti_examples — sample texts the user says sounds NOTHING like them
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "anti_examples" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "sample_text" text NOT NULL,
    "why_not_this_voice" text DEFAULT '' NOT NULL,
    "source_url" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "anti_examples_client_idx"
    ON "anti_examples" USING btree ("client_id");


-- ----------------------------------------------------------------------------
-- 7) ingest_runs — audit trail of Apify ingest invocations
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ingest_runs" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "source" text NOT NULL,
    "actor_id" text NOT NULL,
    "apify_run_id" text,
    "status" text DEFAULT 'queued' NOT NULL,
    "started_at" timestamp DEFAULT now() NOT NULL,
    "finished_at" timestamp,
    "samples_ingested" integer DEFAULT 0 NOT NULL,
    "samples_deduped" integer DEFAULT 0 NOT NULL,
    "cost_usd" real DEFAULT 0 NOT NULL,
    "error_message" text,
    "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "ingest_runs_client_idx"
    ON "ingest_runs" USING btree ("client_id", "started_at");
CREATE INDEX IF NOT EXISTS "ingest_runs_status_idx"
    ON "ingest_runs" USING btree ("status");


-- ----------------------------------------------------------------------------
-- 8) onboarding_sessions — multi-turn Onboarder conversation state
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "onboarding_sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,  -- active | wrapped | paused | abandoned
    "started_at" timestamp DEFAULT now() NOT NULL,
    "last_turn_at" timestamp DEFAULT now() NOT NULL,
    "wrapped_at" timestamp,
    "wrap_reason" text,
    "log" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "slot_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "profile_snapshot_at_start" jsonb,
    "aggregate_confidence" real DEFAULT 0 NOT NULL,
    "turn_count" integer DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "onboarding_sessions_client_idx"
    ON "onboarding_sessions" USING btree ("client_id", "status");
CREATE INDEX IF NOT EXISTS "onboarding_sessions_active_idx"
    ON "onboarding_sessions" USING btree ("client_id", "started_at");


-- ============================================================================
-- Summary of changes
-- ============================================================================
--
-- ADDED:
--   • 5 nullable jsonb columns on client_profile
--   • 7 new tables: voice_samples, voice_features, story_bank,
--     reference_library, anti_examples, ingest_runs, onboarding_sessions
--   • 13 indexes
--
-- DROPPED / RENAMED / ALTERED (existing):
--   • None
--
-- IMPACT ON v1:
--   • Zero. v1 services never read these columns or tables.
--
-- ROLLBACK:
--   • DROP the 7 new tables (no FKs reference them externally, so this is safe).
--   • ALTER TABLE "client_profile" DROP COLUMN ... for the 5 v2 columns
--     (data loss is acceptable; v2 services own these columns exclusively).
-- ============================================================================
