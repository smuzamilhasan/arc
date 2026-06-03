---
name: wouter catch-all must be /* not /:rest*
description: wouter/regexparam :param* only matches ONE segment; use /* for multi-segment catch-all routes
---

In wouter v3 (regexparam v3), a named wildcard like `path="/:rest*"` only matches a
SINGLE path segment. `/:rest*` matches `/blueprint` but NOT `/blueprint/identity`.
The unnamed wildcard `path="/*"` matches everything including slashes
(`/blueprint/identity` → captures `blueprint/identity`).

**Why:** A blank white screen on a multi-segment route (e.g. `/blueprint/identity`)
with NO console error is the signature symptom. It is not a render crash — the outer
`<Switch>` simply finds no matching `<Route>` and returns `null`. If the catch-all
also wraps auth (RequireAuth), an unmatched route means auth never runs either, so
even signed-out users see blank instead of a redirect.

**How to apply:** Any top-level catch-all `<Route>` that must cover nested/multi-segment
paths must use `path="/*"`, never `path="/:rest*"`. Single-segment routes work with
either, which is why the bug only surfaces the first time a 2+ segment route is added.
To verify matching offline: `node -e "const {parse}=require('regexparam'); console.log(parse('/*').pattern.exec('/a/b'))"`.
