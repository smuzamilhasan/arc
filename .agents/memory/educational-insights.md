---
name: Educational insights (separate from assistant actions)
description: How arc's strategist "educational insight" output class differs from AssistantAction proposals and where it surfaces.
---

# Educational insights

arc's strategist produces TWO distinct output classes. Do not conflate them.

1. **AssistantAction proposals** — operational, apply a change to the system (update_profile, update_narrative, etc.), human-confirmed via diff cards. Adding a new kind touches db union + openapi enum + service ALL_KINDS/validate/diff/prompt + route applyAction + web label/invalidation maps.
2. **Educational insights** — a SEPARATE class. Never an action kind, never "applied" to anything. They only teach/encourage, anchored to one of 5 messaging pillars, journey/data-aware, persisted, rotated, dismissible.

**Why:** insights were deliberately built as their own table/endpoints/scheduler-path so they never enter the confirm/reject action machinery. Re-adding them as an action kind would wrongly make encouragement look like a system change.

**How to apply:**
- The 5 pillars (ids are a closed union mirrored client+server): patience, authentic_input, ai_augments, creative_thought, brand_reflects_life. All educational copy threads through them.
- Server: separate prompt + zod schema + generateEducationalInsights; scheduler refreshes on its own cadence (stale/empty/state-changed), runs for ALL client profiles (not narrative-gated like proactive suggestions), bounded per tick.
- Notifier: SSE `notify(clientId, type)` carries an "insights" type alongside "proactive"; the web notifications hook invalidates the insights query on that event.
- Web surfaces: Learn hub at /learn (static, journey-aware curriculum in `lib/learn.ts`), a dismissible ContextualInsight card on Dashboard/Blueprint/Pillar/Audit (filters by context, "general" is welcome anywhere, falls back to a static pillar-threaded note when no live insight matches), and an insights list at the top of the Strategist chat panel.
- Any new clientId-keyed insight table must be in deleteClientData (it is) — same rule as every per-client table.
