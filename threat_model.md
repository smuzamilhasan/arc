# Threat Model

## Project Overview

arc is a public-facing personal-brand strategy application with a React/Vite frontend and an Express 5 API backed by PostgreSQL and Clerk authentication. Each signed-in user manages one `client_profile` containing detailed personal history, strategy data, AI-generated narrative artifacts, audit results, posts, ideas, and assistant chat history. The deployed production surface is the main web app and `/api` server; development artifacts such as the mockup sandbox should be treated as out of scope unless separately deployed.

## Assets

- **User accounts and sessions** — Clerk-authenticated sessions and bearer tokens control access to all non-health API routes. Compromise enables access to highly sensitive personal-brand and profile data.
- **Client profile and strategy data** — the database stores deep personal history, beliefs, goals, public-info extracts, narrative strategy, posts, ideas, and assistant history. This is sensitive personal and business data and must remain isolated per user.
- **Admin cross-user visibility** — the admin surface can read summaries and detail pages for all clients. Compromise would expose all customer data in one step.
- **AI-backed compute budget and provider quotas** — audit, onboarding, assistant, and generation endpoints invoke external model providers and web search. Abuse can drive cost spikes or degrade service availability.
- **Application secrets and service credentials** — database credentials, Clerk secret key, and AI integration credentials remain server-side and must never be exposed through client code, logs, or proxy misuse.

## Trust Boundaries

- **Browser to API** — all client input crosses into the Express API; the browser is untrusted even when authenticated.
- **Authenticated user to per-user data** — nearly every API route must translate the caller’s Clerk `userId` into exactly one `client_profile` and scope all reads/writes to that client.
- **Authenticated user to admin** — `/api/admin/*` crosses into a higher-privilege trust zone and must enforce `requireAdmin` server-side.
- **API to PostgreSQL** — the API server has broad data access; any authz failure or injection bug here can expose or corrupt all user data.
- **API to third-party services** — the server calls Clerk, Gemini/Google Search grounding, OpenAI, and Anthropic. User input crosses into these providers, and expensive operations must resist abuse.
- **Cross-origin web boundary** — the app relies on browser credentials and optional bearer tokens. CORS and CSRF handling determine whether another origin can trigger or read authenticated API requests.

## Scan Anchors

- Production API bootstrap: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`.
- Highest-risk server areas: `artifacts/api-server/src/routes/admin.ts`, `client.ts`, `assistant.ts`, `audit.ts`, `onboarding.ts`, and AI-backed services under `artifacts/api-server/src/services/`.
- Public surface: `/api/healthz` and the public marketing/sign-in pages.
- Authenticated surface: nearly all `/api/*` routes plus the main application pages under `artifacts/personal-brand/src/pages/`.
- Admin surface: `/api/admin/access`, `/api/admin/users`, `/api/admin/users/:clientId` and the web admin page.
- Usually ignore unless separately deployed: `artifacts/mockup-sandbox`, supporting build scripts, and other non-mounted artifacts.

## Threat Categories

### Spoofing

The application depends on Clerk identity for every non-health API route. The server must derive the acting principal from validated Clerk auth on each request and must not trust client-supplied user identifiers. Any route that can be reached with browser credentials must also resist cross-origin request forgery so another site cannot act as the user.

### Tampering

Clients can submit large amounts of editable profile, narrative, post, idea, and assistant-triggered change data. The API must validate request bodies, ignore client attempts to set ownership fields, and keep server-side business rules — especially per-user scoping and gated generation flows — authoritative.

### Information Disclosure

The system stores unusually sensitive personal and strategic data, and the admin surface aggregates it across all users. API responses must remain scoped to the authenticated client unless the caller is an approved admin, and cross-origin policies must not allow another site to read authenticated responses. Error handling and logging must avoid exposing secrets or private profile data outside trusted operator channels.

### Denial of Service

Multiple endpoints trigger expensive LLM calls and live web-search grounding. The production system must prevent newly created or compromised accounts from repeatedly invoking these operations at unbounded rates, otherwise a single attacker can consume provider quotas, create runaway cost, or tie up request capacity.

### Elevation of Privilege

The main privilege boundary is from ordinary authenticated users to admin cross-user read access. All admin routes must enforce `requireAdmin` server-side, and all per-user CRUD/generation routes must scope database access by resolved `client.id` rather than trusting route parameters or request bodies. Assistant-confirmed actions must never escape the caller’s own client context.
