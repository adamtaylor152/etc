import { describe, expect, it } from "vitest";
import { describeRule, recurrenceDates, toRRule } from "@/server/recurrence";

describe("recurrence", () => {
  it("weekly on Tuesdays", () => {
    const r = toRRule({ freq: "WEEKLY", byDay: [1], startsOn: "2027-04-01", endsOn: null });
    expect(recurrenceDates(r, "2027-04-01", "2027-04-30")).toEqual(["2027-04-06", "2027-04-13", "2027-04-20", "2027-04-27"]);
  });
  it("every two weeks on Monday and Thursday, with an end date", () => {
    const r = toRRule({ freq: "BIWEEKLY", byDay: [0, 3], startsOn: "2027-05-03", endsOn: "2027-05-31" });
    expect(recurrenceDates(r, "2027-05-01", "2027-06-30")).toEqual(["2027-05-03", "2027-05-06", "2027-05-17", "2027-05-20", "2027-05-31"]);
  });
  it("monthly on the first Saturday", () => {
    const r = toRRule({ freq: "MONTHLY", byDay: [5], startsOn: "2027-04-01", endsOn: null });
    expect(recurrenceDates(r, "2027-04-01", "2027-06-30")).toEqual(["2027-04-03", "2027-05-01", "2027-06-05"]);
  });
  it("monthly on the start date's day when no weekday is picked", () => {
    const r = toRRule({ freq: "MONTHLY", byDay: [], startsOn: "2027-04-15", endsOn: null });
    expect(recurrenceDates(r, "2027-04-01", "2027-06-30")).toEqual(["2027-04-15", "2027-05-15", "2027-06-15"]);
  });
  it("is stable across DST and re-runs give the same dates", () => {
    const r = toRRule({ freq: "WEEKLY", byDay: [6], startsOn: "2027-03-01", endsOn: null });
    const a = recurrenceDates(r, "2027-03-01", "2027-03-31");
    expect(a).toEqual(["2027-03-07", "2027-03-14", "2027-03-21", "2027-03-28"]);
    expect(recurrenceDates(r, "2027-03-01", "2027-03-31")).toEqual(a);
  });
  it("describes rules for humans", () => {
    expect(describeRule(toRRule({ freq: "WEEKLY", byDay: [1], startsOn: "2027-04-01", endsOn: null }))).toMatch(/^Every week on Tuesday/);
    expect(describeRule(null)).toBe("As needed");
  });
});
