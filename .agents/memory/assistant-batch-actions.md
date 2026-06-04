---
name: Assistant batch confirm/reject
description: Why bulk action apply/dismiss goes through dedicated batch endpoints, not parallel single-action calls
---

The strategist assistant persists a turn's proposed actions as a JSON `actions` array
on a single `assistant_messages` row. Confirm/reject of one action reads that whole
array, mutates one element's status, and writes the array back.

**Rule:** Apply/dismiss MANY actions from the same turn via the batch endpoints
(`/assistant/actions/confirm-batch`, `/assistant/actions/reject-batch`), which group
by message row and do one read-modify-write per row. Do NOT fan out parallel
single-action confirm/reject calls for a bulk "Confirm all".

**Why:** Parallel single-action calls on actions in the same row each read the full
`actions` array and write it back — a classic lost-update race, so only the
last writer's status change survives and the rest silently revert to "proposed".

**How to apply:** The web "Confirm all"/"Reject all" buttons (assistant-chat.tsx
ActionGroup) call the batch hooks. Batch confirm skips non-"proposed" actions, so it
is idempotent. Batch reject sets status only (no comment-driven AI revision — that
stays on the single-action reject path). Both are per-client scoped: unknown/foreign
action ids are simply omitted from the returned list.
