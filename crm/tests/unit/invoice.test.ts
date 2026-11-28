import { describe, expect, it } from "vitest";
import { billingEmail, draftEditProblem, dueDate, etransferRef, invoiceTotals, isCreditLine, invoiceView, reminderDue, statusAfterPayments } from "@/server/billing/invoice";

const NOT_REG = { taxRegistered: false, taxRateBps: 500, pricesIncludeTax: true };
describe("invoiceTotals", () => {
  it("not GST-registered: no tax, discount applied", () => {
    expect(invoiceTotals([3000, 500], 500, NOT_REG)).toEqual({ subtotalCents: 3500, discountCents: 500, taxCents: 0, totalCents: 3000, taxIncluded: false });
  });
  it("registered, tax-included prices: total unchanged, GST portion reported", () => {
    expect(invoiceTotals([10500], 0, { ...NOT_REG, taxRegistered: true })).toMatchObject({ totalCents: 10500, taxCents: 500, taxIncluded: true });
  });
  it("registered, tax on top", () => {
    expect(invoiceTotals([10000], 0, { taxRegistered: true, taxRateBps: 500, pricesIncludeTax: false })).toMatchObject({ totalCents: 10500, taxCents: 500 });
  });
  it("discount can't go negative", () => expect(invoiceTotals([1000], 5000, NOT_REG).totalCents).toBe(0));
});

describe("payments -> status", () => {
  it.each([
    ["AWAITING_PAYMENT", 3500, 3500, "PAID"],
    ["AWAITING_PAYMENT", 3500, 4000, "PAID"],
    ["AWAITING_PAYMENT", 3500, 1000, "AWAITING_PAYMENT"],
    ["DRAFT", 3500, 3500, "PAID"], // cash at the door pays a draft
    ["DRAFT", 3500, 0, "DRAFT"],
    ["PAID", 3500, 0, "AWAITING_PAYMENT"], // payment removed
    ["VOID", 3500, 3500, "VOID"],
    ["BAD_DEBT", 3500, 3500, "BAD_DEBT"],
  ] as const)("%s total %i paid %i -> %s", (s, t, p, want) => expect(statusAfterPayments(s, t, p)).toBe(want));
});

describe("invoiceView / reminders / terms", () => {
  const base = { status: "AWAITING_PAYMENT" as const, dueOn: "2026-12-01", totalCents: 3500, amountPaidCents: 0 };
  it("past due and partial are computed", () => {
    expect(invoiceView(base, "2026-12-01")).toBe("AWAITING_PAYMENT");
    expect(invoiceView(base, "2026-12-02")).toBe("PAST_DUE");
    expect(invoiceView({ ...base, amountPaidCents: 1000 }, "2026-11-30")).toBe("PARTIAL");
    expect(invoiceView({ ...base, status: "PAID" }, "2027-01-01")).toBe("PAID");
  });
  it("reminders at +3 and +10 days, max two", () => {
    expect(reminderDue({ ...base, remindersSent: 0 }, "2026-12-03")).toBeNull();
    expect(reminderDue({ ...base, remindersSent: 0 }, "2026-12-04")).toBe(1);
    expect(reminderDue({ ...base, remindersSent: 1 }, "2026-12-10")).toBeNull();
    expect(reminderDue({ ...base, remindersSent: 1 }, "2026-12-11")).toBe(2);
    expect(reminderDue({ ...base, remindersSent: 2 }, "2027-03-01")).toBeNull();
    expect(reminderDue({ ...base, status: "PAID", remindersSent: 0 }, "2027-03-01")).toBeNull();
  });
  it("due dates and e-Transfer reference", () => {
    expect(dueDate("2026-11-27", "DUE_ON_RECEIPT")).toBe("2026-11-27");
    expect(dueDate("2026-11-27", "NET_15")).toBe("2026-12-12");
    expect(etransferRef(1042)).toBe("ETC-1042");
  });
});

describe("billingEmail", () => {
  it("prefers a billing contact with an email, else the client", () => {
    expect(billingEmail("a@x.ca", [])).toBe("a@x.ca");
    expect(billingEmail("a@x.ca", [{ isBilling: true, email: null }, { isBilling: false, email: "c@x.ca" }])).toBe("a@x.ca");
    expect(billingEmail("a@x.ca", [{ isBilling: true, email: "pay@x.ca" }])).toBe("pay@x.ca");
  });
});

