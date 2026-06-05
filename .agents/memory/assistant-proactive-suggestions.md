---
name: Assistant proactive suggestions + unread/SSE
description: How the strategist generates suggestions on its own and surfaces them as unread, plus the live-notify wiring.
---

The strategist can proactively post suggestions (no user prompt). The moving parts:

- `assistant_messages.seen` (boolean, default true) — proactive inserts set `seen=false`. Unread = count of unseen assistant messages for the client. Opening the chat marks them seen.
- `assistant_reviews` table (one row per clientId): `lastReviewedAt`, `lastStateHash`, `updatedAt`. The scheduler debounces by hashing the client's strategy state (sha256); if the hash is unchanged since lastReviewedAt it skips — avoids re-suggesting on identical state.
- `proactiveScheduler.ts` — interval tick (~5min), per-client cooldown (~12h), bounded MAX per tick, skips clients with a pending unseen suggestion, only runs for clients that already have a narrative. Started from `index.ts` AFTER `app.listen`.
- `assistantNotifier.ts` — in-process `Map<clientId, Set<res>>` subscribe/unsubscribe/notify for SSE fan-out. In-process only: a multi-instance deploy would not fan out across instances.

Endpoints: `GET /assistant/unread`, `POST /assistant/seen`, `GET /assistant/stream` (SSE, ~25s heartbeat). All auth-scoped per client. `serializeMessage` must include `seen`.

**Why:** the debounce (state hash + cooldown + skip-pending) is what keeps the background generator from spamming or burning AI budget — see threat_model DoS. Remove any one guard and a static client gets repeat suggestions.

**How to apply:** the web SSE hook sends a Clerk Bearer token via fetch+getReader (third-party-cookie blocked in preview iframe — see web-api-auth-bearer-bridge.md). On notify it invalidates the assistant queries + toasts. Launcher/nav unread dot is driven by the `GET /assistant/unread` query (polled) and cleared on chat open.
