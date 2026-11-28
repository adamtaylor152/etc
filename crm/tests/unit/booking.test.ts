// Parity with the Python site's validate()/estimate() (tests/test_server.py cases + the estimate table).
import { describe, expect, it } from "vitest";
import { BookingError, bookingLabels, estimate, reorderLabels, serviceLines, validate, whenText } from "@/server/booking/validate";

const TODAY = "2026-11-27";
const good = {
  name: "Test Neighbour", email: "test@example.com", address: "800 Macleod Trl SE, Calgary",
  services: ["Snow shovelling", "Window cleaning"], plan: "Every snowfall", icemelt: true,
  payment: "e-Transfer", notes: "line one\nline two",
};
// The price book as the route reads it: active + bookable rows; a blank booking label falls back to the name.
const LABELS = bookingLabels([{ name: "Snow shovelling (one-time)", bookingLabel: "Snow shovelling" }, { name: "Window cleaning", bookingLabel: null }]);
const bad = (patch: Record<string, unknown>) => () => validate({ ...good, ...patch }, TODAY, LABELS);

describe("validate (Python parity)", () => {
  it("accepts the good booking with the same estimate string", () => {
    const b = validate(good, TODAY, LABELS);
    expect(b.estimate).toBe("$35 / snowfall + quote");
    expect(b.notes).toBe("line one\nline two");
  });
  it.each([
    [{ email: "nope" }, "email doesn't look right"],
    [{ payment: "Bitcoin" }, "payment must be cash or e-Transfer"],
    [{ services: ["Hacking"] }, "pick at least one service"],
    [{ services: [] }, "pick at least one service"],
    [{ date: "2001-01-01" }, "date is in the past"],
    [{ date: "2026-02-30" }, "date doesn't look right"],
    [{ plan: "" }, "pick one-time or every snowfall"],
    [{ name: "" }, "name is required"],
    [{ name: 42 }, "name must be text"],
    [{ name: "x".repeat(101) }, "name is too long"],
  ])("rejects %j", (patch, msg) => {
    expect(bad(patch)).toThrow(BookingError);
    expect(bad(patch)).toThrow(msg);
  });
  it("allows yesterday (timezone slack) but not two days ago", () => {
    expect(validate({ ...good, date: "2026-11-26" }, TODAY, LABELS).date).toBe("2026-11-26");
    expect(bad({ date: "2026-11-25" })).toThrow("past");
  });
  it("collapses whitespace and strips control chars on single-line fields", () => {
    const b = validate({ ...good, name: "  Test \t\u0007 Neighbour  " }, TODAY, LABELS);
    expect(b.name).toBe("Test Neighbour");
  });
  it("drops plan and ice melt when there's no shovelling, dedupes services", () => {
    const b = validate({ ...good, services: ["Window cleaning", "Window cleaning"], plan: "Every snowfall", icemelt: true }, TODAY, LABELS);
    expect(b).toMatchObject({ plan: "", icemelt: false, services: ["Window cleaning"], estimate: "Quote" });
  });
  it("takes only labels from the price book, plus the catch-all", () => {
    expect(LABELS).toEqual(["Snow shovelling", "Window cleaning", "Something else"]);
    expect(bookingLabels([{ name: "A", bookingLabel: "Same" }, { name: "B", bookingLabel: "Same" }, { name: "Something else", bookingLabel: "" }])).toEqual(["Same", "Something else"]);
    expect(validate({ ...good, services: ["Something else"] }, TODAY, bookingLabels([])).services).toEqual(["Something else"]);
    expect(bad({ services: ["Window cleaning", "Bin cleaning"] })).toThrow("pick at least one service"); // not in this price book
    expect(() => validate(good, TODAY, bookingLabels([]))).toThrow("pick at least one service"); // archived / not bookable
  });
  it("only trusts lat/lng inside Calgary", () => {
    expect(validate({ ...good, lat: 50.91, lng: -114.11 }, TODAY, LABELS)).toMatchObject({ lat: 50.91, lng: -114.11 });
    expect(validate({ ...good, lat: 40.7, lng: -74 }, TODAY, LABELS)).toMatchObject({ lat: null, lng: null });
  });
});

describe("estimate", () => {
  it.each([
    [["Snow shovelling"], "One-time visit", false, "$35"],
    [["Snow shovelling"], "One-time visit", true, "$40"],
    [["Snow shovelling"], "Every snowfall", false, "$30 / snowfall"],
    [["Snow shovelling"], "Every snowfall", true, "$35 / snowfall"],
    [["Snow shovelling", "Fence repair"], "One-time visit", false, "$35 + quote"],
    [["Fence repair"], "", false, "Quote"],
  ])("%j %s icemelt=%s -> %s", (services, plan, icemelt, want) => {
    expect(estimate({ services, plan, icemelt })).toBe(want);
  });
  it("service lines and when text", () => {
    const b = { services: ["Snow shovelling", "Bin cleaning"], plan: "Every snowfall", icemelt: true, date: "" };
    expect(serviceLines(b)).toEqual(["Snow shovelling (Every snowfall, + ice melt)", "Bin cleaning"]);
    expect(whenText(b)).toBe("after every snowfall");
    expect(whenText({ date: "", plan: "One-time visit" })).toBe("as soon as possible");
  });
});

describe("reorderLabels (book this again)", () => {
  const book = [{ name: "Snow shovelling (one-time)", bookingLabel: "Snow shovelling" }, { name: "Window cleaning", bookingLabel: null }, { name: "Gutters (2 storey)", bookingLabel: "Gutter cleaning" }];
  it("uses what was booked, dropping services that can't be booked any more", () => {
    expect(reorderLabels({ requested: ["Window cleaning", "Bin cleaning"], lines: [], title: "x" }, book)).toEqual(["Window cleaning"]);
  });
  it("maps an owner-made job's line items to booking labels", () => {
    expect(reorderLabels({ requested: [], lines: ["Snow shovelling (one-time), large driveway", "Ice melt", "Gutters (2 storey)"], title: "Snow" }, book)).toEqual(["Snow shovelling", "Gutter cleaning"]);
  });
  it("falls back to the catch-all", () => {
    expect(reorderLabels({ requested: ["Something else"], lines: ["Fence repair"], title: "Fence repair" }, book)).toEqual(["Something else"]);
  });
});
