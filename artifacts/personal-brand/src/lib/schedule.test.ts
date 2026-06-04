import { describe, it, expect } from "vitest";
import { dayKey, rescheduleToDay, shiftByDays } from "./schedule";

// Build an ISO timestamp from local wall-clock parts so the assertions are
// independent of the machine's timezone: everything round-trips through the
// same local Date methods the helpers use.
function localIso(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
): string {
  return new Date(y, m - 1, d, hh, mm, ss, 0).toISOString();
}

describe("dayKey", () => {
  it("returns the local calendar day", () => {
    expect(dayKey(new Date(2026, 5, 4, 9, 30))).toBe("2026-06-04");
  });

  it("uses local time, not UTC, for late-evening times", () => {
    // 11:30pm local on June 4 must stay June 4 regardless of UTC offset.
    expect(dayKey(new Date(2026, 5, 4, 23, 30))).toBe("2026-06-04");
  });
});

describe("rescheduleToDay", () => {
  it("moves a post to another day while keeping its hour and minute", () => {
    const iso = localIso(2026, 6, 4, 9, 30);
    const next = rescheduleToDay(iso, "2026-06-10");
    expect(next).not.toBeNull();
    const d = new Date(next!);
    expect(dayKey(d)).toBe("2026-06-10");
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it("changes only the date, never the time of day", () => {
    const iso = localIso(2026, 6, 4, 14, 45, 12);
    const d = new Date(rescheduleToDay(iso, "2026-07-01")!);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(45);
    expect(d.getSeconds()).toBe(12);
  });

  it("preserves a late-evening time without drifting to the wrong day", () => {
    // 11:00pm is the classic case where UTC-string math lands a day off.
    const iso = localIso(2026, 6, 4, 23, 0);
    const d = new Date(rescheduleToDay(iso, "2026-06-05")!);
    expect(dayKey(d)).toBe("2026-06-05");
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(0);
  });

  it("returns null for a same-day drop (no-op)", () => {
    const iso = localIso(2026, 6, 4, 9, 30);
    expect(rescheduleToDay(iso, "2026-06-04")).toBeNull();
  });

  it("can move a post backwards to an earlier day", () => {
    const iso = localIso(2026, 6, 10, 8, 15);
    const d = new Date(rescheduleToDay(iso, "2026-06-03")!);
    expect(dayKey(d)).toBe("2026-06-03");
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(15);
  });
});

describe("shiftByDays", () => {
  it("shifts a date forward by the given number of days", () => {
    const iso = localIso(2026, 6, 4, 9, 30);
    const d = new Date(shiftByDays(iso, 3));
    expect(dayKey(d)).toBe("2026-06-07");
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it("shifts a date backward by the given number of days", () => {
    const iso = localIso(2026, 6, 4, 9, 30);
    const d = new Date(shiftByDays(iso, -2));
    expect(dayKey(d)).toBe("2026-06-02");
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it("preserves the wall-clock time across the shift", () => {
    const iso = localIso(2026, 6, 4, 23, 45, 30);
    const d = new Date(shiftByDays(iso, 1));
    expect(dayKey(d)).toBe("2026-06-05");
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(45);
    expect(d.getSeconds()).toBe(30);
  });

  it("crosses a month boundary correctly", () => {
    const iso = localIso(2026, 6, 29, 10, 0);
    const d = new Date(shiftByDays(iso, 5));
    expect(dayKey(d)).toBe("2026-07-04");
    expect(d.getHours()).toBe(10);
  });

  it("crosses a year boundary correctly", () => {
    const iso = localIso(2026, 12, 30, 12, 0);
    const d = new Date(shiftByDays(iso, 4));
    expect(dayKey(d)).toBe("2027-01-03");
    expect(d.getHours()).toBe(12);
  });

  it("applies the same shift uniformly to every post on a day", () => {
    const dayPosts = [
      localIso(2026, 6, 4, 8, 0),
      localIso(2026, 6, 4, 12, 30),
      localIso(2026, 6, 4, 18, 15),
    ];
    const shifted = dayPosts.map((iso) => new Date(shiftByDays(iso, 2)));
    for (const d of shifted) {
      expect(dayKey(d)).toBe("2026-06-06");
    }
    expect(shifted.map((d) => `${d.getHours()}:${d.getMinutes()}`)).toEqual([
      "8:0",
      "12:30",
      "18:15",
    ]);
  });
});
