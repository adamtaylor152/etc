import { describe, expect, it } from "vitest";
import { bylawStatus } from "@/server/snow/bylaw";

const at = (h: number) => new Date(Date.UTC(2026, 10, 28, h));
describe("bylawStatus", () => {
  it("is null until the snow has stopped", () => expect(bylawStatus(null, [])).toBeNull());
  it("counts down 24 hours from when the snow stopped", () => {
    const s = bylawStatus(at(6), [{ state: "SCHEDULED", completedAt: null }, { state: "COMPLETED", completedAt: at(9) }], at(10))!;
    expect(s.deadline).toEqual(at(30));
    expect(s).toMatchObject({ open: 1, onTime: 1, late: 0, hoursLeft: 20, level: "running" });
  });
  it("warns in the last 6 hours and after the deadline while stops remain", () => {
    const open = [{ state: "EN_ROUTE", completedAt: null }];
    expect(bylawStatus(at(6), open, at(25))!.level).toBe("soon");
    expect(bylawStatus(at(6), open, at(31))!.level).toBe("over");
  });
  it("is ok once nothing is left, and counts stops cleared late", () => {
    const s = bylawStatus(at(6), [{ state: "COMPLETED", completedAt: at(31) }, { state: "SKIPPED", completedAt: null }], at(40))!;
    expect(s).toMatchObject({ open: 0, onTime: 0, late: 1, level: "ok" });
  });
});
