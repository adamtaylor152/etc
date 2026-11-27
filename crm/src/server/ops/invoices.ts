// Invoices and payments: unbilled charges -> draft invoice -> send -> payment (cash / e-Transfer / card) -> receipt.
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { dueDate, etransferRef, invoiceTotals, statusAfterPayments } from "../billing/invoice";
import { todayLocal, toDbDate } from "../dates";
import { db, type Tx } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity, nextNumber } from "../records";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string } | { id: null; businessId: string }; // id null = system (Stripe webhook)
type LineIn = { name: string; quantity: number; unitPriceCents: number; totalCents: number; serviceDate?: Date | null; jobId?: string | null; visitId?: string | null; chargeId?: string };

async function createDraft(tx: Tx, user: Actor, input: {
  clientId: string; propertyId?: string | null; jobId?: string | null; snowEventId?: string | null; subject: string; lines: LineIn[];
}) {
  if (!input.lines.length) throw new TransitionError("Nothing to invoice");
  const biz = await tx.business.findUniqueOrThrow({ where: { id: user.businessId } });
  const number = await nextNumber(tx, user.businessId, "INVOICE");
  const totals = invoiceTotals(input.lines.map((l) => l.totalCents), 0, biz);
  const inv = await tx.invoice.create({
    data: {
      businessId: user.businessId, number, clientId: input.clientId, propertyId: input.propertyId, jobId: input.jobId, snowEventId: input.snowEventId,
      subject: input.subject, paymentTerms: biz.defaultPaymentTerms, etransferRef: etransferRef(number),
      subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents,
    },
  });
  for (const [i, l] of input.lines.entries()) {
    const line = await tx.invoiceLineItem.create({
      data: { invoiceId: inv.id, name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, serviceDate: l.serviceDate, jobId: l.jobId, visitId: l.visitId, sortOrder: i },
    });
    if (l.chargeId) {
      const res = await tx.visitCharge.updateMany({ where: { id: l.chargeId, invoiceLineItemId: null }, data: { invoiceLineItemId: line.id } });
      if (res.count !== 1) throw new TransitionError("Some charges were already invoiced. Refresh and try again.");
    }
  }
  await logActivity(tx, { businessId: user.businessId, type: "invoice.created", entityType: "Invoice", entityId: inv.id, actorType: user.id ? "USER" : "SYSTEM", actorUserId: user.id ?? undefined, clientId: input.clientId, jobId: input.jobId ?? undefined });
  return inv;
}

const chargeInclude = { visit: { include: { job: true, snowEvent: true } } } satisfies Prisma.VisitChargeInclude;
type ChargeRow = Prisma.VisitChargeGetPayload<{ include: typeof chargeInclude }>;
const chargeLines = (charges: ChargeRow[]): LineIn[] => charges.map((c) => ({
  name: c.visit.snowEvent ? `${c.name} · ${c.visit.snowEvent.name}${c.visit.pushNumber && c.visit.pushNumber > 1 ? ` (push ${c.visit.pushNumber})` : ""}` : c.name,
  quantity: Number(c.quantity), unitPriceCents: c.unitPriceCents, totalCents: c.totalCents,
  serviceDate: c.visit.scheduledDate, jobId: c.visit.jobId, visitId: c.visitId, chargeId: c.id,
}));

