// Pure date math for the Planner's reschedule/shift actions. Self-contained
// (no DB, no app imports) so it can be unit-tested in isolation. All arithmetic
// is done with numeric local Y/M/D parts rather than string parsing of a Date,
// which avoids the UTC off-by-one-day drift that `new Date("YYYY-MM-DD")`
// introduces in negative-offset timezones.

const TIME_RE = /^\d{1,2}:\d{2}$/;

// Move a post to a specific calendar day, keeping its existing time of day
// unless an explicit `time` ("HH:MM") is supplied. `current` may be null for a
// post that was never scheduled — in that case the time defaults to 09:00.
// Throws on a malformed day or time so callers can reject the action.
export function rescheduleToDay(
  current: Date | null,
  day: string,
  time?: string,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) {
    throw new Error("Invalid day");
  }

  let hour: number;
  let minute: number;
  if (time !== undefined && time !== "") {
    if (!TIME_RE.test(time)) throw new Error("Invalid time");
    [hour, minute] = time.split(":").map(Number);
  } else if (current) {
    hour = current.getHours();
    minute = current.getMinutes();
  } else {
    hour = 9;
    minute = 0;
  }

  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    throw new Error("Invalid time");
  }

  return new Date(year, month - 1, date, hour, minute, 0, 0);
}

// Shift a post by a whole number of days (positive = later, negative = earlier),
// preserving its time of day. Uses the local Y/M/D parts so daylight-saving
// transitions never nudge the result onto the wrong calendar day. Throws when
// the post has no current scheduled date (nothing to shift) or delta is not a
// finite integer.
export function shiftDateByDays(current: Date | null, deltaDays: number): Date {
  if (!current) throw new Error("No scheduled date to shift");
  if (!Number.isFinite(deltaDays)) throw new Error("Invalid day delta");
  const delta = Math.trunc(deltaDays);
  return new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + delta,
    current.getHours(),
    current.getMinutes(),
    0,
    0,
  );
}
