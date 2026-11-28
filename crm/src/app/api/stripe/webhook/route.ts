// Stripe webhook (signature-checked). checkout.session.completed / async_payment_succeeded -> card payment(s);
// several invoices in one checkout ("Pay all") become one payment row per invoice. charge.refunded -> refunds.
// Idempotent: each row's stripePaymentIntentId is "<pi>" (one invoice) or "<pi>:<invoiceId>" (several).
import type Stripe from "stripe";
import { db } from "@/server/db";
import { recomputeInvoice, recordPayment } from "@/server/ops/invoices";
import { decodeAlloc, splitRefund, stripe, stripeFee } from "@/server/stripe";

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
    for (const [i, a] of alloc.entries()) {
      const inv = await db.invoice.findUnique({ where: { id: a.invoiceId } });
      if (!inv) continue;
      await recordPayment({ id: null, businessId: inv.businessId }, {
        invoiceId: inv.id, method: "CARD", amountCents: alloc.length === 1 ? s.amount_total ?? a.cents : a.cents,
        stripePaymentIntentId: alloc.length === 1 ? pi : `${pi}:${inv.id}`, stripeCheckoutSessionId: s.id, reference: "Stripe",
        feeCents: i === 0 ? fee ?? undefined : undefined, // the whole fee sits on the first row
      });
    }
  }
  if (event.type === "charge.refunded") {
    const ch = event.data.object;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi) {
      const rows = await db.payment.findMany({ where: { OR: [{ stripePaymentIntentId: pi }, { stripePaymentIntentId: { startsWith: `${pi}:` } }] }, orderBy: { receivedAt: "asc" } });
      for (const u of splitRefund(rows, ch.amount_refunded)) {
        const row = rows.find((r) => r.id === u.id)!;
        const p = await db.payment.update({ where: { id: u.id }, data: { refundedCents: u.refundedCents, status: u.refundedCents >= row.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
        await recomputeInvoice(p.invoiceId);
      }
    }
  }
  return Response.json({ ok: true });
}
