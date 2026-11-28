import { describe, expect, it } from "vitest";
import { assertQuoteTransition, quoteEditable, quoteExpired, quoteTotal, quoteTotals } from "@/server/status/quote";

describe("quote transitions", () => {
  it("allows the normal flow", () => {
    expect(() => assertQuoteTransition("DRAFT", "AWAITING_RESPONSE")).not.toThrow();
    expect(() => assertQuoteTransition("AWAITING_RESPONSE", "CHANGES_REQUESTED")).not.toThrow();
    expect(() => assertQuoteTransition("CHANGES_REQUESTED", "AWAITING_RESPONSE")).not.toThrow();
    expect(() => assertQuoteTransition("AWAITING_RESPONSE", "APPROVED")).not.toThrow();
    expect(() => assertQuoteTransition("APPROVED", "CONVERTED")).not.toThrow();
  });
  it("never goes back to draft, and converted/archived are final", () => {
    for (const from of ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED", "ARCHIVED"] as const) {
      expect(() => assertQuoteTransition(from, "DRAFT")).toThrow();
    }
    expect(() => assertQuoteTransition("CONVERTED", "ARCHIVED")).toThrow();
    expect(() => assertQuoteTransition("ARCHIVED", "APPROVED")).toThrow();
    expect(() => assertQuoteTransition("DRAFT", "APPROVED")).toThrow(); // must be sent first
  });
  it("editable only as draft or after changes were requested", () => {
    expect(quoteEditable("DRAFT")).toBe(true);
    expect(quoteEditable("CHANGES_REQUESTED")).toBe(true);
    expect(quoteEditable("AWAITING_RESPONSE")).toBe(false);
    expect(quoteEditable("APPROVED")).toBe(false);
  });
});

describe("quote money", () => {
  const lines = [
    { totalCents: 12000, isOptional: false, isSelected: true },
    { totalCents: 4000, isOptional: true, isSelected: false },
    { totalCents: 2500, isOptional: true, isSelected: true },
  ];
  it("counts required + selected optional lines, minus discount", () => {
    expect(quoteTotal(lines)).toBe(14500);
    expect(quoteTotal(lines, 500)).toBe(14000);
    expect(quoteTotal(lines, 99999)).toBe(0);
  });
  it("applies GST the way invoices do", () => {
    const reg = { taxRegistered: true, taxRateBps: 500, pricesIncludeTax: false };
    // not registered: no tax; optional unticked line is left out
    expect(quoteTotals(lines, 500, { ...reg, taxRegistered: false })).toMatchObject({ subtotalCents: 14500, taxCents: 0, totalCents: 14000 });
    // registered, GST on top: 5% of the discounted amount
    expect(quoteTotals(lines, 500, reg)).toMatchObject({ subtotalCents: 14500, taxCents: 700, totalCents: 14700 });
    // registered, prices include GST: total unchanged, GST is the portion inside it
    expect(quoteTotals(lines, 500, { ...reg, pricesIncludeTax: true })).toMatchObject({ taxCents: 667, totalCents: 14000 });
  });
  it("expires after valid-until while awaiting a response", () => {
    expect(quoteExpired({ status: "AWAITING_RESPONSE", validUntil: "2026-12-01" }, "2026-12-02")).toBe(true);
    expect(quoteExpired({ status: "AWAITING_RESPONSE", validUntil: "2026-12-01" }, "2026-12-01")).toBe(false);
    expect(quoteExpired({ status: "APPROVED", validUntil: "2026-12-01" }, "2027-01-01")).toBe(false);
  });
});
