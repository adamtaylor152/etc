import { describe, expect, it } from "vitest";
import { describeRule, fromRRule, lastRecurrenceDate, outsidePause, recurrenceDates, toRRule, type Repeat } from "@/server/recurrence";

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
  it("rules stored before the options existed keep their meaning", () => {
    expect(recurrenceDates("DTSTART:20270503T000000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20270531T000000Z", "2027-05-01", "2027-06-30"))
      .toEqual(["2027-05-03", "2027-05-06", "2027-05-17", "2027-05-20", "2027-05-31"]);
    expect(recurrenceDates("DTSTART:20270401T000000Z\nRRULE:FREQ=MONTHLY;BYDAY=+1SA", "2027-04-01", "2027-06-30")).toEqual(["2027-04-03", "2027-05-01", "2027-06-05"]);
    expect(toRRule({ freq: "BIWEEKLY", byDay: [0, 3], startsOn: "2027-05-03", endsOn: "2027-05-31" })).toBe("DTSTART:20270503T000000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20270531T000000Z");
  });
  it("every 3 weeks on Monday and Friday", () => {
    const r = toRRule({ freq: "WEEKLY", interval: 3, byDay: [0, 4], startsOn: "2027-05-03", endsOn: null });
    expect(recurrenceDates(r, "2027-05-01", "2027-06-20")).toEqual(["2027-05-03", "2027-05-07", "2027-05-24", "2027-05-28", "2027-06-14", "2027-06-18"]);
  });
  it("every 2 months on the 15th, and monthly on the last day", () => {
    const r = toRRule({ freq: "MONTHLY", interval: 2, byDay: [], monthDay: 15, startsOn: "2027-01-01", endsOn: null });
    expect(recurrenceDates(r, "2027-01-01", "2027-06-30")).toEqual(["2027-01-15", "2027-03-15", "2027-05-15"]);
    const last = toRRule({ freq: "MONTHLY", byDay: [], monthDay: -1, startsOn: "2027-01-01", endsOn: null });
    expect(recurrenceDates(last, "2027-01-01", "2027-04-30")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
  it("monthly on the third Wednesday and on the last Friday", () => {
    const third = toRRule({ freq: "MONTHLY", byDay: [2], nth: 3, startsOn: "2027-04-01", endsOn: null });
    expect(recurrenceDates(third, "2027-04-01", "2027-06-30")).toEqual(["2027-04-21", "2027-05-19", "2027-06-16"]);
    const lastFri = toRRule({ freq: "MONTHLY", byDay: [4], nth: -1, startsOn: "2027-04-01", endsOn: null });
    expect(recurrenceDates(lastFri, "2027-04-01", "2027-06-30")).toEqual(["2027-04-30", "2027-05-28", "2027-06-25"]);
  });
  it("ends after N visits, counted from the start whatever window is asked for", () => {
    const r = toRRule({ freq: "WEEKLY", byDay: [1], startsOn: "2027-04-01", endsOn: null, count: 3 });
    expect(recurrenceDates(r, "2027-04-01", "2027-12-31")).toEqual(["2027-04-06", "2027-04-13", "2027-04-20"]);
    expect(recurrenceDates(r, "2027-04-14", "2027-12-31")).toEqual(["2027-04-20"]);
    expect(lastRecurrenceDate(r)).toBe("2027-04-20");
    expect(lastRecurrenceDate(toRRule({ freq: "WEEKLY", byDay: [1], startsOn: "2027-04-01", endsOn: "2027-04-15" }))).toBe("2027-04-13");
    expect(lastRecurrenceDate(toRRule({ freq: "WEEKLY", byDay: [1], startsOn: "2027-04-01", endsOn: null }))).toBeNull();
  });
  it("reads a rule back for the edit form", () => {
    const back = (r: Repeat) => fromRRule(toRRule(r));
    expect(back({ freq: "WEEKLY", interval: 3, byDay: [0, 4], startsOn: "2027-05-03", endsOn: "2027-09-01" })).toEqual({ freq: "WEEKLY", interval: 3, byDay: [0, 4], monthDay: null, nth: null, startsOn: "2027-05-03", endsOn: "2027-09-01", count: null });
    expect(back({ freq: "BIWEEKLY", byDay: [1], startsOn: "2027-05-03", endsOn: null })).toMatchObject({ freq: "WEEKLY", interval: 2, byDay: [1] });
    expect(back({ freq: "MONTHLY", byDay: [4], nth: -1, startsOn: "2027-04-01", endsOn: null, count: 6 })).toMatchObject({ freq: "MONTHLY", byDay: [4], nth: -1, monthDay: null, count: 6, endsOn: null });
    expect(back({ freq: "MONTHLY", byDay: [], monthDay: 15, startsOn: "2027-04-01", endsOn: null })).toMatchObject({ freq: "MONTHLY", byDay: [], monthDay: 15, nth: null });
    expect(back({ freq: "MONTHLY", byDay: [5], startsOn: "2027-04-01", endsOn: null })).toMatchObject({ byDay: [5], nth: 1 }); // the old "first chosen weekday"
    expect(fromRRule("nonsense")).toBeNull();
  });
  it("a pause drops the dates inside it, both ends included", () => {
    const dates = ["2027-04-06", "2027-04-13", "2027-04-20", "2027-04-27"];
    expect(outsidePause(dates, "2027-04-13", "2027-04-20")).toEqual(["2027-04-06", "2027-04-27"]);
    expect(outsidePause(dates, null, null)).toEqual(dates);
  });
  it("describes rules for humans", () => {
    expect(describeRule(toRRule({ freq: "MONTHLY", byDay: [2], nth: 3, startsOn: "2027-04-01", endsOn: null, count: 5 }))).toBe("Every month on the 3rd Wednesday for 5 times");
    expect(describeRule(toRRule({ freq: "WEEKLY", byDay: [1], startsOn: "2027-04-01", endsOn: null }))).toMatch(/^Every week on Tuesday/);
    expect(describeRule(null)).toBe("As needed");
  });
});
