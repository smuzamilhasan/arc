-- ============================================================================
-- 0002 — comprehensive profile: 8 extended layer columns on client_profile
-- ============================================================================
-- Review artifact (project uses `drizzle-kit push`). All additive, nullable
-- JSONB. v1 + existing v2 untouched.
--
-- Apply: cd lib/db && corepack pnpm push   (dev first, then prod via psql)
-- ============================================================================

ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "goals_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "offers_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "operating_prefs_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "content_strategy_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "channels_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "market_context_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "reputation_v2" jsonb;
ALTER TABLE "client_profile" ADD COLUMN IF NOT EXISTS "identity_v2" jsonb;

-- Rollback: ALTER TABLE "client_profile" DROP COLUMN ... for each (v2-owned).
