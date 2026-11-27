// Invoice money + status rules. Pure, unit-tested. Integer cents throughout.
import type { InvoiceStatus, PaymentTerms } from "@/generated/prisma/client";
import { addDays } from "../dates";

export type TaxSettings = { taxRegistered: boolean; taxRateBps: number; pricesIncludeTax: boolean };

/**
 * Not GST-registered (etc. today): no tax at all. Registered + tax-included prices: total unchanged, and
 * taxCents is the GST portion inside it (shown as "includes GST"). Registered + tax-extra: GST added on top.
 */
export function invoiceTotals(lineTotals: number[], discountCents: number, tax: TaxSettings) {
  const subtotalCents = lineTotals.reduce((a, b) => a + b, 0);
  const net = Math.max(0, subtotalCents - discountCents);
  if (!tax.taxRegistered) return { subtotalCents, discountCents, taxCents: 0, totalCents: net, taxIncluded: false };
  if (tax.pricesIncludeTax) {
    const taxCents = Math.round(net - net / (1 + tax.taxRateBps / 10_000));
    return { subtotalCents, discountCents, taxCents, totalCents: net, taxIncluded: true };
  }
  const taxCents = Math.round((net * tax.taxRateBps) / 10_000);
  return { subtotalCents, discountCents, taxCents, totalCents: net + taxCents, taxIncluded: false };
}

export const TERMS_DAYS: Record<PaymentTerms, number> = { DUE_ON_RECEIPT: 0, NET_7: 7, NET_15: 15, NET_30: 30 };
export const dueDate = (issuedOn: string, terms: PaymentTerms) => addDays(issuedOn, TERMS_DAYS[terms]);

/** Status after payments change. Draft/void/bad debt are only changed by explicit actions, except a draft paid in full. */
export function statusAfterPayments(current: InvoiceStatus, totalCents: number, paidCents: number): InvoiceStatus {
  if (current === "VOID" || current === "BAD_DEBT") return current;
  if (totalCents > 0 && paidCents >= totalCents) return "PAID";
  if (current === "PAID") return "AWAITING_PAYMENT"; // a payment was removed/refunded
  return current;
}

export type InvoiceView = "DRAFT" | "AWAITING_PAYMENT" | "PARTIAL" | "PAST_DUE" | "PAID" | "BAD_DEBT" | "VOID";
/** What to show: adds computed PAST_DUE and PARTIAL to the stored status. */
export function invoiceView(i: { status: InvoiceStatus; dueOn: string | null; totalCents: number; amountPaidCents: number }, today: string): InvoiceView {
  if (i.status !== "AWAITING_PAYMENT") return i.status;
  if (i.dueOn && i.dueOn < today) return "PAST_DUE";
  if (i.amountPaidCents > 0 && i.amountPaidCents < i.totalCents) return "PARTIAL";
  return "AWAITING_PAYMENT";
}

/** Which reminder (1 or 2) is due today, if any: 3 and 10 days past due, never more than two. */
export function reminderDue(i: { status: InvoiceStatus; dueOn: string | null; remindersSent: number }, today: string): 1 | 2 | null {
  if (i.status !== "AWAITING_PAYMENT" || !i.dueOn) return null;
  if (i.remindersSent === 0 && today >= addDays(i.dueOn, 3)) return 1;
  if (i.remindersSent === 1 && today >= addDays(i.dueOn, 10)) return 2;
  return null;
}

export const etransferRef = (number: number) => `ETC-${number}`;
