import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { dayKey } from "./schedule";

// Build the month grid: every day shown in a month view, padded out to whole
// weeks with leading days from the previous month and trailing days from the
// next. The grid always starts on a Sunday and ends on a Saturday, so its
// length is always a multiple of 7.
export function buildMonthGrid(monthCursor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(monthCursor));
  const gridEnd = endOfWeek(endOfMonth(monthCursor));
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

// Group posts by their scheduled calendar day (local time), keyed the same way
// the grid buckets cells (see dayKey). Posts with no scheduledAt or an
// unparseable timestamp are skipped; posts that share a day are ordered by
// time so the earliest appears first in a cell.
export function groupPostsByDay<T extends { scheduledAt?: string | null }>(
  posts: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const d = new Date(post.scheduledAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const list = map.get(key) ?? [];
    list.push(post);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        new Date(a.scheduledAt as string).getTime() -
        new Date(b.scheduledAt as string).getTime(),
    );
  }
  return map;
}
