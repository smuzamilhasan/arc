# Arc — Replit → Railway Migration PRD

> **Status:** Pre-migration analysis only. No files have been changed.
> **Prepared:** 2026-06-17

---

## 1. TECH STACK

### Language & Runtime
- **Node.js 24** (declared in `.replit` modules: `nodejs-24`)
- **TypeScript 5.9** (`~5.9.3` devDependency in root `package.json`)
- **ESM modules** throughout (`"type": "module"` in all package.json files)
- **Python 3.11** also declared in `.replit` modules — appears unused by application code; likely a Replit dev environment convenience only

### Package Manager
- **pnpm** with workspaces (monorepo)
- Workspace roots: `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`

### Framework
- **Express 5.2.1** — API server
- **React 19.1.0** — all frontend apps
- **Vite 7.3.2** — frontend build tool
- **Drizzle ORM 0.45.2** — database access layer

### Key Dependencies (from `package.json` / `pnpm-workspace.yaml` catalog)

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | HTTP server |
| `react` / `react-dom` | 19.1.0 | UI framework |
| `vite` | ^7.3.2 | Frontend bundler |
| `drizzle-orm` | ^0.45.2 | PostgreSQL ORM |
| `drizzle-kit` | ^0.31.10 | Schema migration tool |
| `pg` | ^8.20.0 | PostgreSQL client |
| `@clerk/express` | ^2.1.22 | Server-side auth middleware |
| `@clerk/react` | ^6.7.2 | Client-side auth |
| `@replit/connectors-sdk` | ^0.4.1 | **CRITICAL — Replit-specific** |
| `openai` | ^6.27.0 | OpenAI API client |
| `@anthropic-ai/sdk` | ^0.78.0 | Anthropic API client |
| `@google/genai` | ^1.52.0 | Google Gemini API client |
| `pino` / `pino-http` | ^9.14.0 / ^10.5.0 | Structured logging |
| `express-rate-limit` | ^8.5.2 | Rate limiting |
| `cors` | ^2.8.6 | CORS middleware |
| `cookie-parser` | ^1.4.7 | Cookie parsing |
| `http-proxy-middleware` | ^4.0.0 | Clerk proxy |
| `zod` | 3.25.76 | Schema validation |
| `wouter` | ^3.3.5 | Client-side routing |
| `@tanstack/react-query` | ^5.90.21 | Server state management |
| `framer-motion` | ^12.23.24 | Animation |
| `tailwindcss` | ^4.1.14 | CSS framework |
| `esbuild` | 0.27.3 | API server bundler |

### Exact Start Command (Production)

**API Server (the only service Railway needs to run):**
```bash
node --enable-source-maps artifacts/api-server/dist/index.mjs
```
Preceded by a build step:
```bash
pnpm --filter @workspace/api-server run build
```
Which executes: `node ./build.mjs` (esbuild bundling into `artifacts/api-server/dist/index.mjs`)

**Health check endpoint:** `GET /api/healthz`
**Production port:** `8080` (set via `PORT` env var in artifact.toml)

---

## 2. ENVIRONMENT VARIABLES

> `[SECRET]` = API key or sensitive credential. Set these in Railway's private environment variables, never in source code.
> `[REQUIRED]` = App will crash or malfunction without it.
> `[REPLIT]` = Currently sourced from Replit infrastructure; needs a Railway substitute.

### Core Application

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `PORT` | `artifacts/api-server/src/index.ts:6`; all `vite.config.ts` files | Integer (e.g. `8080`) | `[REQUIRED]` Railway sets this automatically |
| `NODE_ENV` | Throughout for conditional logic | `production` or `development` | Railway sets `production` by default |
| `APP_ORIGIN` | `artifacts/api-server/src/services/inviteEmail.ts:9` | `https://buildmyarc.com` | `[REQUIRED]` Used in invite email links and logo URLs. Currently set in `.replit` `[userenv.production]` |
| `APP_ENCRYPTION_KEY` | `artifacts/api-server/src/lib/crypto.ts:17` | Random 32+ char string | `[SECRET]` `[REQUIRED]` AES-256-GCM key for encrypting stored connector API keys. Must remain the same value after migration or all stored secrets become unreadable |
| `LOG_LEVEL` | `artifacts/api-server/src/lib/logger.ts:6` | `info`, `debug`, `warn`, `error`, `silent` | Optional; defaults to `info` |

