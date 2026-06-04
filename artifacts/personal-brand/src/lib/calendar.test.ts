import { describe, it, expect } from "vitest";
import { buildMonthGrid, groupPostsByDay } from "./calendar";
import { dayKey } from "./schedule";

// Build an ISO timestamp from local wall-clock parts so assertions are
// independent of the machine's timezone (mirrors the schedule.test.ts helper).
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

describe("buildMonthGrid", () => {
  it("pads the month out to whole weeks (Sunday start, Saturday end)", () => {
    // June 2026: June 1 is a Monday, June 30 a Tuesday.
    const grid = buildMonthGrid(new Date(2026, 5, 1));
    // First cell is the Sunday on or before the 1st; last is the Saturday
    // on or after the 30th.
    expect(grid[0].getDay()).toBe(0);
    expect(grid[grid.length - 1].getDay()).toBe(6);
    // Always a whole number of weeks.
    expect(grid.length % 7).toBe(0);
  });

  it("includes leading days from the previous month", () => {
    // June 1 2026 is a Monday, so the grid leads with Sunday May 31.
    const grid = buildMonthGrid(new Date(2026, 5, 1));
    expect(dayKey(grid[0])).toBe("2026-05-31");
    expect(grid[0].getMonth()).toBe(4); // May
  });

  it("includes trailing days from the next month", () => {
    // June 30 2026 is a Tuesday, so the grid trails to Saturday July 4.
    const grid = buildMonthGrid(new Date(2026, 5, 1));
    const last = grid[grid.length - 1];
    expect(dayKey(last)).toBe("2026-07-04");
    expect(last.getMonth()).toBe(6); // July
  });

  it("covers every day of the target month exactly once", () => {
    const grid = buildMonthGrid(new Date(2026, 5, 15));
    const juneKeys = grid
      .filter((d) => d.getMonth() === 5)
      .map((d) => dayKey(d));
    expect(juneKeys).toHaveLength(30);
    expect(juneKeys[0]).toBe("2026-06-01");
    expect(juneKeys[juneKeys.length - 1]).toBe("2026-06-30");
  });

  it("handles a month that starts on a Sunday with no leading padding", () => {
    // February 2026 starts on a Sunday.
    const grid = buildMonthGrid(new Date(2026, 1, 1));
    expect(dayKey(grid[0])).toBe("2026-02-01");
  });

  it("is anchored to the month, not the day-of-month, of the cursor", () => {
    const fromFirst = buildMonthGrid(new Date(2026, 5, 1)).map((d) =>
      d.toISOString(),
    );
    const fromMidMonth = buildMonthGrid(new Date(2026, 5, 23, 17, 45)).map((d) =>
      d.toISOString(),
    );
    expect(fromMidMonth).toEqual(fromFirst);
  });
});

describe("groupPostsByDay", () => {
  it("buckets each post under its scheduled calendar day", () => {
    const posts = [
      { id: "a", scheduledAt: localIso(2026, 6, 4, 9, 0) },
      { id: "b", scheduledAt: localIso(2026, 6, 10, 12, 0) },
    ];
    const map = groupPostsByDay(posts);
    expect(map.get("2026-06-04")?.map((p) => p.id)).toEqual(["a"]);
    expect(map.get("2026-06-10")?.map((p) => p.id)).toEqual(["b"]);
  });

  it("lands a late-evening post on its local day, not a UTC-shifted one", () => {
    const posts = [{ id: "late", scheduledAt: localIso(2026, 6, 4, 23, 30) }];
    const map = groupPostsByDay(posts);
    expect(map.get("2026-06-04")?.map((p) => p.id)).toEqual(["late"]);
  });

  it("orders posts within a day by time, earliest first", () => {
    const posts = [
      { id: "afternoon", scheduledAt: localIso(2026, 6, 4, 15, 0) },
      { id: "morning", scheduledAt: localIso(2026, 6, 4, 8, 0) },
      { id: "noon", scheduledAt: localIso(2026, 6, 4, 12, 0) },
    ];
    const map = groupPostsByDay(posts);
    expect(map.get("2026-06-04")?.map((p) => p.id)).toEqual([
      "morning",
      "noon",
      "afternoon",
    ]);
  });

  it("skips posts with no scheduledAt", () => {
    const posts = [
      { id: "scheduled", scheduledAt: localIso(2026, 6, 4, 9, 0) },
      { id: "draft", scheduledAt: null },
      { id: "undated", scheduledAt: undefined },
    ];
    const map = groupPostsByDay(posts);
    expect(map.size).toBe(1);
    expect(map.get("2026-06-04")?.map((p) => p.id)).toEqual(["scheduled"]);
  });

  it("skips posts with an unparseable timestamp", () => {
    const posts = [
      { id: "good", scheduledAt: localIso(2026, 6, 4, 9, 0) },
      { id: "bad", scheduledAt: "not-a-date" },
    ];
    const map = groupPostsByDay(posts);
    expect(map.size).toBe(1);
    expect(map.has("2026-06-04")).toBe(true);
  });

  it("returns an empty map for an empty month with no posts", () => {
    expect(groupPostsByDay([]).size).toBe(0);
  });

  it("groups multiple posts that share a day under one key", () => {
    const posts = [
      { id: "x", scheduledAt: localIso(2026, 6, 4, 9, 0) },
      { id: "y", scheduledAt: localIso(2026, 6, 4, 17, 0) },
    ];
    const map = groupPostsByDay(posts);
    expect(map.get("2026-06-04")).toHaveLength(2);
  });
});
