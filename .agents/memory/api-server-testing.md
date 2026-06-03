---
name: api-server testing setup
description: Non-obvious gotchas when writing integration tests for the Express api-server.
---

# api-server integration tests

Tests run with `vitest run` against the real Postgres (`DATABASE_URL` required), driving the real Express app via supertest.

## Faking Clerk auth
`requireAuth` resolves the user via `getAuth(req)`. Tests `vi.mock("@clerk/express")` so `clerkMiddleware` is a passthrough and `getAuth` reads the user id from a test-only request header. One app can then be driven as multiple distinct users or unauthenticated.
**Why:** there is no real Clerk session in the runner; mocking the module is the only way to exercise the real route + isolation logic end-to-end.

## AI clients throw at import time
The AI integration client modules throw on import if their `AI_INTEGRATIONS_*` env vars are missing, and importing the app transitively loads them (routes -> audit/narrative/profile services). The test setup sets placeholder values for any missing AI env var so import succeeds; tests never call AI.
**How to apply:** if a new route/service imports another integration client, give its env vars placeholder fallbacks in the test setup or the suite crashes at import before any assertion.
