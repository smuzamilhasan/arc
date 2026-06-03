---
name: Adding a client_profile field (full path)
description: The non-obvious last step when adding intake fields — the /client upsert route must map them explicitly.
---

Adding a new persisted field to `client_profile` is NOT done after schema + openapi + codegen.

**The rule:** the `PUT /client` handler builds an explicit `values` object field-by-field. A new column in the Drizzle schema + OpenAPI `ClientProfileInput` will typecheck and generate hooks fine, but the field is silently dropped on save unless you also add it to that `values` map in `routes/client.ts`.

**Why:** the upsert does not spread `parsed.data`; it whitelists each field with `data.x ?? default`. Missing fields fall back to DB defaults (empty string / null), so onboarding data looks collected but never lands in the row, and downstream consumers (narrative synthesis) silently get empty input.

**How to apply:** any time you add a field intended to persist from onboarding, update all four: schema, openapi `ClientProfile` + `ClientProfileInput`, run codegen, AND the `values` object in `routes/client.ts`. Verify with a PUT-then-GET round-trip, not just a typecheck.
