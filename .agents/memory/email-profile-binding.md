---
name: Email -> profile binding (invite self-heal)
description: How an agency-invited email always lands on the SAME client profile regardless of signup path
---

`services/inviteBinding.ts` makes an agency-invited EMAIL (not the invite link) the
source of truth for which `client_profile` an account owns. `reconcileUserInvites(userId)`
resolves the user's VERIFIED Clerk emails -> pending `kind:"client"` invitations ->
`bindInviteForUser`. Wired into `GET /client` and `PUT /client` (personal path, no
agency header) so it self-heals on next sign-in, plus the agency accept route.

**Why:** `client_profile.userId` is UNIQUE. If an invitee signs up WITHOUT the invite
link (e.g. Google OAuth) the app makes them a fresh personal profile, orphaning the
rich agency-prebuilt one forever (accept could never claim it afterward). Real incident:
a user ended up with a rich prebuilt profile + a sparse self-signup duplicate.

**Merge rules in `bindInviteForUser`:**
- Never steal a prebuilt already claimed by a DIFFERENT account (`userId` mismatch -> null).
- Duplicate exists: keep the higher `profileFillScore` (content length dominant +
  onboardingComplete bonus), delete the loser via `deleteClientData`, repoint
  grant + invitation to the kept profile, mark invite accepted.
- All mutations (delete + reassign userId + accept) run inside ONE `db.transaction`;
  `deleteClientData(clientId, tx?)` accepts an optional tx executor to join it.
- `reconcileUserInvites` binds only the FIRST matching invite (a user owns exactly one
  profile); binding more would let a later invite's merge delete an earlier-bound profile.

**Prevent duplicates at the source (agency add-client):** `POST /agency/:id/invite`
(kind:"client") first calls `findOwnedProfileForEmail(email)` — Clerk `getUserList`
by email + VERIFIED + already owns a profile. If found, it issues a "link existing
account" invite (`invitation.clientId` -> that profile) and creates NO new profile and
NO grant. The grant is attached only on ACCEPT (consent) — never link someone's own
profile to an agency without them accepting. If no account exists, keep the prebuild path.

**Link vs prebuild is DERIVED, not a column:** a pending client invite is a link invite
iff its target `client_profile.userId` is non-null (prebuild targets unclaimed/null).
The invite preview returns `linkExisting` (and hides the profile name for link invites so
a forwarded token can't reveal the existing holder). Email + accept-page copy switch on it.

`bindInviteForUser`'s `prebuilt.userId === userId` branch ALSO `ensureGrant`s now — that
is the link-invite accept/self-heal path (grant created on accept), not just an
idempotent re-claim.

**Hard limit:** this only unifies profiles under ONE Clerk account. If the same email
produces TWO separate Clerk userIds (account-linking disabled), the app cannot put two
userIds on one profile — the definitive fix is Clerk verified-email account linking in
the Auth pane. App-layer binding covers same-account + first-touch + self-heal only.

**Two-Clerk-identity case (personal profiles):** `reconcilePersonalProfileByEmail(userId)`
in the same file makes the VERIFIED email the source of truth for PERSONAL (non-agency)
profiles too. `client_profile.verifiedEmail` stores the owner's canonical lowercased
verified email (stamped on create, lazily backfilled when an owner loads their profile).
When the SAME person signs in under a SECOND Clerk userId sharing that verified email
(e.g. Google sign-up + later email/password, account-linking off), the lookup by userId
misses, so this re-points the profile's `userId` to the current account instead of 404 ->
onboarding -> duplicate. Wired into `GET /client` + `PUT /client` via `resolvePersonalClient`.

**Safety:** matches ONLY on the caller's own Clerk-verified emails (same person controls
the mailbox), only re-points purely personal profiles (`created_by_agency_id IS NULL`, so
agency invite-binding semantics are untouched), and changes ownership only — never
overwrites content or replaces a filled profile with an empty one.

**Why re-point instead of merge:** unlike the agency path there's no prebuilt duplicate to
merge; the second identity simply owns nothing, so transferring ownership is safe and
idempotent (ping-pongs harmlessly if they alternate identities). Clerk verified-email
account linking (Auth pane) is the source-level complement but isn't togglable via the
Replit-managed tenant's documented surface, so this app-layer self-heal is the real fix.

**Redirect hardening (`pages/entry.tsx`):** `GET /client` retry treats a 404 as "no
profile -> onboarding" (no retry) but RETRIES any other error (network/401-not-ready/5xx),
and only routes to onboarding on a confirmed 404. A persistent non-404 error shows a
"Try again" state instead of bouncing the user into onboarding. Use `ApiError.status`
(exported from `@workspace/api-client-react`) to distinguish.