### Database

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `DATABASE_URL` | `lib/db/src/index.ts:7`; `lib/db/drizzle.config.ts:4` | PostgreSQL connection string | `[SECRET]` `[REQUIRED]` Railway PostgreSQL plugin provides this automatically |

### Authentication (Clerk)

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | `artifacts/api-server/src/app.ts:58` | `pk_live_...` or `pk_test_...` | `[REQUIRED]` Public Clerk key |
| `CLERK_SECRET_KEY` | `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts:61`; e2e tests | `sk_live_...` or `sk_test_...` | `[SECRET]` `[REQUIRED]` |
| `ADMIN_EMAILS` | `artifacts/api-server/src/middlewares/requireAdmin.ts:7` | `smuzamilhasan@gmail.com` | Currently hardcoded in `.replit` `[userenv.shared]`. Comma-separated list of admin email addresses |

### AI Integrations

> These variables are currently injected by Replit's managed AI integrations system. On Railway, you must obtain each API key directly from the provider.

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | `lib/integrations-openai-ai-server/src/client.ts:9`; audio/client.ts:15; image/client.ts:11 | `sk-...` | `[SECRET]` `[REQUIRED]` Get from platform.openai.com |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `lib/integrations-openai-ai-server/src/client.ts:3`; audio/client.ts:9; image/client.ts:5 | `https://api.openai.com/v1` | Required alongside API key; Replit used a proxy URL |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | `lib/integrations-anthropic-ai/src/client.ts:9` | `sk-ant-...` | `[SECRET]` `[REQUIRED]` Get from console.anthropic.com |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `lib/integrations-anthropic-ai/src/client.ts:3` | `https://api.anthropic.com` | Required alongside API key |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | `lib/integrations-gemini-ai/src/client.ts:9`; image/client.ts:9 | `AIza...` | `[SECRET]` `[REQUIRED]` Get from aistudio.google.com |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | `lib/integrations-gemini-ai/src/client.ts:3`; image/client.ts:3 | `https://generativelanguage.googleapis.com` | Required alongside API key |

### Email (Resend)

> ⚠️ Currently routed through Replit's connector proxy — no API key needed on Replit. On Railway, a direct Resend API key is required. See Fix #1.

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | Will need to be added to email.ts after migration | `re_...` | `[SECRET]` `[REQUIRED after migration]` Get from resend.com. **Does not exist yet in the codebase.** |
| `RESEND_FROM` | `artifacts/api-server/src/services/email.ts:15` | `arc <hello@muzamilhasan.com>` | Currently set in `.replit` `[userenv.shared]`. Verified sending domain address |

### Typeform (Webhooks + Polling)

> ⚠️ Typeform OAuth is currently managed by Replit's connector proxy. On Railway, you must use Typeform's direct API with a Personal Access Token. See Fix #2.

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `TYPEFORM_API_TOKEN` | Will need to be added to typeform.ts after migration | PAT from Typeform | `[SECRET]` `[REQUIRED after migration]` Get from admin.typeform.com → Settings → Personal tokens |
| `MARKETING_TYPEFORM_WEBHOOK_SECRET` | `artifacts/api-server/src/services/typeform.ts:389` | Random secret string | `[SECRET]` Used for HMAC-SHA256 webhook verification |
| `MARKETING_WEBHOOK_SECRET` | `artifacts/api-server/src/routes/marketingPublic.ts:31`; `typeform.ts:389` | Random secret string | `[SECRET]` Fallback if MARKETING_TYPEFORM_WEBHOOK_SECRET not set |
| `MARKETING_TYPEFORM_PAGE_SIZE` | `artifacts/api-server/src/services/typeform.ts:288` | Integer (default: `1000`) | Optional |
| `MARKETING_TYPEFORM_POLL_MS` | `artifacts/api-server/src/services/typeform.ts:534` | Milliseconds (default: `300000`) | Optional |

