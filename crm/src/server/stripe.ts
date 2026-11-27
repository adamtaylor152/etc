// Stripe Checkout for invoice card payments (CAD). Card is offered only when STRIPE_SECRET_KEY is set;
// cash and e-Transfer always work. The Stripe account must be in an adult's name (Silas is a minor).
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null = null;
export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** A Checkout Session for an invoice's remaining balance; created when the client clicks Pay, never in advance. */
export async function checkoutForInvoice(inv: { id: string; businessId: string; number: number; balanceCents: number; email: string }, token: string) {
  return stripe().checkout.sessions.create({
    mode: "payment",
    currency: "cad",
    customer_email: inv.email,
    line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: inv.balanceCents, product_data: { name: `etc. invoice #${inv.number}` } } }],
    metadata: { invoiceId: inv.id, businessId: inv.businessId },
    payment_intent_data: { metadata: { invoiceId: inv.id, businessId: inv.businessId }, statement_descriptor_suffix: "ETC CREW" },
    success_url: `${env.appUrl}/i/${token}?paid=1`,
    cancel_url: `${env.appUrl}/i/${token}`,
  });
}
