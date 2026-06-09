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

**Hard limit:** this only unifies profiles under ONE Clerk account. If the same email
produces TWO separate Clerk userIds (account-linking disabled), the app cannot put two
userIds on one profile — the definitive fix is Clerk verified-email account linking in
the Auth pane. App-layer binding covers same-account + first-touch + self-heal only.
