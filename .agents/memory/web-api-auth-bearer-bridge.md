---
name: Web API auth uses Bearer token, not just cookies
description: Why the web app sends a Clerk Bearer token on every API call, and the iframe cookie pitfall behind it
---

The personal-brand web app authenticates API calls with BOTH the Clerk session
cookie (credentials:include) AND an `Authorization: Bearer <session token>`
header. The bearer header is wired via an `ApiAuthTokenBridge` mounted inside
`ClerkProvider` that calls `setAuthTokenGetter(() => getToken())` (custom-fetch
attaches the header when the getter returns a token).

**Why:** Cookie-only auth fails inside the Replit embedded preview iframe — the
Clerk session cookie is a third-party cookie that browsers block, so every API
request 401s even though the Clerk client shows the user as signed in. Symptoms
seen: dashboard white screen, "couldn't save progress" on onboarding, empty
panels. The server's `@clerk/express` clerkMiddleware validates bearer tokens
too, so sending one makes auth work in any cookie context (iframe + first-party
+ deployed).

**How to apply:** If you see authed endpoints 401 only inside the preview iframe
(but work in a popped-out tab), suspect cookies, not a route bug. Keep the bearer
bridge in place. The SSE audit endpoint uses raw fetch (NOT custom-fetch), so it
does NOT get the bearer token automatically — it still depends on cookies and
can 401 in the iframe; wire it separately if that surfaces.