describe("draft editing", () => {
  it("credit lines are the negative ones", () => {
    expect([3500, 0, -1000].map((totalCents) => isCreditLine({ totalCents }))).toEqual([false, false, true]);
  });
  it.each([
    [[3500], 0, 0, 0, null],
    [[3500, 0], 1000, 2500, 0, null], // a comped ($0) line is fine; the discount may take the rest
    [[], 0, 0, 0, "Add at least one line"],
    [[3500], 0, -1, 0, "Check the amounts"],
    [[-100], 0, 0, 0, "Check the amounts"],
    [[900], 1000, 0, 0, "The lines can't total less than the deposit or credit already applied to this invoice"],
    [[3500], 1000, 2501, 0, "The discount is more than the invoice"],
    [[3500], 0, 1000, 2500, null], // part-paid draft: the new total equals what's paid
    [[3500], 0, 1001, 2500, "The total can't be less than what's already been paid"],
  ] as const)("lines %j credit %i discount %i paid %i -> %s", (lines, credit, discount, paid, want) =>
    expect(draftEditProblem([...lines], credit, discount, paid, NOT_REG)).toBe(want));
  it("tax on top counts toward what's been paid", () =>
    expect(draftEditProblem([10000], 0, 0, 10500, { taxRegistered: true, taxRateBps: 500, pricesIncludeTax: false })).toBeNull());
});

import { lateFeeDue } from "@/server/billing/invoice";
describe("lateFeeDue", () => {
  const s = { lateFee: true, lateFeeDays: 14, lateFeeCents: 1000, lateFeeBps: 200 };
  const inv = { status: "AWAITING_PAYMENT" as const, kind: "STANDARD", dueOn: "2026-12-01", totalCents: 20000, amountPaidCents: 5000, lateFeeAppliedAt: null };
  it("is the flat fee plus a share of what is owing, from the grace day on", () => {
    expect(lateFeeDue(inv, "2026-12-14", s)).toBe(0);
    expect(lateFeeDue(inv, "2026-12-15", s)).toBe(1000 + 300); // 2% of the $150 still owing
    expect(lateFeeDue(inv, "2026-12-22", s)).toBe(1300); // still inside the week after it fell due
    expect(lateFeeDue(inv, "2026-12-23", s)).toBe(0); // old backlog: switching the rule on doesn't fee it
  });
  it("is never added twice, to deposits, to paid or draft invoices, or when switched off", () => {
    const day = "2026-12-16";
    expect(lateFeeDue({ ...inv, lateFeeAppliedAt: new Date() }, day, s)).toBe(0);
    expect(lateFeeDue({ ...inv, kind: "DEPOSIT" }, day, s)).toBe(0);
    expect(lateFeeDue({ ...inv, status: "PAID" }, day, s)).toBe(0);
    expect(lateFeeDue({ ...inv, status: "DRAFT" }, day, s)).toBe(0);
    expect(lateFeeDue({ ...inv, dueOn: null }, day, s)).toBe(0);
    expect(lateFeeDue(inv, day, { ...s, lateFee: false })).toBe(0);
  });
});

import { invoiceTotalsWithCredits } from "@/server/billing/invoice";
describe("invoiceTotalsWithCredits", () => {
  const onTop = { taxRegistered: true, taxRateBps: 500, pricesIncludeTax: false };
  it("charges GST on the work, then takes the deposit off the total", () => {
    // $1,000 job + $50 GST, $525 deposit already paid: $525 still to pay, and the whole $50 of GST is on this invoice.
    expect(invoiceTotalsWithCredits([100000], 52500, 0, onTop)).toMatchObject({ taxCents: 5000, totalCents: 52500, subtotalCents: 47500 });
  });
  it("is the plain total when nothing was prepaid, and never goes below zero", () => {
    expect(invoiceTotalsWithCredits([3000], 0, 0, NOT_REG).totalCents).toBe(3000);
    expect(invoiceTotalsWithCredits([3000], 3000, 0, NOT_REG).totalCents).toBe(0);
    expect(invoiceTotalsWithCredits([3000], 9999, 0, NOT_REG).totalCents).toBe(0);
  });
  it("applies a discount before tax and credits after", () => {
    expect(invoiceTotalsWithCredits([100000], 10000, 10000, onTop)).toMatchObject({ taxCents: 4500, totalCents: 84500 });
  });
});
