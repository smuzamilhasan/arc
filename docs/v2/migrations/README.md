# v2 schema migration

This folder holds the **review artifact** for the v2 schema additions. The project's runtime DB workflow is `drizzle-kit push` (state-based) rather than `drizzle-kit migrate` (file-based), so the SQL here is for **human review before applying**, not for an automated migrator.

## Files

- [`0001_v2_schema.sql`](./0001_v2_schema.sql) — the additive SQL the v2 work needs

## Dev apply (recommended workflow)

After reviewing the SQL above:

```bash
cd lib/db
corepack pnpm push
```

`drizzle-kit push` will diff the live dev DB against `src/schema/index.ts` and apply the additive deltas. Because all v2 changes are nullable column adds + new tables, the diff should match the reviewed SQL exactly.

## Prod apply (manual, explicit)

For prod, **do not use `pnpm push`** — it operates on whatever state the schema files currently encode and could pick up unintended drift. Instead:

```bash
# 1. Back up first
node scripts/backup-prod-db.mjs

# 2. Apply the reviewed SQL via psql
psql "$PROD_DATABASE_URL" -f docs/v2/migrations/0001_v2_schema.sql

# 3. Verify v1 services still read client_profile correctly
curl -s "$PROD_URL/api/client/<some-client-id>" | jq .  # smoke
```

## Changes summarized

**Added** (all additive, all v2-owned):
- 5 nullable `jsonb` columns on `client_profile`: `positioning_v2`, `icp_v2`, `voice_v2`, `worldview_v2`, `negative_space_v2`
- 7 new tables: `voice_samples`, `voice_features`, `story_bank`, `reference_library`, `anti_examples`, `ingest_runs`, `onboarding_sessions`
- 13 indexes

**Removed / renamed / altered**: nothing.

**Impact on v1 services**: zero. They don't read v2 columns or tables.

## Rollback

If something goes wrong post-apply, the rollback is straightforward — v2 owns these columns and tables exclusively, so dropping them is safe:

```sql
-- Drop v2 tables (no FKs reference them externally)
DROP TABLE IF EXISTS onboarding_sessions;
DROP TABLE IF EXISTS ingest_runs;
DROP TABLE IF EXISTS anti_examples;
DROP TABLE IF EXISTS reference_library;
DROP TABLE IF EXISTS story_bank;
DROP TABLE IF EXISTS voice_features;
DROP TABLE IF EXISTS voice_samples;

-- Drop v2 columns on client_profile
ALTER TABLE client_profile DROP COLUMN IF EXISTS positioning_v2;
ALTER TABLE client_profile DROP COLUMN IF EXISTS icp_v2;
ALTER TABLE client_profile DROP COLUMN IF EXISTS voice_v2;
ALTER TABLE client_profile DROP COLUMN IF EXISTS worldview_v2;
ALTER TABLE client_profile DROP COLUMN IF EXISTS negative_space_v2;
```

## Why not migration files in `lib/db/migrations/`?

Because the project doesn't use the file-based migrator. Adding migration files now would conflict with the existing `push`-based workflow and require switching everything over. That's a separate decision; for now, the SQL here is the source of truth for what gets applied.

If you want to move to a versioned migrator (recommended once v2 stabilizes), that's a future PR — and these review artifacts become the first checked-in migrations.
