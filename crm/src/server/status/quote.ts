// Quote state machine + money. Pure, unit-tested. Once sent, a quote never goes back to DRAFT.
import type { QuoteStatus } from "@/generated/prisma/client";
import { TransitionError } from "./visit";

const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["AWAITING_RESPONSE", "ARCHIVED"],
  AWAITING_RESPONSE: ["APPROVED", "CHANGES_REQUESTED", "ARCHIVED", "AWAITING_RESPONSE"], // resend
  CHANGES_REQUESTED: ["AWAITING_RESPONSE", "APPROVED", "ARCHIVED"],
  APPROVED: ["CONVERTED", "ARCHIVED"],
  CONVERTED: [],
  ARCHIVED: [],
};

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus) {
  if (!NEXT[from].includes(to)) throw new TransitionError(`A ${from.toLowerCase().replace("_", " ")} quote can't become ${to.toLowerCase().replace("_", " ")}`);
}

/** Only drafts and quotes the client asked to change can be edited. */
export const quoteEditable = (s: QuoteStatus) => s === "DRAFT" || s === "CHANGES_REQUESTED";

export type QuoteLine = { totalCents: number; isOptional: boolean; isSelected: boolean };
/** Total counts required lines plus the optional lines the client (or owner) ticked. */
export const quoteTotal = (lines: QuoteLine[], discountCents = 0) =>
  Math.max(0, lines.filter((l) => !l.isOptional || l.isSelected).reduce((a, l) => a + l.totalCents, 0) - discountCents);

/** Computed: awaiting a response past its valid-until date. */
export const quoteExpired = (q: { status: QuoteStatus; validUntil: string | null }, today: string) =>
  q.status === "AWAITING_RESPONSE" && !!q.validUntil && q.validUntil < today;
