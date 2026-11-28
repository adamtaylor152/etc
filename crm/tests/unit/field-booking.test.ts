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

import { estimate, validate } from "@/server/booking/validate";
import { currentCharge, snowCharge } from "@/server/ops/drive-size";
import { sizeNote } from "@/server/runner";

describe("driveway size", () => {
  const prices = { once: { STANDARD: 3500, LARGE: 5000 }, push: { STANDARD: 3000, LARGE: 4500 }, walk: 1000 };
  it("prices by size and plan; oversized is a quote", () => {
    expect(snowCharge(prices, false, "STANDARD", false)).toEqual({ base: 3500, walk: 0 });
    expect(snowCharge(prices, true, "LARGE", true)).toEqual({ base: 4500, walk: 1000 });
    expect(snowCharge(prices, true, "OVERSIZED", true)).toBeNull();
  });
  it("estimate shown to the client matches", () => {
    const b = { services: ["Snow shovelling"], plan: "Every snowfall", icemelt: true };
    expect(estimate(b)).toBe("$35 / snowfall");
    expect(estimate({ ...b, size: "Large", extraWalk: true })).toBe("$60 / snowfall");
    expect(estimate({ ...b, plan: "One-time visit", icemelt: false, size: "Large" })).toBe("$50");
    expect(estimate({ ...b, size: "Oversized" })).toBe("Quote");
  });
  it("validate: missing size = standard; bad size rejected; walk dropped for oversized", () => {
    const base = { name: "A B", email: "a@b.co", address: "1 Main St", payment: "Cash", plan: "One-time visit", services: ["Snow shovelling"] };
    expect(validate(base, "2026-12-01").size).toBe("Standard");
    expect(() => validate({ ...base, size: "Huge" }, "2026-12-01")).toThrow();
    expect(validate({ ...base, size: "Oversized", extraWalk: true }, "2026-12-01")).toMatchObject({ extraWalk: false, estimate: "Quote" });
    expect(validate({ ...base, services: ["Window cleaning"], size: "Large" }, "2026-12-01").size).toBe("");
  });
  it("reads the current charge off job lines", () => {
    expect(currentCharge([{ name: "Snow shovelling (one-time)", unitPriceCents: 3500 }, { name: "Ice melt", unitPriceCents: 500 }, { name: "Extra sidewalk (corner lot / long walk)", unitPriceCents: 1000 }])).toEqual({ base: 3500, walk: 1000 });
  });
  it("warns the crew only on unchecked snow stops", () => {
    expect(sizeNote(true, { sizeCheckedAt: null, driveSize: "LARGE" })).toMatch(/booked as large/);
    expect(sizeNote(true, { sizeCheckedAt: new Date(), driveSize: "LARGE" })).toBeNull();
    expect(sizeNote(false, { sizeCheckedAt: null, driveSize: null })).toBeNull();
  });
});
