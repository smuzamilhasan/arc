---
name: Agency client lifecycle (prebuild → claim → remove)
description: How agency-managed client profiles are created, claimed, and deleted
---

Inviting a client (`kind:"client"`) IMMEDIATELY creates an UNCLAIMED `client_profile`
(`userId` null, `createdByAgencyId` set) + an `agency_client_access` grant + an
`invitation`. So the client shows in the agency roster BEFORE acceptance. Accepting
the invite just sets `userId` on that prebuilt profile (claims it).

**Removal rule (DELETE agency client):** distinguish unclaimed vs claimed.
- Unclaimed (`userId === null`): delete outright via `deleteClientData` (full cascade).
- Claimed (real user owns it): NEVER delete their account — only drop this agency's
  access grant and revoke its pending invites (detach from roster).

**Why:** revoking the invitation alone only flips `invitation.status`; it leaves the
prebuilt profile + grant behind, stranding a phantom client with no way to remove it.

Shared cascade `deleteClientData` lives in `services/clientData.ts` (used by both the
per-user reset/account-delete in `routes/client.ts` and the agency remove-client in
`routes/agency.ts`). Any new clientId-keyed table must be added there.