/** Draft invoice for a client's unbilled charges (optionally only one job, visit or storm). */
export async function invoiceUnbilled(user: Actor, where: { clientId: string; jobId?: string; visitId?: string; snowEventId?: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    const charges = await t.visitCharge.findMany({
      where: {
        businessId: user.businessId, invoiceLineItemId: null,
        visit: { job: { clientId: where.clientId }, ...(where.jobId ? { jobId: where.jobId } : {}), ...(where.visitId ? { id: where.visitId } : {}), ...(where.snowEventId ? { snowEventId: where.snowEventId } : {}) },
      },
      include: chargeInclude, orderBy: { createdAt: "asc" },
    });
    const jobs = [...new Set(charges.map((c) => c.visit.jobId))];
    const first = charges[0]?.visit;
    return createDraft(t, user, {
      clientId: where.clientId, propertyId: first?.propertyId, jobId: jobs.length === 1 ? jobs[0] : null, snowEventId: where.snowEventId ?? null,
      subject: where.snowEventId && first?.snowEvent ? `Snow clearing · ${first.snowEvent.name}` : jobs.length === 1 ? first!.job.title : "Services",
      lines: chargeLines(charges),
    });
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Fixed-price job: invoice the job's line items once. */
export async function invoiceFixedJob(user: Actor, jobId: string) {
  return db.$transaction(async (tx) => {
    const job = await tx.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
    if (job.billingType !== "FIXED_PRICE") throw new TransitionError("This job is billed per visit");
    if (await tx.invoice.count({ where: { jobId, status: { not: "VOID" } } })) throw new TransitionError("This job already has an invoice");
    return createDraft(tx, user, {
      clientId: job.clientId, propertyId: job.propertyId, jobId, subject: job.title,
      lines: job.lineItems.map((l) => ({ name: l.name, quantity: Number(l.quantity), unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, jobId })),
    });
  });
}

/** Billing run: one draft per client for everything unbilled (snow-plan charges grouped per storm). */
export async function billingRun(user: Actor) {
  const groups = await db.visitCharge.findMany({
    where: { businessId: user.businessId, invoiceLineItemId: null },
    select: { visit: { select: { snowEventId: true, job: { select: { clientId: true, kind: true } } } } },
  });
  const keys = new Map<string, { clientId: string; snowEventId?: string }>();
  for (const g of groups) {
    const storm = g.visit.job.kind === "SNOW_PLAN" ? g.visit.snowEventId ?? undefined : undefined;
    keys.set(`${g.visit.job.clientId}:${storm ?? ""}`, { clientId: g.visit.job.clientId, snowEventId: storm });
  }
  let made = 0;
  for (const k of keys.values()) { await invoiceUnbilled(user, k); made++; }
  return made;
}

export async function sendInvoice(user: Actor, invoiceId: string, tx?: Tx) {
  const run = async (t: Tx) => {
    const inv = await t.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId }, include: { client: true } });
    if (inv.status === "VOID" || inv.status === "BAD_DEBT") throw new TransitionError("Void invoices can't be sent");
    const today = todayLocal();
    if (inv.status === "DRAFT") {
      await t.invoice.update({ where: { id: inv.id }, data: { status: "AWAITING_PAYMENT", issuedOn: toDbDate(today), dueOn: toDbDate(dueDate(today, inv.paymentTerms)), sentAt: new Date() } });
    }
    await enqueue(t, {
      businessId: user.businessId, template: "invoice.sent", to: inv.client.email, replyTo: env.helpEmail, priority: 3, props: { invoiceId: inv.id },
      dedupeKey: `invoice:${inv.id}:sent:${Date.now()}`, clientId: inv.clientId, entityType: "Invoice", entityId: inv.id,
    });
    await logActivity(t, { businessId: user.businessId, type: "invoice.sent", entityType: "Invoice", entityId: inv.id, actorType: user.id ? "USER" : "SYSTEM", actorUserId: user.id ?? undefined, clientId: inv.clientId, jobId: inv.jobId ?? undefined });
  };
  if (tx) return run(tx);
  await db.$transaction(run);
  kickOutbox();
}

/** Mark a draft as issued without emailing it (handed over in person). */
export async function markSent(user: Actor, invoiceId: string) {
  const inv = await db.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId } });
  if (inv.status !== "DRAFT") return;
  const today = todayLocal();
  await db.invoice.update({ where: { id: inv.id }, data: { status: "AWAITING_PAYMENT", issuedOn: toDbDate(today), dueOn: toDbDate(dueDate(today, inv.paymentTerms)), sentAt: new Date() } });
}

async function recompute(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const agg = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amountCents: true, refundedCents: true } });
  const paid = (agg._sum.amountCents ?? 0) - (agg._sum.refundedCents ?? 0);
  const status = statusAfterPayments(inv.status, inv.totalCents, paid);
  const today = todayLocal();
  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaidCents: paid, status, paidAt: status === "PAID" ? inv.paidAt ?? new Date() : null,
      // A draft paid at the door becomes a real, issued invoice.
      ...(inv.status === "DRAFT" && status === "PAID" ? { issuedOn: toDbDate(today), dueOn: toDbDate(today) } : {}),
    },
  });
}