### Marketing Connectors (BYO-Key)

| Variable | Where Used | Expected Value | Notes |
|---|---|---|---|
| `MARKETING_MAKE_API_KEY` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | Make.com API key | `[SECRET]` Optional env fallback |
| `MARKETING_MAKE_API_BASE_URL` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | e.g. `https://eu1.make.com/api/v2` | Make zone base URL |
| `MARKETING_INSTANTLY_API_KEY` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | Instantly API key | `[SECRET]` Optional env fallback |
| `MARKETING_BEEHIIV_API_KEY` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | Beehiiv API key | `[SECRET]` Optional env fallback |
| `MARKETING_AIRTABLE_API_KEY` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | Airtable PAT | `[SECRET]` Optional env fallback |
| `MARKETING_AIRTABLE_ACCOUNT_REF` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | Airtable workspace ID | Optional env fallback |
| `MARKETING_RESEND_API_KEY` | `artifacts/api-server/src/services/marketingConnectors.ts:117` | `re_...` | `[SECRET]` BYO Resend key for per-client email sending |

### Replit-Specific Variables (DO NOT SET ON RAILWAY — remove references in code)

| Variable | Where Used | Status |
|---|---|---|
| `REPL_ID` | All `vite.config.ts` files (line ~36) — gates Replit Vite plugins | Remove the conditional block; plugins will never load on Railway anyway |
| `REPLIT_DOMAINS` | `artifacts/api-server/src/services/inviteEmail.ts:11` | Replace with `APP_ORIGIN` — already has fallback logic |
| `REPLIT_DEV_DOMAIN` | `artifacts/api-server/src/services/inviteEmail.ts:15` | Same as above |
| `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` | `artifacts/personal-brand/playwright.config.ts:9` | Railway won't provide Chromium; install via Playwright's own installer |

### Testing Only

| Variable | Where Used | Notes |
|---|---|---|
| `E2E_BASE_URL` | `artifacts/personal-brand/playwright.config.ts:5` | Default: `http://localhost:80` |
| `CLERK_SECRET_KEY` | Multiple `e2e/*.spec.ts` files | Used in Playwright tests to create sessions |
| `BASE_PATH` | All `vite.config.ts` files | Required at Vite build time, not at runtime |

---

## 3. DATABASE

### Type
**PostgreSQL 16** (provisioned as a Replit module)

### ORM
**Drizzle ORM 0.45.2** with `pg` (node-postgres) connection pool

### Connection Code
- **File:** `lib/db/src/index.ts`
- **Lines 7–14:**
  ```typescript
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  export const db = drizzle(pool, { schema });
  ```
- **Config file:** `lib/db/drizzle.config.ts` — reads `DATABASE_URL` at line 4

### Schema Tables
Defined in `lib/db/src/schema/`:
- `clientProfile` — user onboarding data, history, achievements
- `auditResults` — SEO / GEO audit findings
- `narrativeProfiles` — positioning narratives
- `posts` — scheduled content
- `ideas` — content ideas
- `marketingConnectionsTable` — **encrypted** connector credentials (AES-256-GCM)
- `marketingFormSourcesTable` — Typeform configuration per tenant
- `marketingLeadsTable` — captured leads
- `plannerMessagesTable` — planner chat history
- `industry_overview` — industry research cache

### Schema Push Command
```bash
pnpm --filter @workspace/db run push
```

### Changes Needed for Railway
1. Add Railway's PostgreSQL plugin — Railway injects `DATABASE_URL` automatically in the standard `postgres://` format that `pg.Pool` already expects.
2. Run `pnpm --filter @workspace/db run push` once after provisioning to apply the schema.
3. **No code changes needed** — the connection code is already clean and generic.

---

## 4. REPLIT-SPECIFIC CODE

### `@replit/connectors-sdk` — The Critical Dependency

