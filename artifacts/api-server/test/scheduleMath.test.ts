import { describe, it, expect } from "vitest";
import { rescheduleToDay, shiftDateByDays } from "../src/services/scheduleMath";

// These are pure date-math helpers — no DB, no AI. They guard against the
// timezone off-by-one-day drift that string-parsed dates introduce.

describe("rescheduleToDay", () => {
  it("lands on the intended local calendar day", () => {
    const result = rescheduleToDay(null, "2026-07-01", "09:00");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6); // July (0-indexed)
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it("preserves the existing time of day when no time is given", () => {
    const current = new Date(2026, 5, 10, 14, 30, 0, 0);
    const result = rescheduleToDay(current, "2026-07-15");
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(6);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it("defaults to 09:00 when there is no current date and no time", () => {
    const result = rescheduleToDay(null, "2026-07-15");
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it("overrides the time when an explicit time is supplied", () => {
    const current = new Date(2026, 5, 10, 14, 30, 0, 0);
    const result = rescheduleToDay(current, "2026-07-15", "07:45");
    expect(result.getHours()).toBe(7);
    expect(result.getMinutes()).toBe(45);
  });

  it("throws on a malformed day", () => {
    expect(() => rescheduleToDay(null, "not-a-date")).toThrow();
    expect(() => rescheduleToDay(null, "2026-13")).toThrow();
  });

  it("throws on a malformed time", () => {
    expect(() => rescheduleToDay(null, "2026-07-01", "9am")).toThrow();
    expect(() => rescheduleToDay(null, "2026-07-01", "25:00")).toThrow();
  });
});

describe("shiftDateByDays", () => {
  it("shifts forward by whole days, preserving time", () => {
    const current = new Date(2026, 6, 1, 9, 0, 0, 0);
    const result = shiftDateByDays(current, 3);
    expect(result.getDate()).toBe(4);
    expect(result.getMonth()).toBe(6);
    expect(result.getHours()).toBe(9);
  });

  it("shifts backward across a month boundary", () => {
    const current = new Date(2026, 6, 2, 12, 15, 0, 0);
    const result = shiftDateByDays(current, -5);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(27);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(15);
  });

  it("truncates a fractional delta to whole days", () => {
    const current = new Date(2026, 6, 1, 9, 0, 0, 0);
    const result = shiftDateByDays(current, 2.9);
    expect(result.getDate()).toBe(3);
  });

  it("throws when there is no date to shift", () => {
    expect(() => shiftDateByDays(null, 1)).toThrow();
  });

  it("throws on a non-finite delta", () => {
    const current = new Date(2026, 6, 1, 9, 0, 0, 0);
    expect(() => shiftDateByDays(current, Number.NaN)).toThrow();
  });
});
