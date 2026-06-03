---
name: Admin access model
description: How admin (cross-user view) is designated and enforced in arc
---

# Admin access

arc is otherwise single-client-per-user (every route scopes by the signed-in user's `client_profile`). Admin is the one exception: a read-only cross-user view of all profiles, narratives, audits, posts, and ideas.

**Decision:** Admins are designated by an `ADMIN_EMAILS` env var (comma-separated, shared environment), checked server-side against the signed-in user's primary Clerk email (case-insensitive). There is no DB flag and no Clerk role/metadata.

**Why:** The product owner is non-technical; an env-var allowlist is changed through Replit secrets without touching the Clerk dashboard or running a migration, and it keeps the existing schema untouched.

**How to apply:** Server enforcement lives in the `requireAdmin` middleware (fetches the Clerk user, compares email to the allowlist). Admin routes are mounted after `requireAuth`, so `/admin/*` is 401 when signed out and 403 when signed-in-but-not-admin. `GET /admin/access` is auth-only (never 403) and returns `{ isAdmin }`; the web layout uses it to conditionally show the Admin nav link, and the admin page redirects non-admins. To grant access, add the email to `ADMIN_EMAILS` and restart the api-server (env is read at runtime, not bundled).
