---
name: Adding a client_profile field (full path)
description: The non-obvious last step when adding intake fields — the /client upsert route must map them explicitly.
---

Adding a new persisted field to `client_profile` is NOT done after schema + openapi + codegen.

**The rule:** the `PUT /client` handler builds an explicit `values` object field-by-field. A new column in the Drizzle schema + OpenAPI `ClientProfileInput` will typecheck and generate hooks fine, but the field is silently dropped on save unless you also add it to that `values` map in `routes/client.ts`.

**Why:** the upsert does not spread `parsed.data`; it whitelists each field with `data.x ?? default`. Missing fields fall back to DB defaults (empty string / null), so onboarding data looks collected but never lands in the row, and downstream consumers (narrative synthesis) silently get empty input.

**How to apply:** any time you add a field intended to persist from onboarding, update all four: schema, openapi `ClientProfile` + `ClientProfileInput`, run codegen, AND the `values` object in `routes/client.ts`. Verify with a PUT-then-GET round-trip, not just a typecheck.

## `PUT /client` overwrites the WHOLE row

`upsertClient` is a full-row upsert, not a patch: it replaces every column from the `values` map. Any client that submits a partial `ClientProfileInput` (e.g. a single-pillar editor) will wipe every field it didn't include.

**Rule:** any partial-save UI must first load the full profile and merge edits onto it before PUT. The web app does this with `clientToInput(client)` in `personal-brand/src/lib/blueprint.ts` (strips id/createdAt/updatedAt, coalesces nullable URL/date fields to ""), then spreads the edited fields over it. The Brand Blueprint pillar editors all save via `{ ...clientToInput(client), ...edited, onboardingComplete: true }`.

**Why:** the field-by-field `values` whitelist means an omitted field falls back to its DB default, so a partial PUT silently erases unrelated pillars' data.
