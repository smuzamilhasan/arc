---
name: Marketing OS funnel
description: Architecture + tenancy rules for the Marketing OS lead funnel (standalone /marketing-os/ app sharing arc's api-server)
---

# Marketing OS funnel

A standalone admin-gated app at `/marketing-os/` (slug `marketing-os`) that reuses
arc's shared api-server, DB, Clerk, and AI. Spine: capture lead -> AI scores fit
+ drafts a routed outreach email (proposal only) -> human approve sends via
`sendEmail` -> Calendly link surfaced for high-fit. Tiers: high>=70, med>=40, low.

## Tenancy model (the key difference from arc's per-user model)
- Every marketing table (`marketing_leads/actions/connections/activity`) is keyed
  by a `tenant` text column (default `'arc'`), NOT by clientId. v1 is single-tenant.
- **Rule:** every read AND every write/delete must carry an explicit tenant
  predicate (`and(eq(id,...), eq(tenant, MARKETING_TENANT))`). A tenant-scoped
  SELECT followed by an id-only UPDATE/DELETE is a defense-in-depth gap a code
  review will (and did) flag — scope the mutation too, not just the lookup.
- **Why:** the constraint is "tenancy-clean so the funnel can later be multi-tenant";
  relying on global serial-id uniqueness silently breaks the moment a 2nd tenant exists.
- Cleanup lives in `services/marketingData.ts` `deleteTenantMarketingData(tenant, tx?)`,
  deliberately NOT wired into `deleteClientData` (that is clientId-keyed; these are not).
  Its authoritative execution path is the admin-only `POST /marketing/reset` route
  (mirrors `/client/reset`), surfaced as a Danger Zone in the connections page.
  **Lesson:** a tenant-keyed cleanup helper has no home in the per-user delete path,
  so it MUST get its own admin reset route + reachable UI + test, or it ships as
  orphan dead code a review will block on. New marketing tables: add to the helper.

## Propose-and-approve (two-proposal model)
ALL external/stage actions are proposals; nothing happens until a human approves.
The qualifier writes TWO independent `pending` actions per lead: a `route_decision`
(which funnel track to advance into) AND an `outreach_email` (the drafted email).
Re-qualifying deletes ALL prior pending actions (kind-agnostic) first so proposals
never stack. The approve route branches by `action.kind`:
- `route_decision` approve = pure stage transition: advances `lead.status` via
  `leadStatusForRoute` (high->booking, medium->warm, low->nurturing), logs
  `route_approved`, surfaces booking link for high-fit. NO email side effect.
- `outreach_email` approve = sends via `sendEmail`, and only nudges status to
  `contacted` when it is still `new|qualified`, so an approved route is never
  clobbered. `dashboard.emailsSent` counts ONLY approved `outreach_email`.
`GET /leads/:id` and the qualify response return BOTH `action` (latest
outreach_email) and `routeAction` (latest route_decision).
**Why two:** routing (internal funnel stage) and outreach (external send) are
distinct decisions an operator approves/rejects independently.
**All THREE intake paths must auto-qualify** — webhook, public form, AND the
admin manual `POST /marketing/leads`. The manual path is easy to forget; it must
call `qualifyInBackground` too or it silently produces no proposal.
UI activity icon maps must use the REAL backend kinds (lead_captured,
lead_qualified, email_sent, action_rejected, route_approved, connection_saved) —
stale placeholder kinds render no icon.

## Sending
Approve-send must use the tenant's CONNECTED Resend key, not just the shared
proxy — otherwise the stored BYO connection is decorative. `sendEmail` takes an
optional `apiKey`; when set it POSTs the Resend API directly with a Bearer token,
else it uses the Replit connector proxy. The approve route decrypts the marketing
Resend connection and passes it, falling back to the proxy when none is connected.

## Public intake
`routes/marketingPublic.ts` is mounted BEFORE `requireAuth` in routes/index.ts.
Webhook = shared-secret header `x-marketing-secret` vs `MARKETING_WEBHOOK_SECRET`,
fail-closed (503) when the env is unset. Form = IP rate-limited. Both
fire-and-forget background qualification and return 202.

## External connector ingestion (Typeform lead source)
One-way pull only: `services/typeform.ts` reads form responses through the
managed Replit connector proxy (`connectors.proxy("typeform", ...)` — no raw
token ever persisted) and turns each into a captured+auto-qualified lead. Sources
live in tenant-keyed `marketing_form_sources` (field mapping as jsonb, email
required). Admin-gated routes only; new table wired into deleteTenantMarketingData.
**Ingestion-correctness rules (a review will block on these):**
- PAGINATE every sync. Fetching only the first page while advancing the cursor
  permanently skips submissions on busy forms. Walk all pages (token `before`
  cursor, newest-first) and only advance the cursor AFTER all pages are processed.
- Cursor = a submitted_at timestamp passed as `since` (inclusive). Dedup by the
  response `token` (stored as externalId) makes equal-timestamp boundaries safe —
  re-fetched rows are skipped, never double-ingested.
- Dedup needs a DB backstop, not just a SELECT-then-insert: a partial unique index
  on (tenant, external_source, external_id) WHERE external_id IS NOT NULL guards
  against a poller/manual-sync race. Catch SQLSTATE 23505 in the sync loop and
  count it as a skip instead of failing the whole run.
- Poller (`startTypeformPoller`) must be guarded: single-start, disabled in test
  (NODE_ENV), env-tunable interval (nonpositive disables), and `unref()` the timer.

## Typeform webhooks (instant capture; poller stays as backfill)
- Public route `POST /marketing/intake/typeform/webhook` (mounted before auth)
  gives near-instant capture; the poller stays on as a catch-up safety net.
- Webhook + poller share ONE ingest helper (`ingestResponse`) so dedup-by-token
  + the unique index make a doubly-delivered response create exactly one lead.
  The webhook deliberately does NOT advance the source cursor — that stays owned
  by the poller, so a webhook can never skip the cursor past un-ingested rows.
- Auth is Typeform's HMAC-SHA256 over the RAW body (`Typeform-Signature` header),
  constant-time compared. Needs the exact bytes, so `express.json({verify})` in
  `app.ts` stashes `req.rawBody` — re-serializing the parsed JSON breaks the HMAC.
  Fail-closed: no secret configured -> 503 and no webhook registration.
- Secret resolves `MARKETING_TYPEFORM_WEBHOOK_SECRET` then falls back to the
  shared `MARKETING_WEBHOOK_SECRET`. We register the same secret WITH the webhook
  (`PUT /forms/{id}/webhooks/{tag}`), so Typeform signs with it.
- Saving/deleting a form source registers/removes its webhook (per-tenant `tag`),
  best-effort: failures are logged, never block the source write (poller covers).
  A disabled source removes its webhook. Connector proxy PUT/DELETE JSON-encodes
  an object `body` automatically (`tfWrite`).
