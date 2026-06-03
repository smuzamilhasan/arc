---
name: e2e testing an authed page with seeded DB data
description: How to runTest a Clerk-gated page that needs pre-existing per-user data
---

To e2e test a page that requires Clerk auth AND pre-existing per-user data (e.g. the Narrative results/edit view, which needs an existing narrative), without triggering AI generation:

1. `runTest({ testClerkAuth: true, ... })` and a `[Clerk Auth] Sign in as {...}` step — programmatic, no Clerk UI interaction.
2. After sign-in, read the Clerk user id in the browser via `window.Clerk.user.id` (poll until non-null). This is the only reliable way to get the signed-in user's id to link DB rows.
3. `[DB] INSERT` the `client_profile` (user_id = that Clerk id) `RETURNING id`, then insert dependent rows (e.g. `narrative_profiles` with that `client_id`).
4. Navigate to the page and exercise the UI.

**Why:** per-user data is scoped by `client_profile.user_id` = Clerk userId, but that id isn't known until sign-in; querying the DB for it doesn't work because the row doesn't exist until the app creates it. Seeding directly avoids the AI-driven onboarding/narrative generation, keeping the test deterministic. Leaving coach fields empty prevents the Narrative page's auto-synthesis from firing.

**How to apply:** any Clerk-gated artifact page that depends on seeded relational data — grab `window.Clerk.user.id`, seed via `[DB]`, then test.

## Standalone committed Playwright suite (when runTest isn't accepted)

A committed suite lives in `artifacts/personal-brand/e2e` (config + global.setup with `clerkSetup`). Two non-obvious gotchas cost the most time:

- **The Clerk instance enforces a second factor.** Client-side password sign-in (`clerk.signIn` / `signIn.create({ strategy: "password" })`) returns `status: "needs_second_factor"` and never establishes a session. Fix: create a Backend **sign-in token** (`POST /v1/sign_in_tokens` with `{ user_id }`), then in the browser `Clerk.client.signIn.create({ strategy: "ticket", ticket })` + `Clerk.setActive(...)`. The ticket strategy bypasses MFA/verification. Still call `setupClerkTestingToken({ page })` first to clear bot protection.
- **Playwright's bundled Chromium needs system libs in the NixOS container** (libglib, nss, gtk3, mesa/libgbm, xorg.*, etc.) or it fails with `libglib-2.0.so.0` not found. Install via `installSystemDependencies` (records them in `replit.nix`).

**Why:** these are instance/environment constraints invisible from the code — the password flow "succeeds" without throwing yet leaves you signed out, and the browser launch failure looks unrelated to auth.