This package is Replit's OAuth proxy SDK. It intercepts outbound API calls and injects Replit-managed credentials. **It will not function outside Replit.**

**Resend email** (`artifacts/api-server/src/services/email.ts`, lines 4, 7, 61):
```typescript
import { ReplitConnectors } from "@replit/connectors-sdk";
const connectors = new ReplitConnectors();
// ...
await connectors.proxy("resend", "/emails", { ... });
```
Note: There is already a direct-Resend path in the same function (lines 52–58) for BYO-key callers. This pattern can be extended.

**Typeform OAuth** (`artifacts/api-server/src/services/typeform.ts`, lines 8, 22):
```typescript
import { ReplitConnectors } from "@replit/connectors-sdk";
const connectors = new ReplitConnectors();
```
The `connectors` instance is used throughout `typeform.ts` to make authenticated API calls. All calls will need to be replaced with direct HTTP calls using a Typeform Personal Access Token.

### Replit Vite Plugins

Present in all four `vite.config.ts` files (personal-brand, marketing-os, pitch-deck, mockup-sandbox):

| Plugin | Import location | Line |
|---|---|---|
| `@replit/vite-plugin-runtime-error-modal` | All vite.config.ts | ~5 |
| `@replit/vite-plugin-cartographer` | All vite.config.ts | ~38 |
| `@replit/vite-plugin-dev-banner` | personal-brand, marketing-os, pitch-deck vite.config.ts | ~43 |

**The cartographer and dev-banner plugins are already gated** behind `process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined` — so they will not load in a Railway production deployment where `REPL_ID` is absent.

**`runtimeErrorOverlay()`** is imported unconditionally. This plugin is a dev overlay; it is harmless in production but its import will fail if the package is not installed. It must either be removed or the import made conditional.

### Hardcoded Ports

The `.replit` port mapping file maps internal ports to external ones. On Railway only one port is needed (Railway exposes a single port via `PORT`):

| Internal Port | External Port | Service |
|---|---|---|
| `8080` | `80` | API Server ← **this is the one Railway deploys** |
| `8081` | `8081` | Mockup Sandbox |
| `18522` | `3001` | Pitch Deck |
| `23384` | `3000` | Personal Brand |
| `23624` | `4200` | Marketing OS |

On Replit, the API server (`artifact.toml`) proxies frontend apps at sub-paths (`/`, `/marketing-os/`, `/pitch-deck/`, `/__mockup`). The API server's Express app likely serves these statically after build. Railway will work the same way — all traffic hits the API server on `PORT`.

### Replit-Specific Environment Variable Usage

| File | Line | Variable | What it does |
|---|---|---|---|
| `artifacts/api-server/src/services/inviteEmail.ts` | 11 | `REPLIT_DOMAINS` | Derives app origin for email links |
| `artifacts/api-server/src/services/inviteEmail.ts` | 15 | `REPLIT_DEV_DOMAIN` | Fallback app origin |
| `artifacts/personal-brand/vite.config.ts` | 36 | `REPL_ID` | Gates Replit Vite plugins |
| `artifacts/marketing-os/vite.config.ts` | 36 | `REPL_ID` | Same |
| `artifacts/pitch-deck/vite.config.ts` | 36 | `REPL_ID` | Same |
| `artifacts/mockup-sandbox/vite.config.ts` | 38 | `REPL_ID` | Same |
| `artifacts/personal-brand/playwright.config.ts` | 9 | `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` | Path to Chromium binary for e2e tests |

The `inviteEmail.ts` origin-resolution function already has a clean fallback chain:
1. `APP_ORIGIN` env var (explicit)
2. `REPLIT_DOMAINS[0]`
3. `REPLIT_DEV_DOMAIN`
4. `http://localhost:5000`

Setting `APP_ORIGIN=https://buildmyarc.com` on Railway is sufficient — the Replit fallbacks will never be reached.

### Replit-Specific File System / Auth
No Replit filesystem or auth APIs (`replit.web`, `replit.db`, REPL_AUTH) found in application code. The Replit DB is not used — PostgreSQL is used exclusively.

---

