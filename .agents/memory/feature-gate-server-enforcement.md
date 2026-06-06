---
name: Feature-gate server enforcement
description: A UI lock (nav/page guard) on a gated panel must be mirrored by a server-side check on its write/generate endpoints, or the gate is bypassable.
---

A UI-only lock is not a lock. When a panel is gated (e.g. Platforms unlocks only when the Blueprint is 100% complete), the nav lock and page guard are cosmetic — any authenticated caller can still hit the underlying endpoint directly.

**Why:** code review caught that `POST /platforms/generate` had no completion check, so the "locked until blueprint 100%" requirement was bypassable (and would burn an AI call on an incomplete profile).

**How to apply:** for any gated feature, replicate the unlock predicate server-side and return 403 from the generate/write route before doing work. The web completion logic lives in `artifacts/personal-brand/src/lib/blueprint.ts` (PILLARS countFields); mirror that field list in the API service (see `isBlueprintComplete` in `artifacts/api-server/src/services/platforms.ts`). Document the 403 in `openapi.yaml`, regenerate, and add a deterministic test (incomplete profile -> 403, no AI call).

**Client side has MORE than one launch surface.** Gating only the page wrapper is not enough — a feature can be opened from a toolbar button, a `?param=` deep link / auto-open effect, and an "expand from X" handler elsewhere. When you lock a feature, gate every one of those entry points (e.g. the Ghostwriter agent: it has the page-level `AgentGate`, but the Content page also opens it via the toolbar button, the `?draftIdea=` effect, and `onExpandWithGhostwriter` from the post editor — all three needed the same `useAgentsGate().unlocked` check, and the deep-link path must strip its params without opening). The reusable `useAgentsGate()` hook in `components/agent-gate.tsx` exposes the same predicate `AgentGate` uses so secondary surfaces stay in lockstep.
