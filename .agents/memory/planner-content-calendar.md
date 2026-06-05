---
name: Planner content calendar
description: How the Planner (weekly content calendar + ideas) is wired and why it reuses existing tables.
---

# Planner (content calendar) design

The Planner turns the approved narrative + content strategy into a weekly (1-4 week)
calendar of post slots and fresh backlog ideas.

## Key decision: no new DB table
The proposal is **ephemeral** — `/planner/generate` returns a `ContentPlanProposal`
that is NOT persisted; the web layer holds it in React state until the user confirms.
Only `/planner/apply` writes, mapping confirmed slots -> `postsTable`
(status "scheduled", content=brief, tags=[contentType, format]) and ideas -> `ideasTable`,
all scoped to `client.id` in one transaction.

**Why:** human-in-the-loop (client confirms before commit) plus reusing posts+ideas
avoids touching `deleteClientData` (no per-client cleanup change) and keeps the
existing calendar/library UI as the single source of truth for scheduled content.

## Gating + rate limiting
`/planner/generate` is gated: 404 (no client) -> 403 (blueprint incomplete) -> 403
(no content strategy yet), and uses `aiGenerationRateLimit`. `/planner/apply` is
auth-only (no AI) and 400s on a malformed body.

## Date math
Slots come back from the model with an integer `dayOffset`; the server computes the
concrete `targetDate` via the shared `computeScheduledDate(startDate, offsetDays, time)`
helper exported from `routes/posts.ts` (numeric Y/M/D parts, no TZ off-by-one).

## Conversational Planner agent owns ALL calendar mutations
There are now two Planner surfaces: the original one-shot `/planner/generate` +
`PlannerDialog` (unchanged), AND a conversational Planner agent (its own nav item,
chat infra mirrored from the Strategist) that owns EVERY calendar/scheduling change
via confirm-before-apply proposals: generate_calendar, schedule_posts,
reschedule_posts, delete_posts, shift_posts.

**Why this split of duties:** the Strategist must NOT apply calendar changes and the
Manager must NOT apply them either — the Manager *relays* any planning brief to the
Planner (persists an unseen planner_message; surfaces proposals as "Review and confirm
in the Planner"). Calendar writes happen in exactly one place so human-in-the-loop
review is never bypassed. If you add a Manager agent that touches scheduling, route it
through the Planner, never write posts/ideas directly.

**How to apply:** Planner chat mirrors Strategist exactly — to add a new planner action
kind, wire it in the db PlannerActionKind union, openapi PlannerAction enum, the service
(validatePayload/buildDiff/prompt), the route `applyAction` switch, and the web
ACTION_LABELS map. Pure date helpers live in `services/scheduleMath.ts` (rescheduleToDay,
shiftDateByDays — no db, unit-tested). The unread dot reads `/planner/chat/unread`.
