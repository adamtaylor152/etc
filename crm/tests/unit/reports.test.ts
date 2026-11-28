import { describe, expect, it } from "vitest";
import { ageBucket, parseRange, totals } from "@/server/reports";

describe("parseRange", () => {
  const t = "2026-03-15";
  it("defaults to this year, and knows the presets", () => {
    expect(parseRange({}, t)).toEqual({ from: "2026-01-01", to: t, preset: "year" });
    expect(parseRange({ range: "month" }, t)).toMatchObject({ from: "2026-03-01", to: t });
    expect(parseRange({ range: "last-month" }, t)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(parseRange({ range: "last-month" }, "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(parseRange({ range: "12m" }, t)).toMatchObject({ from: "2025-03-16", to: t });
  });
  it("takes explicit dates and ignores bad ones", () => {
    expect(parseRange({ from: "2026-01-05", to: "2026-01-09" }, t)).toEqual({ from: "2026-01-05", to: "2026-01-09", preset: "custom" });
    expect(parseRange({ from: "2026-02-05", to: "2026-01-09" }, t).preset).toBe("year");
    expect(parseRange({ from: "nope", to: "2026-01-09" }, t).preset).toBe("year");
  });
});

describe("ageBucket", () => {
  it("buckets by days past due", () => {
    const t = "2026-06-30";
    expect([null, "2026-06-30", "2026-06-29", "2026-05-31", "2026-05-30", "2026-04-01", "2026-03-31"].map((d) => ageBucket(d, t))).toEqual([0, 0, 1, 1, 2, 3, 4]);
  });
});

describe("totals", () => {
  it("sums money and number columns only", () => {
    expect(totals({ columns: [["A", "text"], ["B", "money"], ["C", "num"]], rows: [["x", 100, 1], ["y", 250, null]] })).toEqual([null, 350, 1]);
  });
});
