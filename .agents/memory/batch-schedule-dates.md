---
name: Batch post scheduling date handling
description: How the schedule-batch endpoint lays out dates and why it builds Dates from y/m/d parts.
---

# Batch post scheduling

The schedule-batch posts endpoint takes `postIds` (ordered), a `startDate` (YYYY-MM-DD), an
optional `intervalDays` (default 1), and an optional `time` (HH:MM, default 09:00). It assigns
`scheduledAt = start + index*interval days` and sets `status = "scheduled"`, scoped to the
signed-in client.

**Rule:** build the scheduled timestamp from numeric parts —
`new Date(year, month-1, day + i*step, hour, minute)` — never `new Date("YYYY-MM-DD")`.

**Why:** `new Date("2026-07-01")` parses as UTC midnight, which in a negative-offset timezone
lands on the previous calendar day. Building from local parts keeps each post on the date the
user picked. The same reasoning applies on the web side when previewing the per-post date.

**How to apply:** any future "spread across dates" feature (ideas, reminders, campaigns) must
follow the same part-based construction and must filter `postIds` to rows the caller owns before
writing (per-client scoping), mirroring the other posts routes.
