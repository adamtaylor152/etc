// Stripe webhook (signature-checked). checkout.session.completed / async_payment_succeeded -> card payment(s);
// several invoices in one checkout ("Pay all") become one payment row per invoice. charge.refunded -> refunds.
// Idempotent: each row's stripePaymentIntentId is "<pi>" (one invoice) or "<pi>:<invoiceId>" (several).
import type Stripe from "stripe";
import { db } from "@/server/db";
import { sessionTip } from "@/server/billing/adjustments";
import { recordPayment } from "@/server/ops/invoices";
import { syncStripeRefund } from "@/server/ops/refunds";
import { decodeAlloc, stripe, stripeFee } from "@/server/stripe";

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
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id;
    const alloc = s.metadata?.alloc ? decodeAlloc(s.metadata.alloc) : s.metadata?.invoiceId ? [{ invoiceId: s.metadata.invoiceId, cents: s.amount_total ?? 0 }] : [];
    const fee = await stripeFee(pi);
    const tip = alloc.length === 1 ? sessionTip(s.metadata, s.amount_total ?? 0) : 0; // pay page only: kept off the invoice
    for (const [i, a] of alloc.entries()) {
      const inv = await db.invoice.findUnique({ where: { id: a.invoiceId } });
      if (!inv) continue;
      await recordPayment({ id: null, businessId: inv.businessId }, {
        invoiceId: inv.id, method: "CARD", amountCents: alloc.length === 1 ? (s.amount_total ?? a.cents) - tip : a.cents, tipCents: tip,
        stripePaymentIntentId: alloc.length === 1 ? pi : `${pi}:${inv.id}`, stripeCheckoutSessionId: s.id, reference: "Stripe",
        feeCents: i === 0 ? fee ?? undefined : undefined, // the whole fee sits on the first row
      });
    }
  }
  if (event.type === "charge.refunded") {
    const ch = event.data.object;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi) await syncStripeRefund(pi, ch.amount_refunded); // also logs it and emails the client a refund receipt
  }
  return Response.json({ ok: true });
}
