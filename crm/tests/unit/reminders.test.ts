import { describe, expect, it } from "vitest";
import { dayWord } from "@/server/dates";
import { isConfirm } from "@/server/ops/texts";
import { reminderDates } from "@/server/scheduler";
import { SettingsSchema } from "@/server/settings";
import { windowHint, WINDOWS } from "@/server/windows";

describe("reminderDates", () => {
  const s = { visitReminders: true, reminderDaysBefore: 2, reminderHour: 17, reminderMorningOf: true };
  it("sends ahead at the chosen hour and on the morning of", () => {
    expect(reminderDates("2026-12-01", 17, s)).toEqual(["2026-12-03"]);
    expect(reminderDates("2026-12-01", 7, s)).toEqual(["2026-12-01"]);
    expect(reminderDates("2026-12-01", 12, s)).toEqual([]);
    expect(reminderDates("2026-12-01", 7, { ...s, reminderMorningOf: false })).toEqual([]);
    expect(reminderDates("2026-12-01", 17, { ...s, visitReminders: false })).toEqual([]);
  });
  it("both fire when the chosen hour is 7 am", () => expect(reminderDates("2026-12-01", 7, { ...s, reminderHour: 7 })).toEqual(["2026-12-03", "2026-12-01"]));
});

describe("dayWord", () => {
  it("names the day the way a person would", () => {
    expect(dayWord("2026-12-01", "2026-12-01")).toBe("today");
    expect(dayWord("2026-12-02", "2026-12-01")).toBe("tomorrow");
    expect(dayWord("2026-12-03", "2026-12-01")).toBe("on Thursday, Dec 3");
  });
});

describe("isConfirm", () => {
  it("takes a one-word yes, nothing longer", () => {
    expect(["yes", " Y ", "C", "Confirm", "YES!", "confirmed."].every(isConfirm)).toBe(true);
    expect(["yes please move it to Friday", "no", "ok", "stop", ""].some(isConfirm)).toBe(false);
  });
});

describe("arrival windows", () => {
  it("default to the four standard windows and describe themselves", () => {
    expect(SettingsSchema.parse({}).arrivalWindows).toEqual(WINDOWS);
    expect(WINDOWS.map(windowHint)).toEqual(["3–6 a.m.", "6–11 a.m.", "10 a.m.–5 p.m.", "5–10 p.m."]);
    expect(windowHint({ from: "08:30", to: "12:00" })).toBe("8:30 a.m.–12 p.m.");
  });
  it("reject a window that ends before it starts", () => {
    expect(SettingsSchema.safeParse({ arrivalWindows: [{ key: "x", label: "X", from: "12:00", to: "09:00" }] }).success).toBe(false);
  });
});