## 5. PRIORITISED FIX LIST

### #1 — [CRITICAL] — File: `artifacts/api-server/src/services/email.ts` — Replace Replit connector proxy with direct Resend API call
The `connectors.proxy("resend", ...)` call will fail silently or throw outside Replit. The same file already contains a direct-Resend fetch path (for BYO-key callers, lines 52–58). Extend it: read `RESEND_API_KEY` from env, and always use the direct fetch path. Remove the `ReplitConnectors` import and the `connectors` instance. This is the first thing that must be fixed — email is used for user invitations.

### #2 — [CRITICAL] — File: `artifacts/api-server/src/services/typeform.ts` — Replace Replit connector OAuth proxy with Typeform Personal Access Token
All `connectors.proxy(...)` calls in `typeform.ts` must be replaced with direct `fetch()` calls to `https://api.typeform.com`, passing a `Bearer` token sourced from a new `TYPEFORM_API_TOKEN` env var. The Typeform API is well-documented and the request shapes already present in the file can be reused; only the transport layer changes. This affects lead capture, form listing, webhook registration/deregistration, and polling.

### #3 — [CRITICAL] — File: `artifacts/api-server/src/services/email.ts`, `typeform.ts` — Remove `@replit/connectors-sdk` package
After fixes #1 and #2, `@replit/connectors-sdk` will have no remaining call sites. Remove the import and remove the package from `artifacts/api-server/package.json`. Attempting to import and instantiate `ReplitConnectors` outside a Replit environment may throw at startup.

### #4 — [CRITICAL] — Set `APP_ENCRYPTION_KEY` Railway env var to the SAME value currently in Replit
All marketing connector credentials stored in `marketingConnectionsTable` are encrypted with this key (`artifacts/api-server/src/lib/crypto.ts`). If you set a new key, every stored connector secret becomes unreadable and users will have to re-enter all their API keys. Export this value from Replit secrets before migration.

### #5 — [CRITICAL] — Provision a Railway PostgreSQL database and migrate schema
Add the Railway PostgreSQL plugin. Run `pnpm --filter @workspace/db run push` once to apply the Drizzle schema. Export a pg_dump of the Replit database and restore it on Railway if existing data needs to be preserved.

### #6 — [IMPORTANT] — Files: all `vite.config.ts` — Remove or make conditional the `runtimeErrorOverlay` import
`runtimeErrorOverlay` from `@replit/vite-plugin-runtime-error-modal` is imported unconditionally in all four Vite configs. Gate it behind `process.env.NODE_ENV !== "production"`, or remove it entirely. If the package is absent (e.g. if Replit-scoped packages are stripped), the import will cause the Vite build to fail.

### #7 — [IMPORTANT] — File: `artifacts/api-server/src/services/inviteEmail.ts` — Clean up dead Replit fallback logic
After setting `APP_ORIGIN`, the `REPLIT_DOMAINS` and `REPLIT_DEV_DOMAIN` branches (lines 11–15) become dead code. Not a blocker, but remove them to avoid confusion.

### #8 — [IMPORTANT] — Create `railway.toml` (or `Procfile`) to define the Railway build and start commands
Railway needs to know how to build and start the project. Create `railway.toml`:
```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build"

[deploy]
startCommand = "node --enable-source-maps artifacts/api-server/dist/index.mjs"
healthcheckPath = "/api/healthz"
healthcheckTimeout = 30
```

### #9 — [IMPORTANT] — Obtain and set all AI API keys directly
On Replit, `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, and `AI_INTEGRATIONS_GEMINI_API_KEY` were injected by Replit's managed integration system. You must get these directly from OpenAI, Anthropic, and Google AI Studio and set them as Railway env vars, along with their corresponding `_BASE_URL` variables pointing to the official API endpoints.

### #10 — [IMPORTANT] — Verify pnpm version compatibility on Railway (Nixpacks)
Nixpacks auto-detects pnpm from `package.json`. The `pnpm-workspace.yaml` uses `catalog:` features requiring pnpm ≥ 9. Pin the pnpm version in `package.json` (`"packageManager": "pnpm@9.x.x"`) so Railway's Nixpacks builder installs the right version.

### #11 — [NICE] — File: `artifacts/personal-brand/playwright.config.ts` — Remove `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` reference
Replace with `process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (the standard cross-platform env var) or let Playwright use its own installed binary. Not a runtime blocker — only affects CI/e2e tests.

