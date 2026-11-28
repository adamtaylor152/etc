// Card on file + automatic payments: who is charged, when, what each Stripe answer means, and when to retry.
// Pure, unit-tested. Stripe itself is only ever called from src/server/stripe.ts.
import type { AutoPayAttemptStatus, AutoPayState, InvoiceKind, InvoiceStatus } from "@/generated/prisma/client";
import { addDays } from "../dates";

/** Retries after a failed charge: this many days after the first try. Then we stop and tell the owner. */
export const RETRY_DAYS = [3, 7];
export const MAX_ATTEMPTS = RETRY_DAYS.length + 1;
export const STRIPE_MIN_CENTS = 50;

type Card = { cardBrand: string | null; cardLast4: string | null };
const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" };
/** "Visa •••• 4242" (or "Visa ending 4242" in a sentence); null when no card is saved. */
export const cardLabel = (c: Card, sep = " •••• ") => (c.cardLast4 ? `${BRANDS[c.cardBrand ?? ""] ?? "Card"}${sep}${c.cardLast4}` : null);

/** Auto-pay needs all of: Stripe keys, the business switch, a saved card, and the client's own opt-in. */
export const autoPayReady = (c: { stripeCustomerId: string | null; cardPaymentMethodId: string | null; autoPayConsentAt: Date | null }, s: { autoPay: boolean }, cardsOn: boolean) =>
  cardsOn && s.autoPay && !!c.autoPayConsentAt && !!c.cardPaymentMethodId && !!c.stripeCustomerId;

/**
 * The day a just-sent invoice's card is charged, or null when it is paid the usual way. Never before the grace period
 * (time to object after the email) and never before the invoice is due. Deposit invoices are never auto-charged.
 */
export function autoPayChargeOn(inv: { kind: InvoiceKind; issuedOn: string; dueOn: string }, ready: boolean, graceDays: number): string | null {
  if (!ready || inv.kind !== "STANDARD") return null;
  const grace = addDays(inv.issuedOn, graceDays);
  return inv.dueOn > grace ? inv.dueOn : grace;
}

export const autoPayPending = (s: AutoPayState | null) => s === "SCHEDULED" || s === "RETRYING";
/** States the owner has to chase: shown as "failed auto-payments". */
export const AUTOPAY_TROUBLE: AutoPayState[] = ["RETRYING", "NEEDS_ACTION", "FAILED"];
export const autoPayInTrouble = (i: { status: InvoiceStatus; autoPayState: AutoPayState | null }) => i.status === "AWAITING_PAYMENT" && !!i.autoPayState && AUTOPAY_TROUBLE.includes(i.autoPayState);

export type Decision = { do: "charge" } | { do: "wait" } | { do: "stop"; reason: string };
/** What the scheduler does with an auto-pay invoice right now. "stop" hands it back to the usual way of paying. */
export function autoPayDecision(inv: {
  status: InvoiceStatus; kind: InvoiceKind; balanceCents: number; autoPayState: AutoPayState | null; autoPayOn: string | null; attempts: { status: AutoPayAttemptStatus }[];
}, ready: boolean, today: string): Decision {
  if (!autoPayPending(inv.autoPayState)) return { do: "wait" };
  if (inv.status !== "AWAITING_PAYMENT" || inv.balanceCents <= 0) return { do: "stop", reason: "The invoice is no longer waiting for payment" };
  if (inv.kind !== "STANDARD") return { do: "stop", reason: "Deposits are not charged automatically" };
  if (!ready) return { do: "stop", reason: "Auto-pay is off or the card was removed" };
  if (inv.balanceCents < STRIPE_MIN_CENTS) return { do: "stop", reason: "The balance is under the card minimum" };
  if (inv.attempts.some((a) => a.status === "PENDING")) return { do: "wait" }; // a charge is in flight: never start another
  if (inv.attempts.length >= MAX_ATTEMPTS) return { do: "stop", reason: "Every automatic try has been used" };
  if (!inv.autoPayOn || inv.autoPayOn > today) return { do: "wait" };
  return { do: "charge" };
}

/** When to try again after the nth try failed (never sooner than tomorrow), or null once the tries are used up. */
export function nextAttemptOn(firstAttemptOn: string, failedAttempts: number, today: string): string | null {
  const days = RETRY_DAYS[failedAttempts - 1];
  if (days == null) return null;
  const planned = addDays(firstAttemptOn, days), tomorrow = addDays(today, 1);
  return planned > tomorrow ? planned : tomorrow;
}

/** Stripe's answer to a charge, flattened (from the create call, a thrown error, a retrieve or a webhook). */
export type ChargeResult = { piId: string | null; status: string | null; amountReceived?: number; error?: { type: string; code?: string; declineCode?: string; message?: string } };
export type Outcome =
  | { kind: "succeeded" }
  | { kind: "pending" } // Stripe is still working on it: the webhook or the next run settles it
  | { kind: "needs_action" } // the bank wants the cardholder to approve (3-D Secure): can't be done off-session
  | { kind: "failed"; code: string } // the bank said no: the client is told and we retry
  | { kind: "refused"; code: string } // Stripe rejected the request itself (card gone from Stripe, bad setup): the owner is told, not the client
  | { kind: "unknown" }; // no answer (network, outage, bad key): nothing is assumed, the same request is repeated

export function chargeOutcome(r: ChargeResult): Outcome {
  if (r.status === "succeeded") return { kind: "succeeded" };
  if (r.status === "requires_action" || r.error?.code === "authentication_required") return { kind: "needs_action" };
  if (r.status === "processing" || r.status === "requires_capture") return { kind: "pending" };
  if (r.error?.type === "StripeCardError" || r.status === "requires_payment_method" || r.status === "canceled") return { kind: "failed", code: r.error?.declineCode || r.error?.code || "declined" };
  if (r.error?.type === "StripeInvalidRequestError") return { kind: "refused", code: r.error.code || "invalid_request" };
  return { kind: "unknown" };
}

/** Why a charge failed, in words for the client. Fraud-flavoured codes stay vague on purpose. */
export function declineText(code: string | null | undefined): string {
  if (code === "insufficient_funds") return "the card didn't have enough funds";
  if (code === "expired_card") return "the card has expired";
  if (code === "card_velocity_exceeded" || code === "withdrawal_count_limit_exceeded") return "the card has reached its limit";
  if (code === "incorrect_cvc" || code === "incorrect_number" || code === "invalid_expiry_year" || code === "invalid_expiry_month") return "the card details need updating";
  return "your bank declined the charge";
}