export async function recordPayment(user: Actor, input: {
  invoiceId: string; method: PaymentMethod; amountCents: number; reference?: string; note?: string;
  stripePaymentIntentId?: string; stripeCheckoutSessionId?: string; feeCents?: number;
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new TransitionError("Enter an amount");
  const result = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: input.invoiceId, businessId: user.businessId } });
    if (inv.status === "VOID") throw new TransitionError("This invoice is void");
    if (input.stripePaymentIntentId && await tx.payment.findUnique({ where: { stripePaymentIntentId: input.stripePaymentIntentId } })) return null; // webhook replay
    const p = await tx.payment.create({
      data: {
        businessId: user.businessId, clientId: inv.clientId, invoiceId: inv.id, method: input.method, amountCents: input.amountCents,
        reference: input.reference || null, note: input.note || null, stripePaymentIntentId: input.stripePaymentIntentId,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId, feeCents: input.feeCents, recordedById: user.id ?? undefined,
      },
    });
    await recompute(tx, inv.id);
    const client = await tx.client.findUniqueOrThrow({ where: { id: inv.clientId } });
    await enqueue(tx, {
      businessId: user.businessId, template: "payment.receipt", to: client.email, replyTo: env.helpEmail, priority: 2, props: { paymentId: p.id },
      dedupeKey: `payment:${p.id}:receipt`, clientId: client.id, entityType: "Payment", entityId: p.id,
    });
    if (input.method === "CARD") {
      for (const to of env.ownerEmails) {
        await enqueue(tx, { businessId: user.businessId, template: "owner.payment_received", to, priority: 4, props: { paymentId: p.id }, dedupeKey: `payment:${p.id}:owner:${to}`, entityType: "Payment", entityId: p.id });
      }
    }
    await logActivity(tx, {
      businessId: user.businessId, type: "payment.received", entityType: "Invoice", entityId: inv.id, actorType: user.id ? "USER" : "SYSTEM",
      actorUserId: user.id ?? undefined, clientId: inv.clientId, jobId: inv.jobId ?? undefined, data: { method: input.method, amountCents: input.amountCents },
    });
    return p;
  });
  kickOutbox();
  return result;
}

/** Undo a manually recorded payment (typo, cheque bounced). Card payments are refunded in Stripe instead. */
export async function deletePayment(user: Actor, paymentId: string) {
  await db.$transaction(async (tx) => {
    const p = await tx.payment.findFirstOrThrow({ where: { id: paymentId, businessId: user.businessId } });
    if (p.method === "CARD") throw new TransitionError("Refund card payments in Stripe");
    await tx.payment.delete({ where: { id: p.id } });
    await recompute(tx, p.invoiceId);
    await logActivity(tx, { businessId: user.businessId, type: "payment.deleted", entityType: "Invoice", entityId: p.invoiceId, actorType: "USER", actorUserId: user.id ?? undefined, clientId: p.clientId, data: { amountCents: p.amountCents } });
  });
}

/** Void: charges go back to unbilled so they can be invoiced again. */
export async function voidInvoice(user: Actor, invoiceId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId }, include: { payments: true } });
    if (inv.payments.length) throw new TransitionError("Remove its payments first");
    await tx.visitCharge.updateMany({ where: { invoiceLineItem: { invoiceId } }, data: { invoiceLineItemId: null } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason || null } });
    await logActivity(tx, { businessId: user.businessId, type: "invoice.voided", entityType: "Invoice", entityId: invoiceId, actorType: "USER", actorUserId: user.id ?? undefined, clientId: inv.clientId });
  });
}

export async function setBadDebt(user: Actor, invoiceId: string, bad: boolean) {
  const inv = await db.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId } });
  if (bad && inv.status !== "AWAITING_PAYMENT") throw new TransitionError("Only unpaid invoices can be written off");
  if (!bad && inv.status !== "BAD_DEBT") return;
  await db.invoice.update({ where: { id: invoiceId }, data: bad ? { status: "BAD_DEBT", badDebtAt: new Date() } : { status: "AWAITING_PAYMENT", badDebtAt: null } });
}
