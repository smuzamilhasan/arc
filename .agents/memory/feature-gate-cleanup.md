---
name: Per-client derived tables must be wired into deletion
description: When adding a table keyed by clientId, add it to deleteClientData or reset/account-delete leaks it
---

# New per-client tables must join the deletion path

When you add a table keyed by `clientId` (e.g. `platform_strategies`, `content_strategies`), you MUST also add a delete for it inside `deleteClientData` in `artifacts/api-server/src/routes/client.ts`. That helper backs both `POST /client/reset` and `DELETE /account`.

**Why:** These tables have no FK cascade to `client_profile`, so rows survive reset/account-deletion and leave AI-derived personal data behind. A code review caught `platform_strategies` already leaking this way before `content_strategies` was added.

**How to apply:** Any new `clientId`-keyed table → add `tx.delete(<table>).where(eq(<table>.clientId, clientId))` to `deleteClientData`, and add it to the test `cleanupUser` helper plus a reset-purge regression test in `test/isolation.test.ts`.
