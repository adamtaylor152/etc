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

/** Credit lines (negative: "Less deposit", account credits) stand for a deposit or credit used once, so the draft editor leaves them alone. */
export const isCreditLine = (l: { totalCents: number }) => l.totalCents < 0;

/**
 * Why an edited draft can't be saved, or null. `lineTotals` are the editable lines, `creditCents` what the fixed credit
 * lines take off: the lines must still cover the credits (or that money would vanish), then the discount, then what's been paid.
 */
export function draftEditProblem(lineTotals: number[], creditCents: number, discountCents: number, paidCents: number, tax: TaxSettings): string | null {
  if (!lineTotals.length) return "Add at least one line";
  if (lineTotals.some((c) => !Number.isInteger(c) || c < 0) || !Number.isInteger(discountCents) || discountCents < 0) return "Check the amounts";
  const subtotal = lineTotals.reduce((a, b) => a + b, 0) - creditCents;
  if (subtotal < 0) return "The lines can't total less than the deposit or credit already applied to this invoice";
  if (discountCents > subtotal) return "The discount is more than the invoice";
  if (invoiceTotals([subtotal], discountCents, tax).totalCents < paidCents) return "The total can't be less than what's already been paid";
  return null;
}

export const TERMS_LABEL: Record<PaymentTerms, string> = { DUE_ON_RECEIPT: "On receipt", NET_7: "7 days", NET_15: "15 days", NET_30: "30 days" };
export const TERMS_DAYS:Record<PaymentTerms, number> = { DUE_ON_RECEIPT: 0, NET_7: 7, NET_15: 15, NET_30: 30 };
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

/** Where money emails go: the client's billing contact if one has an email, otherwise the client. Pure, unit-tested. */
export const billingEmail = (clientEmail: string, contacts: { isBilling: boolean; email: string | null }[]) =>
  contacts.find((c) => c.isBilling && c.email)?.email ?? clientEmail;

export const etransferRef = (number: number) => `ETC-${number}`;

/** Deposit amount for a quote total. Pure, unit-tested. */
export function depositCents(totalCents: number, type: string, value: number) {
  if (type === "PERCENT") return Math.round((totalCents * Math.min(100, Math.max(0, value))) / 100);
  if (type === "FIXED") return Math.min(totalCents, Math.max(0, value));
  return 0;
}

/** How much paid deposit to credit on a new invoice: never more than the invoice itself. Pure, unit-tested. */
export function depositCredit(invoiceCents: number, deposits: { id: string; paidCents: number }[]) {
  let left = invoiceCents;
  const use: { id: string; cents: number }[] = [];
  for (const d of deposits) {
    const c = Math.min(d.paidCents, left);
    if (c <= 0) break;
    use.push({ id: d.id, cents: c });
    left -= c;
  }
  return use;
}
