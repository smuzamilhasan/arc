---
name: Adding an assistant action kind
description: The full set of places a new AssistantAction kind must be wired or it silently drops/blank-renders.
---

Adding a new assistant action kind (the chat strategist's confirm-before-apply proposals) requires edits in all of these, or it silently breaks:

1. `lib/db/src/schema/assistantMessages.ts` — add to the `AssistantActionKind` union.
2. `lib/api-spec/openapi.yaml` — add to the `AssistantAction.kind` enum, then run `pnpm --filter @workspace/api-spec run codegen` (regenerates the web `AssistantActionKind` type so the frontend `Record<AssistantActionKind, ...>` maps stay exhaustive).
3. `artifacts/api-server/src/services/assistant.ts` — payload Zod schema + add to `ALL_KINDS` (the model's raw actions are dropped if the kind isn't listed) + `validatePayload` case (null payload = dropped unless it's a no-payload kind like regenerate_narrative) + `buildDiff` case (the before/after card) + describe the kind in `SYSTEM_PROMPT` (the model won't emit a kind it isn't told about).
4. `artifacts/api-server/src/routes/assistant.ts` — `applyAction` case (the confirm/confirm-batch apply path).
5. `artifacts/personal-brand/src/components/assistant-chat.tsx` — `ACTION_LABELS` entry (exhaustive Record, typecheck fails without it) + `queryKeysForKind` so confirming invalidates the right TanStack queries.

**Scope decision:** the strategist is deliberately macro-only. Allowed kinds are exactly update_profile/update_narrative/regenerate_narrative/update_content_strategy/update_platforms. Operational content kinds (create_post/update_post/schedule_posts/create_idea/update_idea) were intentionally removed — SYSTEM_PROMPT declines operational requests and hands off to Ghostwriter/Planner/Investigator. Do not re-add operational kinds without an explicit product decision.

**Why:** ALL_KINDS, validatePayload, and the SYSTEM_PROMPT description are independent gates — miss any one and the action either never reaches the user or gets dropped server-side with no error.

**How to apply:** when reusing an existing write path (e.g. schedule_posts reuses /posts/schedule-batch), extract the core into a shared exported helper (`scheduleClientPosts` in routes/posts.ts) so the route and applyAction stay identical. Build schedule dates from y/m/d parts (not `new Date("YYYY-MM-DD")`) to avoid the TZ off-by-one — see batch-schedule-dates.md.
