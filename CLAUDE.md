# Arc — CLAUDE.md

Project context for AI-assisted coding sessions.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 24 |
| Language | TypeScript | ~5.9.3 |
| Module format | ESM | throughout |
| Package manager | pnpm workspaces | 9.15.9 (pinned) |
| API server | Express | ^5.2.1 |
| Frontend | React + Vite | 19.1.0 / ^7.3.2 |
| Database | PostgreSQL + Drizzle ORM | 16 / ^0.45.2 |
| Auth | Clerk | @clerk/express ^2.1.22 |
| Styling | Tailwind CSS | ^4.1.14 |
| Hosting | Railway | — |

---

## Monorepo Structure

```
artifacts/
  api-server/       Express API — the single deployed service on Railway
  personal-brand/   React SPA (served at /)
  marketing-os/     React SPA (served at /marketing-os/)
  pitch-deck/       React SPA (served at /pitch-deck/)
  mockup-sandbox/   React SPA (served at /__mockup)
lib/
  db/               Drizzle schema + pg connection pool
  api-zod/          Shared Zod schemas (API contracts)
  api-client-react/ React hooks wrapping the API
  integrations/     AI provider clients (openai, anthropic, gemini)
scripts/            post-merge.sh (dev hook, not used on Railway)
```

All four SPAs are built into `dist/public` and served as static files by the Express API server.

---

## Key Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/index.ts` | Server entry point; reads PORT from env |
| `artifacts/api-server/src/app.ts` | Express app, middleware, route mounting |
| `artifacts/api-server/src/services/email.ts` | Resend email via direct API (RESEND_API_KEY) |
| `artifacts/api-server/src/services/typeform.ts` | Typeform via direct API (TYPEFORM_API_TOKEN) |
| `artifacts/api-server/src/services/inviteEmail.ts` | Invite email builder + appOrigin() |
| `artifacts/api-server/src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for stored secrets |
| `lib/db/src/index.ts` | Drizzle + pg.Pool connection (reads DATABASE_URL) |
| `lib/db/src/schema/` | All table definitions |
| `lib/db/drizzle.config.ts` | Drizzle Kit config |
| `railway.json` | Railway build + start command |
| `.env.example` | Template for all required env vars |

---

## Environment Variables

See `.env.example` for the full list with descriptions. The critical ones:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-injected by Railway PostgreSQL plugin |
| `APP_ORIGIN` | Yes | `https://buildmyarc.com` — used in email links |
| `APP_ENCRYPTION_KEY` | Yes | AES-256 key — must stay constant after first deploy |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk public key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `AI_INTEGRATIONS_OPENAI_API_KEY` + `_BASE_URL` | Yes | Direct from OpenAI |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` + `_BASE_URL` | Yes | Direct from Anthropic |
| `AI_INTEGRATIONS_GEMINI_API_KEY` + `_BASE_URL` | Yes | Direct from Google AI Studio |
| `RESEND_API_KEY` | Yes | Direct Resend API key (no more Replit proxy) |
| `RESEND_FROM` | Yes | Verified sending address |
| `TYPEFORM_API_TOKEN` | Yes | Typeform Personal Access Token |
| `MARKETING_TYPEFORM_WEBHOOK_SECRET` | Yes | HMAC secret for webhook verification |
| `ADMIN_EMAILS` | Yes | Comma-separated admin addresses |

---

## Build and Start

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Build the API server (esbuild bundles into artifacts/api-server/dist/index.mjs)
pnpm --filter @workspace/api-server run build

# Start in production
node --enable-source-maps artifacts/api-server/dist/index.mjs

# Health check endpoint
GET /api/healthz
```

Railway uses `railway.json` to run these automatically.

---

## Database

```bash
# Push schema changes (run once after provisioning or after schema edits)
pnpm --filter @workspace/db run push

# Never auto-run this on deploy — it is a deliberate, manual step.
```

The `lib/db/src/index.ts` connection uses `pg.Pool` with `DATABASE_URL`. No code changes needed when switching databases — just update the env var.

---

## Important Rules

### DO NOT use `@replit/connectors-sdk`
This package has been removed. It was Replit's OAuth proxy for Resend and Typeform.
- Email → use `RESEND_API_KEY` directly in `services/email.ts`
- Typeform → use `TYPEFORM_API_TOKEN` directly in `services/typeform.ts`

### APP_ENCRYPTION_KEY must never change in production
All marketing connector API keys stored in the database are encrypted with this key. Rotating it silently breaks decryption for all users — they would have to re-enter every connector key.

### PORT is always from environment
The API server reads `process.env.PORT`. Railway sets this automatically. Never hardcode a port number.

### No Replit-specific env vars
`REPL_ID`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` have been removed from the codebase. Do not reintroduce them.

### Typeform webhooks use `APP_ORIGIN`
The webhook registration URL is built from `appOrigin()` which reads `APP_ORIGIN`. After migration, re-register any existing Typeform webhooks so they point at the Railway domain.

### pnpm only
The root `package.json` has a `preinstall` guard that rejects npm and yarn. Always use `pnpm`.
