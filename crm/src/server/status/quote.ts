// Quote state machine + money. Pure, unit-tested. Once sent, a quote never goes back to DRAFT, except a declined
// one the owner reopens: nothing hangs off a declined quote (no signature, deposit invoice or job), so nothing is orphaned.
import type { QuoteStatus } from "@/generated/prisma/client";
import { invoiceTotals, type TaxSettings } from "../billing/invoice";
import { TransitionError } from "./visit";

const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["AWAITING_RESPONSE", "ARCHIVED"],
  AWAITING_RESPONSE: ["APPROVED", "CHANGES_REQUESTED", "DECLINED", "ARCHIVED", "AWAITING_RESPONSE"], // resend
  CHANGES_REQUESTED: ["AWAITING_RESPONSE", "APPROVED", "DECLINED", "ARCHIVED"],
  APPROVED: ["CONVERTED", "ARCHIVED"],
  CONVERTED: [],
  ARCHIVED: [],
  DECLINED: ["DRAFT", "ARCHIVED"], // reopen
};

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus) {
  if (!NEXT[from].includes(to)) throw new TransitionError(`A ${from.toLowerCase().replace("_", " ")} quote can't become ${to.toLowerCase().replace("_", " ")}`);
}

/** Only drafts and quotes the client asked to change can be edited. */
export const quoteEditable = (s: QuoteStatus) => s === "DRAFT" || s === "CHANGES_REQUESTED";

export type QuoteLine = { totalCents: number; isOptional: boolean; isSelected: boolean };
const chosen = (lines: QuoteLine[]) => lines.filter((l) => !l.isOptional || l.isSelected).reduce((a, l) => a + l.totalCents, 0);
export type QuoteDiscount = { discountType: string; discountValue: number; discountCents: number };
/**
 * Dollars off. A percent discount (discountValue = percent x100) follows the chosen lines, so it moves when the client
 * ticks optional extras; a dollar discount is the stored discountCents.
 */
export const quoteDiscountCents = (lines: QuoteLine[], d: QuoteDiscount) =>
  d.discountType === "PERCENT" ? Math.round((chosen(lines) * Math.min(10_000, Math.max(0, d.discountValue))) / 10_000) : d.discountCents;

/** Pre-tax total: required lines plus the optional lines the client (or owner) ticked, less the discount. */
export const quoteTotal = (lines: QuoteLine[], discountCents = 0) =>
  Math.max(0, chosen(lines) - discountCents);

/** What the client pays: the same GST rules as invoices, so a quote and the invoice it becomes agree. */
export const quoteTotals = (lines: QuoteLine[], discountCents: number, tax: TaxSettings) =>
  invoiceTotals(lines.filter((l) => !l.isOptional || l.isSelected).map((l) => l.totalCents), discountCents, tax);

/** Computed: awaiting a response past its valid-until date. */
export const quoteExpired = (q: { status: QuoteStatus; validUntil: string | null }, today: string) =>
  q.status === "AWAITING_RESPONSE" && !!q.validUntil && q.validUntil < today;

/** A follow-up is sent in the few days after it falls due, so switching one on never nudges months-old quotes. */
const FOLLOW_UP_WINDOW_DAYS = 3;
/**
 * The follow-up (1-based) due now, or null; the later one when both are. Only while the quote is still waiting on the
 * client and not expired: approved, declined, changes-requested, converted and archived quotes get none.
 */
export function followUpDue(q: { status: QuoteStatus; validUntil: string | null; sentAt: Date | null }, steps: { on: boolean; days: number }[], now: Date, today: string) {
  if (q.status !== "AWAITING_RESPONSE" || !q.sentAt || quoteExpired(q, today)) return null;
  const age = (now.getTime() - q.sentAt.getTime()) / 86_400_000;
  const n = steps.findLastIndex((s) => s.on && age >= s.days && age < s.days + FOLLOW_UP_WINDOW_DAYS);
  return n < 0 ? null : n + 1;
}
