import { describe, expect, it } from "vitest";
import { mondayOf } from "@/server/dates";
import { alertKey, toAlert } from "@/server/ops/assign-alerts";
import { clockPlan, clockTotals, pausedGeneral, type Span } from "@/server/status/clock";

const at = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00Z`);
const span = (id: string, start: string, end: string | null, visitId: string | null = null): Span =>
  ({ id, visitId, jobId: visitId && `job-${visitId}`, startedAt: at(start), endedAt: end ? at(end) : null, minutes: end ? (at(end).getTime() - at(start).getTime()) / 60_000 : null });

describe("time clock: one running entry, so hours are never counted twice", () => {
  it("clocks in only when nothing is running", () => {
    expect(clockPlan([], "clockIn")).toEqual({ stop: [], start: "general" });
    expect(clockPlan([span("g", "08:00", null)], "clockIn")).toEqual({ stop: [], start: null });
    expect(clockPlan([span("v", "08:00", null, "v1")], "clockIn").error).toMatch(/visit timer/);
  });

  it("a visit timer pauses the day clock, and stopping it resumes the day clock", () => {
    const g = span("g", "08:00", null);
    expect(clockPlan([g], "visitStart")).toEqual({ stop: [g], start: "visit" });
    const paused = [span("g", "08:00", "09:00"), span("v", "09:00", null, "v1")];
    expect(clockPlan(paused, "visitStop")).toEqual({ stop: [paused[1]], start: "general" });
  });

  it("follows back-to-back visit timers to the day clock they paused", () => {
    const day = [span("g", "08:00", "09:00"), span("a", "09:00", "09:30", "v1"), span("b", "09:30", null, "v2")];
    expect(pausedGeneral(day, day[2])).toBe(true);
    expect(clockPlan(day, "visitStop").start).toBe("general");
  });

  it("does not start the day clock for someone who never clocked in, or who had a gap", () => {
    const solo = [span("v", "09:00", null, "v1")];
    expect(clockPlan(solo, "visitStop")).toEqual({ stop: solo, start: null });
    const gap = [span("g", "08:00", "08:45"), span("v", "09:00", null, "v1")]; // clocked out, then timed a visit later
    expect(clockPlan(gap, "visitStop").start).toBeNull();
  });

  it("stopping a visit timer leaves a running day clock alone; clocking out stops whatever runs", () => {
    const g = span("g", "08:00", null), v = span("v", "09:00", null, "v1");
    expect(clockPlan([g], "visitStop")).toEqual({ stop: [], start: null });
    expect(clockPlan([span("g0", "08:00", "09:00"), v], "clockOut")).toEqual({ stop: [v], start: null });
    expect(clockPlan([g], "clockOut")).toEqual({ stop: [g], start: null });
  });

  it("a day played through the rule has no overlap: the total is the wall-clock span", () => {
    // In 08:00, visit 09:00-09:40, back on the day clock, out 12:00.
    const day = [span("g1", "08:00", "09:00"), span("v", "09:00", "09:40", "v1"), span("g2", "09:40", "12:00")];
    expect(clockTotals(day, at("12:00"))).toEqual({ general: 200, job: 40, total: 240 });
    expect(clockTotals([span("g", "08:00", null)], at("08:30"))).toEqual({ general: 30, job: 0, total: 30 });
  });
});

describe("assignment alerts", () => {
  const on = (date: string | null, at: number | null, ...userIds: string[]) => ({ date, at, userIds });
  it("tells people newly on it, and everyone on it when the day or time moved", () => {
    expect(toAlert(on("2026-12-01", null, "a"), on("2026-12-01", null, "a", "b"))).toEqual(["b"]);
    expect(toAlert(on("2026-12-01", null, "a", "b"), on("2026-12-02", null, "a", "b"))).toEqual(["a", "b"]);
    expect(toAlert(on("2026-12-01", 1, "a"), on("2026-12-01", 2, "a"))).toEqual(["a"]);
    expect(toAlert(null, on("2026-12-01", null, "a"))).toEqual(["a"]);
  });
  it("stays quiet when nothing changed for them, they were taken off, or it has no day", () => {
    expect(toAlert(on("2026-12-01", 1, "a"), on("2026-12-01", 1, "a"))).toEqual([]);
    expect(toAlert(on("2026-12-01", 1, "a", "b"), on("2026-12-01", 1, "a"))).toEqual([]);
    expect(toAlert(on("2026-12-01", 1, "a"), on(null, null, "a"))).toEqual([]);
    expect(toAlert(on("2026-12-01", 1, "a"), null)).toEqual([]);
  });
  it("dedupes per person per day inside a quarter hour", () => {
    const t = 1_800_000_000_000; // on a 15-minute boundary
    expect(alertKey("a", "2026-12-01", t)).toBe(alertKey("a", "2026-12-01", t + 14 * 60_000));
    expect(alertKey("a", "2026-12-01", t)).not.toBe(alertKey("a", "2026-12-01", t + 15 * 60_000));
    expect(alertKey("a", "2026-12-01", t)).not.toBe(alertKey("b", "2026-12-01", t));
    expect(alertKey("a", "2026-12-01", t)).not.toBe(alertKey("a", "2026-12-02", t));
  });
});

describe("mondayOf", () => {
  it("finds the Monday of any day's week", () => {
    expect(["2026-11-30", "2026-12-02", "2026-12-06", "2026-12-07"].map(mondayOf)).toEqual(["2026-11-30", "2026-11-30", "2026-11-30", "2026-12-07"]);
  });
});
