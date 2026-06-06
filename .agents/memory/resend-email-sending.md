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
To make production invite emails use a custom domain (not the Replit domain), set `APP_ORIGIN`
in the **production** environment; leave it unset in dev so dev keeps the Replit fallback.
**Why:** invites are sent from the deployed app, and `REPLIT_DOMAINS[0]` there is the replit.app host,
so links leak that host unless `APP_ORIGIN` pins the custom domain. A production env change needs a redeploy.

**Email logo** is a hosted PNG (email clients strip inline SVG): `email-logo.png` in the web app's
`public/` (served at origin root), referenced as `${appOrigin()}/email-logo.png` so it loads from the
same custom domain as the links. Brand SVGs can be rasterized with ImageMagick (`magick`); no
rsvg/inkscape and no Instrument Serif font installed, so text falls back to a generic serif.
