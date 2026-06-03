# arc

arc (short for "story arc") is a single-client personal brand strategy tool: it onboards one individual, audits how they show up across Google search (SEO) and AI models (GEO), synthesizes a positioning narrative, and drives a content strategy.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only). If drizzle hits an interactive rename/conflict prompt (no TTY), drop the conflicting old table manually first, then re-run push.
- Required env: `DATABASE_URL`. AI runs through Replit-managed integrations (OpenAI, Anthropic, Gemini) — no API keys needed.

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
- DB schema: `lib/db/src/schema/` (clientProfile, auditResults, narrativeProfiles, posts, ideas) — barrel at `index.ts`
- API routes: `artifacts/api-server/src/routes/` (client, audit, narrative, posts, ideas, dashboard)
- Audit + narrative AI logic: `artifacts/api-server/src/services/` (audit.ts, narrative.ts, json.ts)
- Frontend pages: `artifacts/personal-brand/src/pages/`; theme tokens in `src/index.css`

## Architecture decisions

- Single-client: routes operate on the most-recent client_profile row; no auth/multi-tenancy.
- SEO audit uses Gemini with Google Search grounding (real web results, server-side); GEO audit asks gpt-5.4, claude-sonnet-4-6, and gemini (no grounding) "what do you know about [name]?" then a gpt-5.4 classifier judges whether each model truly knows the person.
- `/audit/run` is a Server-Sent Events stream (progress events then a final result) — it is NOT consumed via a generated hook; the frontend uses fetch + ReadableStream.
- Integration SDK `@google/genai` is externalized by the api-server esbuild bundle, so it is declared as a direct dependency of api-server so Node can resolve it at runtime.

## Product

Flow: onboarding questionnaire -> automated digital presence audit (SEO + GEO scores 0-100 with findings + recommendations) -> narrative point-of-view interview synthesized into positioning/themes/platforms -> content posts and ideas.

## User preferences

- No emojis in the UI.

## Gotchas

- Gemini grounding chunk URIs are vertex redirect URLs; the real source domain is in the chunk `title`, so classify SEO results by `title`, not the URL host.
- After changing AI integration imports, restart the api-server workflow (it builds with esbuild + start, not a hot-reload watcher).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