### #12 — [NICE] — Remove `@replit/vite-plugin-cartographer` and `@replit/vite-plugin-dev-banner` from all `vite.config.ts` files
These are already guarded by `REPL_ID` and won't run on Railway. They can be safely removed to keep the build config clean and eliminate Replit-scoped dev dependencies.

### #13 — [NICE] — File: `scripts/post-merge.sh` — Review post-merge hook for Railway context
The post-merge hook runs `pnpm install --frozen-lockfile && pnpm --filter db push`. This was a Replit-specific hook that auto-migrated the DB on every merge. On Railway, DB migrations should be a deliberate deploy step, not an automatic one. Consider moving this to the Railway pre-deploy command instead.

---

## 6. MANUAL STEPS REQUIRED

### Step 1 — Export `APP_ENCRYPTION_KEY` from Replit (~5 min)
In Replit, go to Secrets and copy the value of `APP_ENCRYPTION_KEY`. You will set this exact value in Railway. **Do not generate a new one** or all stored connector credentials will be lost.

### Step 2 — Export existing PostgreSQL data (~15 min)
From Replit's Shell:
```bash
pg_dump $DATABASE_URL > arc_backup.sql
```
Download the file. You will restore it after the Railway database is provisioned.

### Step 3 — Obtain direct API keys for all three AI providers (~20 min)
- **OpenAI:** platform.openai.com → API keys → Create new secret key
- **Anthropic:** console.anthropic.com → API Keys → Create key
- **Google Gemini:** aistudio.google.com → Get API key

### Step 4 — Obtain a Typeform Personal Access Token (~5 min)
admin.typeform.com → Settings → Personal tokens → Generate new token. This replaces the OAuth proxy.

### Step 5 — Create a Railway account and new project (~10 min)
railway.app → New project → Empty project. Connect your GitHub repo.

### Step 6 — Add Railway PostgreSQL plugin (~5 min)
Inside the Railway project → Add Plugin → PostgreSQL. Railway will inject `DATABASE_URL` automatically.

### Step 7 — Restore the database backup (~10 min)
```bash
psql $RAILWAY_DATABASE_URL < arc_backup.sql
```

### Step 8 — Run schema push on Railway (~5 min)
Either locally pointing at the Railway database, or via Railway's run command:
```bash
DATABASE_URL=<railway_url> pnpm --filter @workspace/db run push
```

### Step 9 — Set all environment variables in Railway (~15 min)
In Railway dashboard → Variables, set every variable listed in Section 2 above. Critical ones:
- `DATABASE_URL` (auto-injected by plugin)
- `APP_ENCRYPTION_KEY` (must match Replit value)
- `APP_ORIGIN=https://buildmyarc.com`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `AI_INTEGRATIONS_OPENAI_API_KEY` + `_BASE_URL`
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` + `_BASE_URL`
- `AI_INTEGRATIONS_GEMINI_API_KEY` + `_BASE_URL`
- `RESEND_API_KEY`, `RESEND_FROM`
- `TYPEFORM_API_TOKEN` (after code fix #2)
- `MARKETING_TYPEFORM_WEBHOOK_SECRET`
- `ADMIN_EMAILS=smuzamilhasan@gmail.com`
- `NODE_ENV=production`

### Step 10 — Make the code changes (Fixes #1–#10) and push (~60–120 min)
Implement the fixes in the prioritised list. Push to the connected GitHub branch. Railway will auto-deploy.

### Step 11 — Update Typeform webhook URLs (~10 min)
After deployment, update any registered Typeform webhooks to point at the Railway domain:
`https://<your-railway-domain>/api/marketing/intake/typeform/webhook`

