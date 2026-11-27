// Stripe webhook: checkout.session.completed -> record the card payment (idempotent on the PaymentIntent id).
import type Stripe from "stripe";
import { db } from "@/server/db";
import { recordPayment } from "@/server/ops/invoices";
import { stripe } from "@/server/stripe";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    if (s.payment_status !== "paid") return Response.json({ ok: true, ignored: "not paid yet" });
    const invoiceId = s.metadata?.invoiceId;
    const inv = invoiceId ? await db.invoice.findUnique({ where: { id: invoiceId } }) : null;
    if (!inv) return Response.json({ ok: true, ignored: "unknown invoice" });
    await recordPayment({ id: null, businessId: inv.businessId }, {
      invoiceId: inv.id, method: "CARD", amountCents: s.amount_total ?? 0,
      stripePaymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id,
      stripeCheckoutSessionId: s.id, reference: "Stripe",
    });
  }
  return Response.json({ ok: true });
}
