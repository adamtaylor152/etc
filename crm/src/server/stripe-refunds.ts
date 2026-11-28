// The Stripe call for refunds, behind the stripe() seam and kept apart from checkout (stripe.ts) so ops can be handed a fake.
import { stripe } from "./stripe";

export type StripeRefund = { paymentIntent?: string; checkoutSession?: string; amountCents: number; idempotencyKey: string; metadata: Record<string, string> };
export type Refunder = (r: StripeRefund) => Promise<{ id: string }>;

/** Refund part or all of a card payment. The idempotency key makes a retried call return the same refund, not a second one. */
export const refundCharge: Refunder = async (r) => {
  let pi = r.paymentIntent;
  if (!pi && r.checkoutSession) {
    const s = await stripe().checkout.sessions.retrieve(r.checkoutSession);
    pi = (typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id) ?? undefined;
  }
  if (!pi) throw new Error("No Stripe payment found for this charge");
  const refund = await stripe().refunds.create({ payment_intent: pi, amount: r.amountCents, reason: "requested_by_customer", metadata: r.metadata }, { idempotencyKey: r.idempotencyKey });
  return { id: refund.id };
};
