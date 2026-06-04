---
name: No bare null render on query failure
description: Why pages must render an explicit error state instead of returning null when a data query fails
---

Pages must never `return null` (or otherwise render nothing) when a data query
fails — it produces a blank white screen the user cannot recover from.

**Why:** The web app's QueryClient (`artifacts/personal-brand/src/lib/queryClient.ts`)
uses bare defaults — errors are swallowed (not thrown to an error boundary) and
there is no global 401/onError handler. So a failed query just leaves `data`
undefined with no surfaced error. A very common trigger is a 401 mismatch: the
Clerk client thinks the user is signed in (nav + links render, RequireAuth lets
the page mount) but the API rejects the cookie-based session — expired session,
or third-party cookies blocked when the app runs inside the embedded preview
iframe. Every authed endpoint then 401s.

**How to apply:** In page components, destructure `isError`/`error`/`refetch`
from the query hook and render an explicit fallback. Detect auth failures by the
error's top-level `.status` (customFetch throws `ApiError` with `.status`); on
401 show a "session expired / sign in" path, otherwise a "couldn't load + Try
again" (refetch) path. For auth-sensitive queries, skip retries on 401 so the
session-expired state surfaces immediately instead of after the default 3
retries.
