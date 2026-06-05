---
name: Active-client scoping (agency multi-tenant)
description: How agency multi-tenant request scoping works and the gotchas that bypass it.
---

# Active-client request scoping

arc supports agency accounts: a user may act on their own client_profile OR on
agency-managed clients. The acting client is chosen by an `x-arc-client-id`
request header, resolved + ownership-checked server-side by the activeClient
middleware (`req.activeClient`).

## Raw fetch sites must stamp the header themselves
**Rule:** The header is auto-attached only by the shared `customFetch` (generated
client). Any hand-rolled `fetch` bypasses it and will silently run under the
WRONG client (personal profile instead of the selected managed client) — or 404
for agency-only users with no personal profile.

**How to apply:** call sites that use raw `fetch` (the audit SSE `POST /audit/run`
and the assistant SSE `GET /assistant/stream`) must read `getActiveClientId()`
from `lib/active-client` and set `x-arc-client-id` manually. Mirror the existing
bearer-token bridge pattern — same files that need a manual Bearer token also
need the manual client header.

## Register the header getter at module load, not in useEffect
**Rule:** `setActiveClientGetter` is called at module top-level in
`lib/active-client.tsx` so the very first query (which fires during the provider's
own render) is already scoped. A `useEffect` registration runs too late and lets
early requests go out unscoped.

## Invite acceptance must be email-bound
**Rule:** a valid invitation token is NOT sufficient to accept. The accept route
verifies the caller's Clerk account actually owns the invited (verified) email
before joining an agency or claiming a prebuilt client profile. Otherwise a
forwarded token lets the wrong account claim membership / someone else's profile.

## Agency RBAC: team management is owner-only
**Rule:** members may invite/manage CLIENTS, but adding teammates (member-kind
invites) and revoking member-kind invites and removing members are owner-only.
Membership alone is not authorization for team-management actions.

## Cleanup
agency_client_access + invitations are keyed by clientId with NO FK cascade, so
`deleteClientData` must delete them explicitly (see feature-gate-cleanup.md).
