---
name: Marketing connector env-credential fallback
description: How BYO-key Marketing OS connectors can be satisfied by a Replit secret, and the two status endpoints that must both reflect it.
---

# Marketing connector env-credential fallback

BYO-key Marketing OS connectors resolve credentials in this order: a key typed
into the Connections UI (encrypted at rest in `marketingConnectionsTable`),
then a Replit secret. The secret convention (in `marketingConnectors.ts`):

- `MARKETING_<PROVIDER>_API_KEY` — the API key (`getConnectorEnvApiKey`)
- `MARKETING_<PROVIDER>_API_BASE_URL` or `MARKETING_<PROVIDER>_ACCOUNT_REF` —
  the account/zone ref (`getConnectorEnvAccountRef`)

`getConnectorApiKey` / `getConnectorAccountRef` already fall back to these.

**Why:** lets a key handed directly to the operator/agent be stored as a Replit
secret (encrypted by Replit) instead of forcing it through the UI, without
violating the "no raw creds" rule.

**How to apply — there are TWO status endpoints, update BOTH or the UI lies:**
- `GET /marketing/connections` — Connections page list. Iterates DB rows; must
  ALSO synthesize entries for env-backed byokey connectors that have no row.
- `GET /marketing/connectors` — the registry list the **Build page** uses to gate
  the "Plan changes" button (`connector.connected`). Computes status per-connector;
  byokey `connected` must be `row.apiKeyEncrypted OR env key`, accountRef from row
  or env. Easy to miss this one (architect caught it).

## Make.com specifics

- `accountRef` is the zone host (e.g. `https://us2.make.com`); zones vary per
  account (eu1/eu2/us1/us2). Auth header is `Authorization: Token <key>`.
- `normalizeMakeBase` appends `/api/v2` when the stored value is just the zone
  host, so users can paste either the bare host or the full API base.
- Adapter read-path (plan): `/organizations` -> `/teams?organizationId=` ->
  `/hooks?teamId=`. Apply creates a `gateway-webhook` via `POST /hooks` — that is
  the only external write and stays behind the human-in-the-loop confirm.
