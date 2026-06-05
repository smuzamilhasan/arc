---
name: Resend transactional email
description: How arc sends email and the Resend connector key/domain constraints
---

arc sends transactional email through Resend via the Replit connector proxy
(`@replit/connectors-sdk`, `connectors.proxy("resend", "/emails", { method: "POST" })`).
The generic sender lives in the api-server services layer and is designed to never throw —
callers get a boolean so a failed send degrades gracefully instead of failing the operation.

**Connector key is send-only (restricted).** A read call like `GET /domains` returns
`401 {"name":"restricted_api_key","message":"This API key is restricted to only send emails"}`.
That 401 is NOT a broken connection — it proves the proxy authenticates and reaches Resend.
Only `POST /emails` is permitted. Don't use `/domains` (or other read endpoints) as a health check.

**Default sender domain delivers only to the account owner.** Without a verified custom
domain, the from address falls back to Resend's shared `onboarding@resend.dev`, which can
only deliver to the Resend account owner's own email. For production delivery to arbitrary
recipients, set `RESEND_FROM` to an address on a verified custom domain.

**App origin for links** is derived from `REPLIT_DOMAINS` (first entry) → `REPLIT_DEV_DOMAIN`,
overridable via `APP_ORIGIN`. The web app is served at `/`, so invite links are `${origin}/invite/<token>`.
