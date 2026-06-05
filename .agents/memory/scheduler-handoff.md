---
name: Scheduler hand-off (BYO third-party scheduler)
description: arc pushes planned posts into a client's OWN scheduler; it never publishes directly. Architecture + invariants.
---

# Scheduler hand-off

Clients connect their OWN third-party scheduler (Typefully first) by pasting their
own API key. arc pushes planned posts into that scheduler but NEVER publishes
directly — the scheduler stays in control of going live.

**Why:** explicit product boundary for this feature. Direct publishing, OAuth, and
publish-status tracking are deliberately out of scope. Don't add "publish now" or
poll the provider for live status — that breaks the trust model (arc only hands off).

**How to apply:**
- Per-client third-party secrets are encrypted at rest with AES-256-GCM keyed by
  the shared env `APP_ENCRYPTION_KEY` (32-byte hex). The encrypted key is never
  returned in any API response or log — connection list endpoints return status
  only (`connected`, `accountRef`), never the key.
- Hand-off is its own per-post state (`handoffProvider`/`handoffAt`/`handoffRef`),
  distinct from the internal draft/scheduled/published status. A post can be
  "Sent to <scheduler>" without changing its internal status.
- Adding another scheduler = implement the provider interface (verifyCredentials +
  createScheduledDraft) and register it; the registry/metadata drives both the API
  `/connections/providers` list and the web Connections page automatically.
- Outbound provider calls (connect/verify + hand-off) are rate-limited per user
  (externalApiRateLimit, 60/hr) since each call hits an external provider.
- There is a client-side CSV + ICS "Export plan" fallback built purely from the
  posts already loaded in the page (no endpoint, no third-party call) for tools
  with no public API.
- The scheduler-connections table is keyed by clientId, so it MUST be in
  deleteClientData cleanup (see feature-gate-cleanup memory) — already wired.
