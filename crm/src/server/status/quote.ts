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

export type QuoteLine = { totalCents: number; isOptional: boolean; isSelected: boolean; optionKey?: string | null };
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

// ---------- option sets (good / better / best) ----------
// A quote may offer 2-4 named options. A line with an optionKey belongs to that option; the rest are common to all.
// The client picks exactly one; the totals above are then run over `optionLines(lines, key)`.
export type QuoteOption = { key: string; name: string; recommended: boolean };
export const OPTION_KEYS = ["a", "b", "c", "d"];

/** The stored options JSON. Anything malformed reads as no options. */
export const quoteOptions = (raw: unknown): QuoteOption[] => (Array.isArray(raw) ? raw : [])
  .filter((o) => o && typeof o.key === "string" && typeof o.name === "string")
  .map((o) => ({ key: o.key, name: o.name, recommended: o.recommended === true }));

/** The lines that count when `key` is chosen: the common ones plus that option's. A quote without options keeps every line. */
export const optionLines = <L extends QuoteLine>(lines: L[], key: string | null | undefined) => lines.filter((l) => !l.optionKey || l.optionKey === key);

/** Pre-tax total if the client picks `key` (with the optional lines as ticked). */
export const optionTotal = (lines: QuoteLine[], d: QuoteDiscount, key: string) => {
  const ls = optionLines(lines, key);
  return quoteTotal(ls, quoteDiscountCents(ls, d));
};

/** What the client pays if they pick `key` (null on a quote without options): discount, GST and total. */
export const optionTotals = (lines: QuoteLine[], d: QuoteDiscount, tax: TaxSettings, key: string | null) => {
  const ls = optionLines(lines, key);
  return quoteTotals(ls, quoteDiscountCents(ls, d), tax);
};

/**
 * The option a quote is valued at (its stored totals, so the quotes list, pipeline, deposit preview and emails): the one
 * the client chose; before that the recommended one, else the cheapest. Null when the quote has no options.
 */
export function valuedOption(options: QuoteOption[], lines: QuoteLine[], d: QuoteDiscount, chosen?: string | null) {
  if (!options.length) return null;
  const pick = options.find((o) => o.key === chosen) ?? options.find((o) => o.recommended)
    ?? options.reduce((best, o) => (optionTotal(lines, d, o.key) < optionTotal(lines, d, best.key) ? o : best));
  return pick.key;
}

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
