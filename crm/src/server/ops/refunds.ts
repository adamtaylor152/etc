// Refunds: from the invoice page (card -> Stripe, cash / e-Transfer -> recorded only) and from Stripe's charge.refunded
// webhook (a refund made in the Stripe dashboard). Both lock the payment rows first, so the webhook for a refund we
// just issued waits for our commit and then finds nothing left to apply.
import type { Payment } from "@/generated/prisma/client";
import { paymentStatusAfterRefund, refundIdempotencyKey, refundProblem, refundRoute } from "../billing/adjustments";
import { db, type Tx } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity } from "../records";
import { TransitionError } from "../status/visit";
import { splitRefund, stripeEnabled } from "../stripe";
import { refundCharge, type Refunder } from "../stripe-refunds";
import { billingEmailFor, recomputeInvoice } from "./invoices";

const lock = (tx: Tx, ids: string[]) => tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ANY(${ids}) FOR UPDATE`;

/** Take `cents` back off a payment: paid amount and status re-derived (a refund re-opens a paid invoice), logged, client emailed. */
async function applyRefund(tx: Tx, p: Payment, cents: number, by: { userId?: string; via: "stripe" | "manual" | "stripe-dashboard"; reason?: string }) {
  const refundedCents = p.refundedCents + cents;
  await tx.payment.update({ where: { id: p.id }, data: { refundedCents, status: paymentStatusAfterRefund({ amountCents: p.amountCents, refundedCents }) } });
  const inv = await recomputeInvoice(p.invoiceId, tx);
  await logActivity(tx, {
    businessId: p.businessId, type: "payment.refunded", entityType: "Invoice", entityId: p.invoiceId, actorType: by.userId ? "USER" : "SYSTEM", actorUserId: by.userId,
    clientId: p.clientId, jobId: inv.jobId ?? undefined, data: { amountCents: cents, method: p.method, via: by.via, ...(by.reason ? { reason: by.reason } : {}) },
  });
  const client = await tx.client.findUniqueOrThrow({ where: { id: p.clientId } });
  await enqueue(tx, {
    businessId: p.businessId, template: "payment.refund", to: await billingEmailFor(tx, client), replyTo: env.helpEmail, priority: 2, props: { paymentId: p.id, amountCents: cents },
    dedupeKey: `payment:${p.id}:refund:${refundedCents}`, clientId: client.id, entityType: "Payment", entityId: p.id,
  });
}

/**
 * Refund part or all of a payment. `expectRefundedCents` is what the form showed as already refunded: if it has moved
 * (double submit, or a webhook got there first) nothing happens. The Stripe call runs inside the transaction holding the
 * row lock: if Stripe says no, nothing is written; if we crash after Stripe said yes, charge.refunded writes it.
 */
export async function refundPayment(user: { id: string; businessId: string }, input: { paymentId: string; amountCents: number; expectRefundedCents: number; reason?: string }, refund: Refunder = refundCharge) {
  await db.$transaction(async (tx) => {
    await lock(tx, [input.paymentId]);
    const p = await tx.payment.findFirstOrThrow({ where: { id: input.paymentId, businessId: user.businessId } });
    if (p.refundedCents !== input.expectRefundedCents) throw new TransitionError("This payment changed. Check it and try again.");
    const problem = refundProblem(p, input.amountCents);
    if (problem) throw new TransitionError(problem);
    const route = refundRoute(p);
    if (route.via === "none") throw new TransitionError(route.why);
    if (route.via === "stripe") {
      if (refund === refundCharge && !stripeEnabled()) throw new TransitionError("Card refunds need Stripe to be connected. Refund it in Stripe; it will show here.");
      try {
        await refund({ ...("paymentIntent" in route ? { paymentIntent: route.paymentIntent } : { checkoutSession: route.checkoutSession }), amountCents: input.amountCents, idempotencyKey: refundIdempotencyKey(p.id, p.refundedCents, input.amountCents), metadata: { paymentId: p.id, invoiceId: p.invoiceId, businessId: p.businessId } });
      } catch (e) {
        console.error("stripe refund failed", e);
        throw new TransitionError(`Stripe couldn't refund this: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    await applyRefund(tx, p, input.amountCents, { userId: user.id, via: route.via, reason: input.reason });
  }, { timeout: 30_000, maxWait: 10_000 }); // the Stripe round trip happens inside
  kickOutbox();
}

/** charge.refunded: bring our rows up to Stripe's running total for the charge. Replays and our own refunds change nothing. */
export async function syncStripeRefund(paymentIntentId: string, refundedTotalCents: number) {
  const where = { OR: [{ stripePaymentIntentId: paymentIntentId }, { stripePaymentIntentId: { startsWith: `${paymentIntentId}:` } }] };
  const changed = await db.$transaction(async (tx) => {
    await lock(tx, (await tx.payment.findMany({ where, select: { id: true } })).map((r) => r.id));
    const rows = await tx.payment.findMany({ where, orderBy: { receivedAt: "asc" } }); // read again: now under the lock
    // What Stripe has refunded beyond what we have recorded goes to the tip first, then to the invoice money.
    let fresh = refundedTotalCents - rows.reduce((n, x) => n + x.refundedCents + x.tipRefundedCents, 0);
    for (const row of rows) {
      const tipLeft = (row.tipCents ?? 0) - row.tipRefundedCents;
      const take = Math.min(tipLeft, Math.max(0, fresh));
      if (take > 0) {
        await tx.payment.update({ where: { id: row.id }, data: { tipRefundedCents: { increment: take } } });
        await logActivity(tx, { businessId: row.businessId, type: "payment.refunded", entityType: "Invoice", entityId: row.invoiceId, actorType: "SYSTEM", clientId: row.clientId, data: { amountCents: take, method: row.method, via: "stripe-dashboard", tip: true } });
        fresh -= take;
      }
    }
    const updates = fresh > 0 ? splitRefund(rows, rows.reduce((n, x) => n + x.refundedCents, 0) + fresh) : [];
    for (const u of updates) {
      const row = rows.find((r) => r.id === u.id)!;
      await applyRefund(tx, row, u.refundedCents - row.refundedCents, { via: "stripe-dashboard" });
    }
    return updates.length;
  });
  if (changed) kickOutbox();
  return changed;
}
