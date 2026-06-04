import { format } from "date-fns";

// Calendar-day key (local time) for a date, matching the keys the calendar grid
// uses to bucket posts. Always use this for same-day comparisons rather than
// constructing dates from "YYYY-MM-DD" strings (which parse as UTC midnight and
// cause timezone off-by-one drift).
export function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Move a scheduled post to a different calendar day while preserving its local
// time of day (hour/minute/second). Returns the new ISO timestamp, or null when
// the post is already on that day (a no-op drop).
export function rescheduleToDay(
  scheduledAt: string,
  newDayKey: string,
): string | null {
  const existing = new Date(scheduledAt);
  if (dayKey(existing) === newDayKey) return null;
  const [y, m, d] = newDayKey.split("-").map(Number);
  const next = new Date(
    y,
    m - 1,
    d,
    existing.getHours(),
    existing.getMinutes(),
    existing.getSeconds(),
    existing.getMilliseconds(),
  );
  return next.toISOString();
}

// Shift a scheduled date forward (positive) or back (negative) by a number of
// whole days, preserving the local time of day across the shift. Using
// setDate(getDate() + delta) keeps the wall-clock time stable even across DST
// transitions, avoiding the off-by-one drift of millisecond arithmetic.
export function shiftByDays(scheduledAt: string, deltaDays: number): string {
  const existing = new Date(scheduledAt);
  const shifted = new Date(existing);
  shifted.setDate(shifted.getDate() + deltaDays);
  return shifted.toISOString();
}
