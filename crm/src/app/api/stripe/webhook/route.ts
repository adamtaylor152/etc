// Stripe webhook (signature-checked). checkout.session.completed / async_payment_succeeded -> card payment(s);
// several invoices in one checkout ("Pay all") become one payment row per invoice. charge.refunded -> refunds.
// Idempotent: each row's stripePaymentIntentId is "<pi>" (one invoice) or "<pi>:<invoiceId>" (several).
// Card on file: setup_intent.succeeded / checkout.session.completed save a card, payment_intent.succeeded /
// payment_intent.payment_failed settle an automatic payment, payment_method.detached forgets a card,
// charge.dispute.created emails the owners. The endpoint in Stripe must be subscribed to all of these.
import type Stripe from "stripe";
import { db } from "@/server/db";
import { cardDetached, disputeOpened, saveCard, settleAttempt } from "@/server/ops/autopay";
import { recomputeInvoice, recordPayment } from "@/server/ops/invoices";
import { checkoutPaymentMethod, decodeAlloc, piResult, splitRefund, stripe, stripeFee } from "@/server/stripe";

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
    // Card on file: a setup-mode Checkout has nothing to pay; a payment may also carry "save this card". saveCard ignores replays.
    const keep = s.metadata?.saveCard === "1" && s.metadata.clientId ? { clientId: s.metadata.clientId, autoPay: s.metadata.autoPay === "1", source: s.metadata.source ?? "hub" } : null;
    const keepCard = async () => {
      const pm = keep && (await checkoutPaymentMethod(s));
      if (keep && pm) await saveCard({ ...keep, paymentMethodId: pm });
    };
    if (s.mode === "setup") {
      await keepCard();
      return Response.json({ ok: true });
    }
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
    await keepCard();
  }
  if (event.type === "setup_intent.succeeded") {
    const si = event.data.object, m = si.metadata, pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
    if (m?.saveCard === "1" && m.clientId && pm) await saveCard({ clientId: m.clientId, paymentMethodId: pm, autoPay: m.autoPay === "1", source: m.source ?? "hub" });
  }
  // Automatic payments: only PaymentIntents we made for an attempt carry its id. Checkout's own are handled above.
  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const pi = event.data.object;
    if (pi.metadata?.autoPayAttemptId) await settleAttempt(pi.metadata.autoPayAttemptId, piResult(pi));
  }
  if (event.type === "payment_method.detached") await cardDetached(event.data.object.id);
  if (event.type === "charge.dispute.created") {
    const d = event.data.object;
    await disputeOpened({ id: d.id, amountCents: d.amount, reason: d.reason, paymentIntentId: typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id ?? null });
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
