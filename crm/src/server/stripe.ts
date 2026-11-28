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
export async function checkoutForInvoice(inv: { id: string; businessId: string; number: number; balanceCents: number; email: string }, returnPath: string) {
  return stripe().checkout.sessions.create({
    mode: "payment",
    currency: "cad",
    customer_email: inv.email,
    line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: inv.balanceCents, product_data: { name: `etc. invoice #${inv.number}` } } }],
    metadata: { invoiceId: inv.id, businessId: inv.businessId },
    payment_intent_data: { metadata: { invoiceId: inv.id, businessId: inv.businessId }, statement_descriptor_suffix: "ETC CREW" },
    success_url: `${env.appUrl}${returnPath}?paid=1`,
    cancel_url: `${env.appUrl}${returnPath}`,
  });
}

// ---------- Pay several invoices at once (client hub "Pay all") ----------
export type Alloc = { invoiceId: string; cents: number };
/** Metadata holds "inv:cents,inv:cents" (Stripe caps a value at 500 chars, so at most 10 invoices). Pure, unit-tested. */
export const encodeAlloc = (a: Alloc[]) => a.map((x) => `${x.invoiceId}:${x.cents}`).join(",");
export const decodeAlloc = (s: string | undefined | null): Alloc[] =>
  (s ?? "").split(",").map((p) => p.split(":")).filter((p) => p.length === 2 && /^\d+$/.test(p[1])).map(([invoiceId, c]) => ({ invoiceId, cents: Number(c) }));

export async function checkoutForInvoices(input: { businessId: string; clientId: string; email: string; invoices: { id: string; number: number; balanceCents: number }[]; successUrl: string; cancelUrl: string }) {
  const list = input.invoices.filter((i) => i.balanceCents > 0).slice(0, 10);
  const alloc = encodeAlloc(list.map((i) => ({ invoiceId: i.id, cents: i.balanceCents })));
  return stripe().checkout.sessions.create({
    mode: "payment", currency: "cad", customer_email: input.email || undefined,
    line_items: list.map((i) => ({ quantity: 1, price_data: { currency: "cad", unit_amount: i.balanceCents, product_data: { name: `etc. invoice #${i.number}` } } })),
    metadata: { businessId: input.businessId, clientId: input.clientId, alloc },
    payment_intent_data: { metadata: { businessId: input.businessId, clientId: input.clientId, alloc }, statement_descriptor_suffix: "ETC CREW" },
    success_url: input.successUrl, cancel_url: input.cancelUrl,
  });
}

/** Spread a refund across a payment's per-invoice rows, newest first. Pure, unit-tested. */
export function splitRefund(rows: { id: string; amountCents: number; refundedCents: number }[], refundedTotal: number) {
  let left = refundedTotal - rows.reduce((n, r) => n + r.refundedCents, 0);
  const out: { id: string; refundedCents: number }[] = [];
  for (const r of [...rows].reverse()) {
    if (left <= 0) break;
    const room = r.amountCents - r.refundedCents;
    const add = Math.min(room, left);
    if (add > 0) { out.push({ id: r.id, refundedCents: r.refundedCents + add }); left -= add; }
  }
  return out;
}

/** Stripe's fee for a PaymentIntent (from its charge's balance transaction), or null. */
export async function stripeFee(paymentIntentId: string): Promise<number | null> {
  try {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = pi.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    return bt?.fee ?? null;
  } catch {
    return null;
  }
}
