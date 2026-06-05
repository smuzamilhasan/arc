---
name: Manager orchestration
description: How the Manager agent decomposes one instruction and delegates to the existing agents
---

The Manager turns one client instruction into sub-tasks routed to the existing agents (Investigator, Strategist, Planner, Ghostwriter) in canonical research->strategy->plan->drafts order. It does NOT re-implement those agents — it calls their existing services/routes.

**Boundary rule (services vs routes):** the ONLY AI call the Manager itself makes is `decomposeInstruction` (one gpt-5.4 json_object call) in `services/manager.ts`. All per-agent work runs in `routes/manager.ts` by invoking each agent's own service. Keep AI in services, DB+orchestration in routes — same split the rest of the app uses.

**Cost bounding:** one decompose call + at most MAX_MANAGER_TASKS (4) agent calls per run. `decomposeInstruction` dedupes to one task per agent and sorts canonical order. The route adds `aiGenerationRateLimit` + an in-memory `managerInFlight` per-client concurrency guard.

**Human-in-the-loop (deliberate limitation):** within a single run, unconfirmed Strategist proposals do NOT feed the Planner — the Planner uses whatever strategy already exists in the DB. The Strategist's output is surfaced as confirm/reject proposals + a "review in Strategist" link; nothing strategy-changing is auto-applied. Planner/Ghostwriter outputs are also ephemeral proposals: Planner slots/ideas apply via the existing content-plan apply hook, Ghostwriter drafts save via the normal create-post hook. This keeps the client in control.

**Persistence:** `manager_runs` table (one row per run, tasks as JSON). Must be in `deleteClientData` (it is) or rows leak on reset/account-delete. The Planner is skipped (status "skipped") if the Blueprint is incomplete or no content strategy exists.
