// Stripe Checkout for invoice card payments (CAD). Card is offered only when STRIPE_SECRET_KEY is set;
// cash and e-Transfer always work. The Stripe account must be in an adult's name (Silas is a minor).
import Stripe from "stripe";
import type { ChargeResult } from "./billing/autopay";
import { env } from "./env";

let client: Stripe | null = null;
export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * A Checkout Session for an invoice's remaining balance; created when the client clicks Pay, never in advance.
 * With `save`, the card is also kept on the client's Stripe Customer for later (the webhook stores it).
 */
export async function checkoutForInvoice(inv: { id: string; businessId: string; number: number; balanceCents: number; email: string }, returnPath: string, save?: { customerId: string; clientId: string; autoPay: boolean }) {
  const metadata = { invoiceId: inv.id, businessId: inv.businessId, ...(save ? { saveCard: "1", clientId: save.clientId, autoPay: save.autoPay ? "1" : "0", source: "invoice" } : {}) };
  return stripe().checkout.sessions.create({
    mode: "payment",
    currency: "cad",
    ...(save ? { customer: save.customerId } : { customer_email: inv.email }),
    line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: inv.balanceCents, product_data: { name: `etc. invoice #${inv.number}` } } }],
    metadata,
    payment_intent_data: { metadata, statement_descriptor_suffix: "ETC CREW", ...(save ? { setup_future_usage: "off_session" as const } : {}) },
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

// ---------- Card on file + automatic payments ----------
// Only Stripe ids and display data (brand, last 4, expiry) ever reach our database. Card numbers are typed on Stripe's page.

/** A Stripe Customer for a client. The idempotency key means a double click can't make two. */
export async function createCustomer(c: { id: string; businessId: string; email: string; name: string }) {
  const cust = await stripe().customers.create({ email: c.email || undefined, name: c.name, metadata: { clientId: c.id, businessId: c.businessId } }, { idempotencyKey: `customer:${c.id}` });
  return cust.id;
}

/** Checkout in setup mode: saves a card without charging it. `autoPay` carries the choice the client made on our page. */
export async function checkoutForCard(input: { customerId: string; businessId: string; clientId: string; autoPay: boolean; source: string; successUrl: string; cancelUrl: string }) {
  const metadata = { businessId: input.businessId, clientId: input.clientId, saveCard: "1", autoPay: input.autoPay ? "1" : "0", source: input.source };
  return stripe().checkout.sessions.create({
    mode: "setup", currency: "cad", customer: input.customerId, allowed_payment_method_types: ["card"],
    metadata, setup_intent_data: { metadata }, success_url: input.successUrl, cancel_url: input.cancelUrl,
  });
}

/** The payment method a finished Checkout Session left behind (setup mode: its SetupIntent; payment mode: its PaymentIntent). */
export async function checkoutPaymentMethod(s: Stripe.Checkout.Session): Promise<string | null> {
  const id = (x: string | { id: string } | null) => (typeof x === "string" ? x : x?.id ?? null);
  const si = id(s.setup_intent), pi = id(s.payment_intent);
  if (si) return id((await stripe().setupIntents.retrieve(si)).payment_method);
  if (pi) return id((await stripe().paymentIntents.retrieve(pi)).payment_method);
  return null;
}

export type SavedCard = { id: string; customerId: string | null; brand: string; last4: string; expMonth: number; expYear: number };
/** Display data for a saved card, or null if it isn't a card (or is gone). */
export async function cardOf(paymentMethodId: string): Promise<SavedCard | null> {
  const pm = await stripe().paymentMethods.retrieve(paymentMethodId).catch(() => null);
  if (!pm?.card) return null;
  return { id: pm.id, customerId: typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null, brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
}

/** Forget a card at Stripe. Best effort: it may already be detached. */
export async function detachCard(paymentMethodId: string) {
  if (!stripeEnabled()) return;
  await stripe().paymentMethods.detach(paymentMethodId).catch((e) => console.error("card detach failed", e));
}

export const piResult = (pi: Stripe.PaymentIntent): ChargeResult => ({
  piId: pi.id, status: pi.status, amountReceived: pi.amount_received,
  error: pi.last_payment_error ? { type: "StripeCardError", code: pi.last_payment_error.code, declineCode: pi.last_payment_error.decline_code, message: pi.last_payment_error.message } : undefined,
});

/**
 * Charge a saved card with nobody present. The idempotency key (one per invoice + try) makes a repeat of the same
 * request return the first answer instead of charging again. A decline comes back as a result, not a throw.
 */
export async function chargeSavedCard(a: { attemptId: string; invoiceId: string; businessId: string; number: number; amountCents: number; customerId: string; paymentMethodId: string; idempotencyKey: string }): Promise<ChargeResult> {
  try {
    return piResult(await stripe().paymentIntents.create({
      amount: a.amountCents, currency: "cad", customer: a.customerId, payment_method: a.paymentMethodId, off_session: true, confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" }, // no return_url: nobody is there to be redirected
      description: `etc. invoice #${a.number} (automatic payment)`, statement_descriptor_suffix: "ETC CREW",
      metadata: { invoiceId: a.invoiceId, businessId: a.businessId, autoPayAttemptId: a.attemptId },
    }, { idempotencyKey: a.idempotencyKey }));
  } catch (e) {
    if (!(e instanceof Stripe.errors.StripeError)) throw e;
    return { piId: e.payment_intent?.id ?? null, status: e.payment_intent?.status ?? null, error: { type: e.type, code: e.code, declineCode: e.decline_code, message: e.message } };
  }
}

export const retrievePi = async (id: string) => piResult(await stripe().paymentIntents.retrieve(id));
/** Drop a PaymentIntent that is waiting for the cardholder (they pay from the invoice page instead). Best effort. */
export async function cancelPi(id: string) {
  await stripe().paymentIntents.cancel(id).catch((e) => console.error("payment intent cancel failed", e));
}
