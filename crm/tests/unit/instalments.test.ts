import { describe, expect, it } from "vitest";
import { instalmentKey, instalmentSchedule, maxInstalments, planBillingLocked, seasonalTermsError, splitCents } from "@/server/billing/instalments";
import { invoiceTotals } from "@/server/billing/invoice";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("splitCents", () => {
  it("splits evenly when it divides", () => expect(splitCents(60000, 5)).toEqual([12000, 12000, 12000, 12000, 12000]));
  it("puts leftover cents on the earliest instalments and always sums exactly", () => {
    expect(splitCents(50000, 3)).toEqual([16667, 16667, 16666]);
    expect(splitCents(10, 4)).toEqual([3, 3, 2, 2]);
    for (const total of [1, 99, 45000, 59999, 100001]) for (const n of [1, 2, 3, 5, 7]) expect(sum(splitCents(total, n))).toBe(total);
  });
  it("one instalment is the whole price", () => expect(splitCents(45000, 1)).toEqual([45000]));
});

describe("instalmentSchedule", () => {
  it("pay in full: one instalment on the first due date", () => {
    expect(instalmentSchedule(45000, 1, "2026-11-28")).toEqual([{ n: 1, dueOn: "2026-11-28", amountCents: 45000 }]);
  });
  it("monthly: first on the start date, the rest on the 1st of each following month, across the year end", () => {
    expect(instalmentSchedule(50000, 5, "2026-11-15")).toEqual([
      { n: 1, dueOn: "2026-11-15", amountCents: 10000 }, { n: 2, dueOn: "2026-12-01", amountCents: 10000 },
      { n: 3, dueOn: "2027-01-01", amountCents: 10000 }, { n: 4, dueOn: "2027-02-01", amountCents: 10000 },
      { n: 5, dueOn: "2027-03-01", amountCents: 10000 },
    ]);
  });
  it("amounts sum to the season price", () => expect(sum(instalmentSchedule(59999, 7, "2026-10-01").map((i) => i.amountCents))).toBe(59999));
});

describe("seasonal terms", () => {
  it("one instalment per month from the first due month to the season's last month", () => {
    expect(maxInstalments("2026-10-01", "2027-04-30")).toBe(7);
    expect(maxInstalments("2026-11-28", "2027-04-30")).toBe(6);
    expect(maxInstalments("2027-04-30", "2027-04-30")).toBe(1);
    expect(maxInstalments("2027-05-01", "2027-04-30")).toBe(0);
  });
  it("accepts terms that fit and says why others don't", () => {
    const ok = { priceCents: 50000, count: 5, firstDueOn: "2026-11-01", seasonEndsOn: "2027-04-30" };
    expect(seasonalTermsError(ok)).toBeNull();
    expect(seasonalTermsError({ ...ok, priceCents: null })).toMatch(/season price/);
    expect(seasonalTermsError({ ...ok, priceCents: 0 })).toMatch(/season price/);
    expect(seasonalTermsError({ ...ok, count: 7 })).toMatch(/Only 6 monthly instalments/);
    expect(seasonalTermsError({ ...ok, count: 0 })).toMatch(/how many/);
    expect(seasonalTermsError({ ...ok, firstDueOn: "2027-05-02" })).toMatch(/before the season ends/);
  });
});

describe("plan billing lock / dedupe key", () => {
  it("billing can change only before any visit charge or instalment invoice", () => {
    expect(planBillingLocked({ visitCharges: 0, instalmentInvoices: 0 })).toBe(false);
    expect(planBillingLocked({ visitCharges: 1, instalmentInvoices: 0 })).toBe(true);
    expect(planBillingLocked({ visitCharges: 0, instalmentInvoices: 1 })).toBe(true);
  });
  it("one key per plan instalment", () => expect(instalmentKey("job1", 2)).toBe("job1:2"));
});

describe("instalment invoices follow the normal GST rules", () => {
  // Each instalment is a one-line invoice through invoiceTotals, like every other invoice.
  const amounts = instalmentSchedule(52500, 5, "2026-11-01").map((i) => i.amountCents);
  it("not registered: no tax, totals add up to the season price", () => {
    expect(sum(amounts.map((a) => invoiceTotals([a], 0, { taxRegistered: false, taxRateBps: 500, pricesIncludeTax: true }).totalCents))).toBe(52500);
  });
  it("registered, tax-included: totals still add up to the season price, GST reported inside", () => {
    const t = amounts.map((a) => invoiceTotals([a], 0, { taxRegistered: true, taxRateBps: 500, pricesIncludeTax: true }));
    expect(sum(t.map((x) => x.totalCents))).toBe(52500);
    expect(t[0].taxCents).toBe(500);
  });
});
