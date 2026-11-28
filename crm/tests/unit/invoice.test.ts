import { describe, expect, it } from "vitest";
import { billingEmail, dueDate, etransferRef, invoiceTotals, invoiceView, reminderDue, statusAfterPayments } from "@/server/billing/invoice";

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