### Step 12 — Update DNS for buildmyarc.com (~15 min + propagation)
In your DNS provider, point the A record or CNAME for `buildmyarc.com` to the Railway-provided domain. Add `buildmyarc.com` as a custom domain in the Railway project settings. Allow 1–24 hours for DNS propagation.

### Step 13 — Update Clerk allowed origins (~5 min)
In Clerk dashboard, add the new Railway domain and `buildmyarc.com` to the list of allowed redirect URLs and origins.

### Step 14 — Smoke test the deployment (~20 min)
- Visit `https://buildmyarc.com` and confirm the UI loads
- Sign in and confirm Clerk auth works
- Send a test invite email and confirm it arrives
- Confirm a Typeform submission captures as a lead
- Confirm AI audit/content generation works
- Check `GET /api/healthz` returns 200

---

## 7. RISKS AND BLOCKERS

### Risk 1 — [BLOCKER] `@replit/connectors-sdk` replaces two live services
The connector SDK is the auth layer for both **Resend** (email delivery) and **Typeform** (OAuth token management). Both services are non-functional on Railway until Fixes #1 and #2 are implemented. This is not configuration — it requires code changes to two service files.

### Risk 2 — [HIGH] `APP_ENCRYPTION_KEY` rotation = lost connector credentials
If the encryption key is lost or accidentally rotated, all per-user stored marketing connector API keys (Airtable, Instantly, Beehiiv, Make.com, Resend BYO) become permanently unreadable. The data is not lost but cannot be decrypted. Users would have to re-enter every key. **Export and preserve this value before touching anything.**

### Risk 3 — [HIGH] Monorepo + multiple services behind one Express server
This project has 5 separate apps (api-server + 4 frontend SPAs). On Replit, the routing between them (artifact.toml `paths` and `routes`) is managed by Replit's reverse proxy. On Railway only one service runs. You need to confirm the Express app in `api-server` actually serves the built frontend static files — check whether there are `express.static` middleware registrations for personal-brand, marketing-os, pitch-deck, and mockup-sandbox dist folders, and that `BASE_PATH` values are set correctly at build time.

### Risk 4 — [MEDIUM] Typeform webhook re-registration
Typeform webhooks are registered at the Replit domain. After migration, all webhooks must be updated to point at the Railway domain. The webhook registration logic is in `typeform.ts` — it uses `appOrigin()` to construct the URL, so setting `APP_ORIGIN` correctly should handle future webhook registrations automatically, but existing registered webhooks in Typeform will still point at the old domain and must be manually updated or re-registered via the app's UI.

### Risk 5 — [MEDIUM] AI integration `_BASE_URL` values
On Replit, the `AI_INTEGRATIONS_*_BASE_URL` variables pointed at Replit's managed API proxy endpoints, not the provider's public API. Setting them to the official public endpoints (api.openai.com, api.anthropic.com, generativelanguage.googleapis.com) should work with the existing SDKs, but verify the expected URL format each SDK client uses — some expect a base URL with `/v1`, others without.

### Risk 6 — [LOW] pnpm catalog: feature requires pnpm ≥ 9
The `pnpm-workspace.yaml` uses `catalog:` references throughout. Railway's Nixpacks builder must use pnpm ≥ 9. Add `"packageManager": "pnpm@9.x.x"` to root `package.json` to force the correct version.

### Risk 7 — [LOW] Python 3.11 declared in `.replit` modules
The `.replit` file declares `python-3.11` as a module, but no Python code was found in the application. This is almost certainly a Replit dev convenience (e.g., for Replit's AI agent tooling). Railway will not have Python unless explicitly configured, but since it's not used by the application, this is not a blocker.

---

### The Single Biggest Technical Risk

**`@replit/connectors-sdk` owns the auth for both outbound email (Resend) and Typeform OAuth.** These two integrations are core to the application's value — email delivery for invitations and lead capture from Typeform forms. Neither will work until the SDK's proxy calls are replaced with direct API calls using provider-issued tokens. This is code surgery that touches two service files, and it must be done before any Railway deployment can be considered functional. Everything else on this list is configuration.
