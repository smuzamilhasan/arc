---
name: Clerk auth principal resolution
description: How to derive the authenticated user id in Clerk Express middleware for per-user data scoping
---

# Clerk auth principal resolution

For authorization identity in the Express `requireAuth` middleware, use **only** `getAuth(req).userId`. Do not prefer or fall back to `sessionClaims.userId` (or any custom claim) when deriving the principal used for ownership/data-scoping.

**Why:** `auth.userId` is Clerk's canonical user id. Giving a session-claims field precedence (`sessionClaims.userId || auth.userId`) means a custom token template, claim collision, or misconfiguration can silently make every per-user query run under the wrong identity — a cross-user IDOR / broken-access-control bug. This was flagged as blocking in code review for the per-user isolation work.

**How to apply:** Any time you scope DB rows by the signed-in user (clientProfile.userId, and clientId derived from it for posts/ideas/etc.), the userId must come straight from `auth.userId`. Web app is cookie-based; mobile/Expo is token-based — both still resolve identity through `getAuth`, not raw claims.
