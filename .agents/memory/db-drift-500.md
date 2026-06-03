---
name: client_profile 500 = dev DB drift
description: A 500 on /api/client with a "Failed query: select ... from client_profile" usually means dev DB schema drift, not app/frontend code.
---

# /api/client 500 on a select == dev DB schema drift

If `GET`/`PUT /api/client` returns 500 and the api-server log shows
`Failed query: select ... from client_profile`, suspect the dev Postgres
table is missing a column the Drizzle schema declares (drift), NOT the
route/frontend code. Confirm with:
`SELECT column_name FROM information_schema.columns WHERE table_name='client_profile'`
and compare to `lib/db/src/schema/clientProfile.ts`.

**Fix:** `pnpm --filter @workspace/db run push` to sync the dev DB, then re-verify.

**Why:** The shared dev DB can lag behind schema changes (a real instance:
`onboarding_step` existed in the schema but not the table, 500-ing every
profile read and blocking the whole app). When an e2e/test fails with this
symptom, triage the DB before assuming your code change is wrong.

**How to apply:** Any task where /api/client suddenly 500s — especially right
after pulling schema changes — check column parity and run db push first.
