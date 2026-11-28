import { describe, expect, it } from "vitest";
import { freeInWindow, openTimes, slotText, whoIsFree } from "@/server/booking/slots";
import { splitRoute } from "@/server/runner";

describe("splitRoute", () => {
  const stops = (spec: string) => [...spec].map((c, i) => ({ id: `v${i}`, community: c }));
  it("keeps communities together and balances", () => {
    const m = splitRoute(stops("aaabbbcccddd"), ["x", "y"]);
    expect([...m.values()]).toEqual(["x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y", "y"]);
  });
  it("splits a single huge community", () => {
    const m = splitRoute(stops("aaaaaaaaaa"), ["x", "y"]);
    expect([...m.values()].filter((u) => u === "x")).toHaveLength(5);
  });
  it("assigns everything to one person and handles no people", () => {
    expect(new Set(splitRoute(stops("abc"), ["x"]).values())).toEqual(new Set(["x"]));
    expect(splitRoute(stops("abc"), []).size).toBe(0);
  });
  it("assigns every stop", () => {
    expect(splitRoute(stops("aabbbbbbcdde"), ["x", "y", "z"]).size).toBe(12);
  });
});

describe("booking slots", () => {
  const MON = "2026-12-07";
  const hours = { "1": ["09:00", "12:00"] as [string, string] };
  const av = (busy: { userIds: string[]; start: number; end: number }[] = [], timeOff: { userId: string | null; startDate: string; endDate: string }[] = []) => ({
    people: [{ id: "a", hours }, { id: "b", hours }], timeOff,
    busy: busy.map((b, i) => ({ id: `t${i}`, date: MON, label: "x", ...b })),
  });
  it("lists hourly times inside working hours, nothing on days off", () => {
    expect(openTimes(av(), MON, 2)).toEqual([{ date: MON, windows: ["early", "midday"], times: [540, 600, 660].map((start) => ({ start, label: expect.any(String) })) }]);
  });
  it("a time stays open while anyone is free", () => {
    const r = openTimes(av([{ userIds: ["a"], start: 540, end: 600 }]), MON, 1);
    expect(r[0].times.map((t) => t.start)).toEqual([540, 600, 660]);
    expect(whoIsFree(av([{ userIds: ["a"], start: 540, end: 600 }]), MON, 540)).toBe("b");
  });
  it("unassigned items and closures block everyone", () => {
    expect(whoIsFree(av([{ userIds: [], start: 540, end: 600 }]), MON, 540)).toBeNull();
    expect(openTimes(av([], [{ userId: null, startDate: MON, endDate: MON }]), MON, 1)).toEqual([]);
  });
  it("rejects times outside hours", () => {
    expect(whoIsFree(av(), MON, 690)).toBeNull();
    expect(whoIsFree(av(), MON, 480)).toBeNull();
  });
  it("windows: first free person and time inside the window", () => {
    expect(freeInWindow(av(), MON, "early")).toEqual({ userId: "a", start: 540 });
    expect(freeInWindow(av([{ userIds: ["a"], start: 540, end: 720 }]), MON, "midday")).toEqual({ userId: "b", start: 600 });
    expect(freeInWindow(av(), MON, "evening")).toBeNull();
    expect(freeInWindow(av([{ userIds: [], start: 540, end: 720 }]), MON, "early")).toBeNull();
  });
  it("tells the client the window, not the planned time", () => {
    expect(slotText({ date: MON, start: 540, window: { label: "Early", hint: "6–11 am" } })).toBe("Monday, December 7, Early (6–11 am)");
    expect(slotText({ date: MON, start: 540, window: null })).toBe("Monday, December 7 at 9:00 am");
  });
});
