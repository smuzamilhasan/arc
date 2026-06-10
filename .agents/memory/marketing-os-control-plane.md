---
name: Marketing OS control plane (provisioning)
description: How the Marketing OS "build layer" provisions config INTO external tools; the plan/apply safety model and how to add a provisionable tool.
---

# Marketing OS control plane / provisioning

Marketing OS is an orchestration layer: a per-tenant **blueprint** (desired funnel
state) is reconciled INTO the user's own tools (e.g. create a Typeform intake form,
create an Airtable CRM base). It never silently writes to an external tool.

## Plan -> apply safety model (human-in-the-loop)
- `plan` persists a `planned` provision run = a previewable diff. **Plans must NEVER
  store secrets** — only structural config. `apply` re-reads credentials from the
  encrypted connection store at write time.
- `apply` must **atomically claim** the run before any external write: a conditional
  `UPDATE ... SET status='applying' WHERE tenant=? AND id=? AND status='planned'
  RETURNING`. Proceed only if exactly one row is claimed; otherwise 409.
  **Why:** without the claim, two concurrent confirm requests both pass a read-time
  `status==='planned'` check and both write to the external tool (duplicate
  forms/bases, cost spikes). Terminal updates (applied/failed) must also guard on
  `tenant + status='applying'`, never `id` alone, to avoid stale cross-state writes.
- Status lifecycle: `planned -> applying -> applied | failed`. `applying` is the
  transient claim state.

## Adding a provisionable tool
1. Register it in `services/marketingConnectors.ts` (id, label, category, authType
   `byokey`|`managed`, provisionable, accountRef metadata). The connector registry is
   the single server-authoritative source for connection status + UI cards.
2. Add a `ProvisionAdapter` ({plan, apply}) in `services/provisioning.ts` and wire it
   into `getProvisionAdapter`. Throw `ProvisionError` for user-facing failures.
3. BYO-key connections save/test/list is already generalized — new `byokey` providers
   need no new connection route; the frontend `ByoKeyConnectionCard` renders them off
   the registry automatically.

## Tenancy + gating
- Everything tenant-scoped via `MARKETING_TENANT` ("arc"). All control-plane routes
  are `requireAdmin`; plan/apply also `externalApiRateLimit`.
- New tenant-keyed tables (marketing_blueprints, marketing_provision_runs) MUST be
  added to `deleteTenantMarketingData` (and the marketingCleanup test) or rows leak.
