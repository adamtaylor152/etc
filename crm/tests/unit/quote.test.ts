import { describe, expect, it } from "vitest";
import { assertQuoteTransition, followUpDue, optionLines, optionTotal, quoteDiscountCents, quoteEditable, quoteExpired, quoteOptions, quoteTotal, quoteTotals, valuedOption } from "@/server/status/quote";

describe("quote transitions", () => {
  it("allows the normal flow", () => {
    expect(() => assertQuoteTransition("DRAFT", "AWAITING_RESPONSE")).not.toThrow();
    expect(() => assertQuoteTransition("AWAITING_RESPONSE", "CHANGES_REQUESTED")).not.toThrow();
    expect(() => assertQuoteTransition("CHANGES_REQUESTED", "AWAITING_RESPONSE")).not.toThrow();
    expect(() => assertQuoteTransition("AWAITING_RESPONSE", "APPROVED")).not.toThrow();
    expect(() => assertQuoteTransition("APPROVED", "CONVERTED")).not.toThrow();
  });
  it("never goes back to draft, and converted/archived are final", () => {
    for (const from of ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED", "ARCHIVED"] as const) { // DECLINED is the one exception (below)
      expect(() => assertQuoteTransition(from, "DRAFT")).toThrow();
    }
    expect(() => assertQuoteTransition("CONVERTED", "ARCHIVED")).toThrow();
    expect(() => assertQuoteTransition("ARCHIVED", "APPROVED")).toThrow();
    expect(() => assertQuoteTransition("DRAFT", "APPROVED")).toThrow(); // must be sent first
  });
  it("can be declined while it waits on the client; only a declined quote reopens to draft", () => {
    expect(() => assertQuoteTransition("AWAITING_RESPONSE", "DECLINED")).not.toThrow();
    expect(() => assertQuoteTransition("CHANGES_REQUESTED", "DECLINED")).not.toThrow();
    expect(() => assertQuoteTransition("DECLINED", "DRAFT")).not.toThrow();
    expect(() => assertQuoteTransition("DECLINED", "ARCHIVED")).not.toThrow();
    for (const from of ["DRAFT", "APPROVED", "CONVERTED", "ARCHIVED"] as const) expect(() => assertQuoteTransition(from, "DECLINED")).toThrow();
    expect(() => assertQuoteTransition("DECLINED", "APPROVED")).toThrow();
    expect(() => assertQuoteTransition("DECLINED", "AWAITING_RESPONSE")).toThrow(); // reopen, then send
    expect(quoteEditable("DECLINED")).toBe(false);
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
  it("percent discounts follow the ticked lines; dollar discounts stay put", () => {
    const pct = { discountType: "PERCENT", discountValue: 1000, discountCents: 0 }; // 10%
    expect(quoteDiscountCents(lines, pct)).toBe(1450);
    expect(quoteDiscountCents(lines.map((l) => ({ ...l, isSelected: true })), pct)).toBe(1850); // client ticks the $40 extra
    expect(quoteDiscountCents(lines, { ...pct, discountValue: 1250 })).toBe(1813); // 12.5% of 145.00, rounded
    expect(quoteDiscountCents(lines, { ...pct, discountValue: 99_999 })).toBe(14500); // never more than 100%
    expect(quoteDiscountCents(lines, { discountType: "FIXED", discountValue: 500, discountCents: 500 })).toBe(500);
    expect(quoteTotal(lines, quoteDiscountCents(lines, pct))).toBe(13050);
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
  describe("option sets", () => {
    const none = { discountType: "FIXED", discountValue: 0, discountCents: 0 };
    const pct = { discountType: "PERCENT", discountValue: 1000, discountCents: 0 }; // 10%
    const opts = [{ key: "a", name: "Basic", recommended: false }, { key: "b", name: "Full", recommended: false }, { key: "c", name: "Full + wash", recommended: false }];
    const set = [
      { totalCents: 2000, isOptional: false, isSelected: true }, // common: dump fee
      { totalCents: 16000, isOptional: false, isSelected: true, optionKey: "a" },
      { totalCents: 30000, isOptional: false, isSelected: true, optionKey: "b" },
      { totalCents: 30000, isOptional: false, isSelected: true, optionKey: "c" },
      { totalCents: 13000, isOptional: false, isSelected: true, optionKey: "c" },
      { totalCents: 5000, isOptional: true, isSelected: false, optionKey: "b" }, // extra offered only with "Full"
    ];
    it("without options every line counts, exactly as before", () => {
      for (const key of [null, undefined, "a"]) expect(optionLines(lines, key)).toEqual(lines);
      expect(quoteTotal(optionLines(lines, null), 500)).toBe(quoteTotal(lines, 500));
      expect(valuedOption([], lines, none)).toBeNull();
      expect(quoteOptions([])).toEqual([]);
      expect(quoteOptions(null)).toEqual([]);
      expect(quoteOptions("nope")).toEqual([]);
      expect(quoteOptions([{ key: "a", name: "Basic", recommended: true }, { key: 1 }, null])).toEqual([{ key: "a", name: "Basic", recommended: true }]);
    });
    it("an option's total is its own lines plus the common ones", () => {
      expect(optionTotal(set, none, "a")).toBe(18000);
      expect(optionTotal(set, none, "b")).toBe(32000);
      expect(optionTotal(set, none, "c")).toBe(45000);
      expect(optionLines(set, null)).toHaveLength(1); // nothing chosen yet: just the common line
    });
    it("ticked extras, percent discounts and GST follow the chosen option", () => {
      const ticked = set.map((l) => ({ ...l, isSelected: true }));
      expect(optionTotal(ticked, none, "b")).toBe(37000);
      expect(optionTotal(ticked, none, "a")).toBe(18000); // the extra belongs to another option
      expect(optionTotal(set, pct, "a")).toBe(16200);
      expect(optionTotal(set, pct, "c")).toBe(40500);
      const c = optionLines(set, "c");
      expect(quoteTotals(c, quoteDiscountCents(c, pct), { taxRegistered: true, taxRateBps: 500, pricesIncludeTax: false })).toMatchObject({ subtotalCents: 45000, taxCents: 2025, totalCents: 42525 });
    });
    it("is valued at the chosen option, else the recommended one, else the cheapest", () => {
      expect(valuedOption(opts, set, none)).toBe("a");
      expect(valuedOption([opts[2], opts[1], opts[0]], set, none)).toBe("a"); // cheapest, whatever the order
      expect(valuedOption(opts.map((o) => ({ ...o, recommended: o.key === "b" })), set, none)).toBe("b");
      expect(valuedOption(opts.map((o) => ({ ...o, recommended: o.key === "b" })), set, none, "c")).toBe("c");
      expect(valuedOption(opts, set, none, "gone")).toBe("a"); // an unknown key is ignored
    });
  });
  it("expires after valid-until while awaiting a response", () => {
    expect(quoteExpired({ status: "AWAITING_RESPONSE", validUntil: "2026-12-01" }, "2026-12-02")).toBe(true);
    expect(quoteExpired({ status: "AWAITING_RESPONSE", validUntil: "2026-12-01" }, "2026-12-01")).toBe(false);
    expect(quoteExpired({ status: "APPROVED", validUntil: "2026-12-01" }, "2027-01-01")).toBe(false);
  });
  it("follow-ups: a step once it is due, only while waiting and not expired", () => {
    const steps = [{ on: true, days: 3 }, { on: true, days: 7 }];
    const sent = (daysAgo: number) => new Date(Date.UTC(2026, 11, 20) - daysAgo * 86_400_000);
    const q = (daysAgo: number, over: object = {}) => ({ status: "AWAITING_RESPONSE" as const, validUntil: "2026-12-31", sentAt: sent(daysAgo), ...over });
    const now = new Date(Date.UTC(2026, 11, 20));
    expect(followUpDue(q(2), steps, now, "2026-12-20")).toBeNull();
    expect(followUpDue(q(3), steps, now, "2026-12-20")).toBe(1);
    expect(followUpDue(q(7.5), steps, now, "2026-12-20")).toBe(2);
    expect(followUpDue(q(40), steps, now, "2026-12-20")).toBeNull(); // switched on late: old quotes are left alone
    expect(followUpDue(q(3), [{ on: false, days: 3 }, { on: true, days: 3 }], now, "2026-12-20")).toBe(2);
    expect(followUpDue(q(4), [{ on: true, days: 3 }, { on: true, days: 4 }], now, "2026-12-20")).toBe(2); // both due: just the later one
    expect(followUpDue(q(3), [{ on: false, days: 3 }, { on: false, days: 7 }], now, "2026-12-20")).toBeNull();
    for (const status of ["APPROVED", "DECLINED", "CHANGES_REQUESTED", "CONVERTED", "ARCHIVED", "DRAFT"] as const) expect(followUpDue(q(3, { status }), steps, now, "2026-12-20")).toBeNull();
    expect(followUpDue(q(3, { validUntil: "2026-12-19" }), steps, now, "2026-12-20")).toBeNull(); // expired
    expect(followUpDue(q(3, { sentAt: null }), steps, now, "2026-12-20")).toBeNull();
  });
});
