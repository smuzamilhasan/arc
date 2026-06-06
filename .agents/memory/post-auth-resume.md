---
name: Post-auth resume / centralized routing
description: How "do X after the user signs in" must be implemented in the personal-brand web app
---

All post-auth routing is centralized in `Entry` (the `/` route, signed-in branch).
The Clerk `<SignIn>`/`<SignUp>` pages set `forceRedirectUrl` to `/`, so after any
auth the app always funnels through `Entry`, which then decides the destination.

**Rule:** any "resume this intent after the user authenticates" feature (e.g. the
agency signup intent, or accepting an invite via `/invite/:token`) must:
1. Stash the intent in `localStorage` BEFORE redirecting a signed-out user to auth
   (helpers live in `lib/active-client.tsx`, e.g. `setPendingInvite` / `setSignupIntent`).
2. Consume it inside `Entry` (consume-once, removes the key) and navigate, ordered
   by priority — pending invite first, then signup intent, then default routing.

**Why:** a bare auth redirect drops the originating deep-link/path. Invitees are
signed-out new users; without stashing, the token is lost and they never reach the
accept page. Don't rely on Clerk returning to the original URL — force `/` and let
`Entry` be the single source of truth.
