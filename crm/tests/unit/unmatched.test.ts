import { describe, expect, it } from "vitest";
import { suggestInvoices, validateAllocations, type OpenInvoice } from "@/server/billing/unmatched";

const inv = (number: number, balanceCents: number, clientName: string, email = "x@example.com"): OpenInvoice =>
  ({ id: `i${number}`, number, etransferRef: `ETC-${number}`, balanceCents, clientName, email, issuedOn: "2026-12-01" });
const open = [inv(10, 3500, "Jane Smith", "jane@example.com"), inv(11, 3500, "Sam Lee"), inv(12, 6000, "Robert Smith"), inv(13, 18750, "Fence Fan")];

describe("suggestInvoices", () => {
  it("a spouse paying (different first name, same last name, same amount) ranks first", () => {
    const s = suggestInvoices({ amountCents: 3500, sender: "MARK SMITH", message: null }, open);
    expect(s[0].invoice.number).toBe(10);
    expect(s[0].reasons).toEqual(expect.arrayContaining(["same amount", "same last name"]));
  });
  it("an invoice number in the message counts", () => {
    expect(suggestInvoices({ amountCents: 5000, sender: "ACME HOLDINGS", message: "for invoice 12 thanks" }, open)[0].invoice.number).toBe(12);
  });
  it("the client's email in the message counts", () => {
    expect(suggestInvoices({ amountCents: 1000, sender: "XYZ", message: "from jane@example.com" }, open)[0].invoice.number).toBe(10);
  });
  it("returns nothing when there's no signal at all", () => {
    expect(suggestInvoices({ amountCents: 999, sender: "NOBODY", message: "hi" }, [inv(20, 5000, "Pat Q")])).toEqual([]);
  });
});

describe("validateAllocations", () => {
  const balances = new Map([["a", 3500], ["b", 6000]]);
  it("allows a split across invoices up to the payment", () => {
    expect(validateAllocations(9500, [{ invoiceId: "a", amountCents: 3500 }, { invoiceId: "b", amountCents: 6000 }], balances)).toHaveLength(2);
    expect(validateAllocations(9500, [{ invoiceId: "a", amountCents: 3500 }, { invoiceId: "", amountCents: 0 }], balances)).toHaveLength(1);
  });
  it("rejects over-allocation, over-paying an invoice, duplicates and empty splits", () => {
    expect(() => validateAllocations(3000, [{ invoiceId: "a", amountCents: 3500 }], balances)).toThrow(/more than the payment/);
    expect(() => validateAllocations(9999, [{ invoiceId: "a", amountCents: 4000 }], balances)).toThrow(/balance/);
    expect(() => validateAllocations(9999, [{ invoiceId: "a", amountCents: 100 }, { invoiceId: "a", amountCents: 100 }], balances)).toThrow(/once/);
    expect(() => validateAllocations(9999, [], balances)).toThrow(/Pick/);
    expect(() => validateAllocations(9999, [{ invoiceId: "zzz", amountCents: 100 }], balances)).toThrow(/isn't open/);
  });
});
