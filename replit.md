# arc

arc (short for "story arc") is a single-client personal brand strategy tool: it onboards one individual, audits how they show up across Google search (SEO) and AI models (GEO), synthesizes a positioning narrative, and drives a content strategy.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run test` — run API integration tests (per-user data isolation). Needs `DATABASE_URL`; mocks Clerk auth via an `x-test-user-id` header.
- `pnpm --filter @workspace/personal-brand run test` — run web unit tests (vitest). Covers the Blueprint gating logic in `src/lib/blueprint.ts`; pure, no DB or AI needed.
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only). If drizzle hits an interactive rename/conflict prompt (no TTY), drop the conflicting old table manually first, then re-run push.
- Required env: `DATABASE_URL`. AI runs through Replit-managed integrations (OpenAI, Anthropic, Gemini) — no API keys needed.
- `ADMIN_EMAILS` (comma-separated, shared env): emails granted admin access (cross-user view). Checked server-side against the signed-in user's Clerk email; restart the api-server after changing it.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (artifacts/api-server)
- Web: React + Vite + wouter + TanStack Query (artifacts/personal-brand, served at `/`, title "arc")
- DB: PostgreSQL + Drizzle ORM (lib/db)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- AI: Replit AI integrations — `@workspace/integrations-openai-ai-server` (gpt-5.4), `@workspace/integrations-anthropic-ai` (claude-sonnet-4-6), `@workspace/integrations-gemini-ai` (gemini-3-flash-preview)

## Where things live

- API contract (source of truth for codegen): `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/` (clientProfile, auditResults, narrativeProfiles, posts, ideas) — barrel at `index.ts`. clientProfile holds deep intake: personal history (dateOfBirth, placeOfBirth, earlyLife, schooling, university, professionalJourney), substance blobs (signatureAchievements, awards, quantifiableResults, audienceImpact), coach material (passions, beliefs, frustrations, desiredChange), and gathered+edited public info (extractedInfo).
- API routes: `artifacts/api-server/src/routes/` (client, audit, narrative, posts, ideas, dashboard, onboarding, admin, planner)
- Audit + narrative + profile + planner AI logic: `artifacts/api-server/src/services/` (audit.ts, narrative.ts, profile.ts, planner.ts, json.ts)
- Frontend pages: `artifacts/personal-brand/src/pages/`; theme tokens in `src/index.css`

## Architecture decisions

- Single-client-per-user: routes scope by the signed-in user's client_profile (Clerk userId). The one exception is admin, a read-only cross-user view: `requireAdmin` middleware (`artifacts/api-server/src/middlewares/requireAdmin.ts`) checks the user's Clerk email against `ADMIN_EMAILS`. Admin routes (`/admin/users`, `/admin/users/:clientId`) are 401 signed-out, 403 non-admin; `/admin/access` is auth-only and returns `{ isAdmin }` so the web layout can show the Admin nav link and the `/admin` page can redirect non-admins.
- SEO audit uses Gemini with Google Search grounding (real web results, server-side). GEO audit is web-enabled: it first gathers shared live web context about the person via Gemini Google Search grounding (text + source list), then feeds that same context to gpt-5.4, claude-sonnet-4-6, and gemini and asks each to describe the person from that current public web info (managed OpenAI/Anthropic cannot browse; Gemini also uses its own grounding). A gpt-5.4 classifier then judges each web-informed response STRICTLY against the gathered web context (real/specific/correct coverage vs. wrong-person vs. nothing). The shared sources are surfaced on GeoFindings.sources and shown on the audit page.
- `/audit/run` is a Server-Sent Events stream (progress events then a final result) — it is NOT consumed via a generated hook; the frontend uses fetch + ReadableStream.
- Onboarding is a deep, executive-coach-style 6-step intake (`pages/onboard.tsx`): beginnings -> work -> footprint -> substance -> fire -> goals. `POST /onboarding/extract` (operationId extractPublicInfo) gathers public info via Gemini grounding for the client to review/correct; `POST /onboarding/generate-bio` (generateBio) distills the substance blobs into an editable headline+bio via gpt-5.4. Both are normal JSON endpoints consumed via generated hooks. The coach material + history are stored on client_profile and enrich the narrative synthesis prompt.
- The Planner (`services/planner.ts`, `routes/planner.ts`) turns the approved narrative + content strategy into a weekly (1-4 week) calendar of post slots plus fresh backlog ideas. `POST /planner/generate` (gated: blueprint complete + a content strategy must exist; `aiGenerationRateLimit`) returns an EPHEMERAL `ContentPlanProposal` — nothing is persisted. The web layer (`pages/content.tsx` PlannerDialog) holds it in React state for human-in-the-loop review; `POST /planner/apply` then writes confirmed slots -> postsTable (scheduled) + ideas -> ideasTable, scoped to client.id. No new table; date math reuses `computeScheduledDate` from `routes/posts.ts`.
- Integration SDK `@google/genai` is externalized by the api-server esbuild bundle, so it is declared as a direct dependency of api-server so Node can resolve it at runtime.

## Product

Flow: onboarding questionnaire -> automated digital presence audit (SEO + GEO scores 0-100 with findings + recommendations) -> narrative point-of-view interview synthesized into positioning/themes/platforms -> Industry Overview capstone -> content posts and ideas.

Industry Overview is the capstone foundational panel: locked until Blueprint + Audit + Narrative + Platforms are complete, and (unlike Platforms) it does NOT auto-generate — the user must explicitly confirm they are happy with all prior panels first. It then maps the principal industry, geography focus, competitors to watch, thought leaders, an industry personal-branding playbook, and landscape context via Gemini Google Search grounding + gpt-5.4 synthesis. No manual editing — regenerate-with-feedback only. Stored per-client (`industry_overview` table), wired into deleteClientData cleanup, and fed into both the Strategist (assistant) and Investigator (dossier) agent context.

## User preferences

- No emojis in the UI.

## Gotchas

- Gemini grounding chunk URIs are vertex redirect URLs; the real source domain is in the chunk `title`, so classify SEO results by `title`, not the URL host.
- After changing AI integration imports, restart the api-server workflow (it builds with esbuild + start, not a hot-reload watcher).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
