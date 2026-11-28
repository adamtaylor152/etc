// Refund, overpayment and tip rules. Pure, unit-tested. Integer cents throughout.
import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/client";

type Paid = { amountCents: number; refundedCents: number };

/** How much of a payment can still be refunded. A tip is not part of it (refund a tip in Stripe). */
export const refundableCents = (p: Paid) => Math.max(0, p.amountCents - p.refundedCents);

/** Why this refund can't go ahead, or null. */
export function refundProblem(p: Paid, cents: number): string | null {
  if (!Number.isInteger(cents) || cents <= 0) return "Enter an amount to refund";
  const left = refundableCents(p);
  if (left === 0) return "This payment is already fully refunded";
  if (cents > left) return `Only $${(left / 100).toFixed(2)} of this payment is left to refund`;
  return null;
}

export const paymentStatusAfterRefund = (p: Paid): PaymentStatus =>
  p.refundedCents <= 0 ? "SUCCEEDED" : p.refundedCents >= p.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";

/**
 * Where a refund goes. Card payments taken through Stripe are refunded by Stripe: the stored id is "<pi>" or
 * "<pi>:<invoiceId>" (several invoices in one checkout), or a Checkout Session id when the session had no intent.
 * Everything else (cash, e-Transfer, cheque) is only recorded: the owner sends the money back.
 */
export type RefundRoute = { via: "stripe"; paymentIntent: string } | { via: "stripe"; checkoutSession: string } | { via: "manual" } | { via: "none"; why: string };
export function refundRoute(p: { method: PaymentMethod; stripePaymentIntentId: string | null; stripeCheckoutSessionId: string | null }): RefundRoute {
  if (p.method !== "CARD") return { via: "manual" };
  const id = p.stripePaymentIntentId?.split(":")[0];
  if (id?.startsWith("pi_")) return { via: "stripe", paymentIntent: id };
  const cs = [id, p.stripeCheckoutSessionId].find((x) => x?.startsWith("cs_"));
  if (cs) return { via: "stripe", checkoutSession: cs };
  return { via: "none", why: "This card payment has no Stripe charge on record. Refund it in Stripe; it will show here." };
}

/** Same payment, same starting point, same amount -> same key, so a double submit can't refund twice. */
export const refundIdempotencyKey = (paymentId: string, refundedBeforeCents: number, cents: number) => `refund:${paymentId}:${refundedBeforeCents}:${cents}`;

/** A payment bigger than the balance: the invoice takes what it is owed, the rest becomes account credit. */
export function splitOverpayment(balanceCents: number, amountCents: number) {
  const appliedCents = Math.max(0, Math.min(balanceCents, amountCents));
  return { appliedCents, creditCents: amountCents - appliedCents };
}

/** Tip carried in a Checkout Session's metadata (never the whole session): the webhook takes it off the invoice payment. */
export function sessionTip(metadata: Record<string, string> | null | undefined, amountTotalCents: number) {
  const raw = metadata?.tipCents ?? "";
  const t = /^\d{1,7}$/.test(raw) ? Number(raw) : 0;
  return t < amountTotalCents ? t : 0;
}

export const TIP_PERCENTS = [10, 15, 20] as const;
export const MAX_TIP_CENTS = 50_000;
/** Tip for a choice on the pay page: "10" | "15" | "20" (percent of the invoice total) or "custom" (dollars typed). Anything else is no tip. */
export function tipCents(invoiceTotalCents: number, choice: string, customDollars?: string | number | null): number {
  if (choice === "custom") {
    const c = Math.round(Number(customDollars) * 100);
    return Number.isFinite(c) && c > 0 ? Math.min(c, MAX_TIP_CENTS) : 0;
  }
  const pct = TIP_PERCENTS.find((p) => String(p) === choice);
  return pct ? Math.min(Math.round((invoiceTotalCents * pct) / 100), MAX_TIP_CENTS) : 0;
}
