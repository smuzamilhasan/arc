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

## Propose-and-approve
ALL external actions are proposals. The qualifier writes a single `pending`
`outreach_email` action; nothing sends until a human approves. Re-qualifying
deletes the prior pending action first so proposals never stack.

## Public intake
`routes/marketingPublic.ts` is mounted BEFORE `requireAuth` in routes/index.ts.
Webhook = shared-secret header `x-marketing-secret` vs `MARKETING_WEBHOOK_SECRET`,
fail-closed (503) when the env is unset. Form = IP rate-limited. Both
fire-and-forget background qualification and return 202.
