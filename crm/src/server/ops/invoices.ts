// Invoices and payments: unbilled charges -> draft invoice -> send -> payment (cash / e-Transfer / card) -> receipt.
import type { PaymentMethod, PaymentTerms, Prisma } from "@/generated/prisma/client";
import { billingEmail, depositCents, depositCredit, draftEditProblem, dueDate, etransferRef, invoiceTotals, isCreditLine, statusAfterPayments } from "../billing/invoice";
import { instalmentKey, instalmentSchedule } from "../billing/instalments";
import { dateOnly, todayLocal, toDbDate } from "../dates";
import { db, type Tx } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity, nextNumber } from "../records";
import { TransitionError } from "../status/visit";
import { parseSettings } from "../settings";
import { qualifyReferral } from "./marketing";

/** Address for invoices, receipts and reminders (see billingEmail). */
export const billingEmailFor = async (tx: Tx, client: { id: string; email: string }) =>
  billingEmail(client.email, await tx.clientContact.findMany({ where: { clientId: client.id }, orderBy: { id: "asc" } }));

type Actor = { id: string; businessId: string } | { id: null; businessId: string }; // id null = system (Stripe webhook)
type LineIn = { name: string; quantity: number; unitPriceCents: number; totalCents: number; serviceDate?: Date | null; jobId?: string | null; visitId?: string | null; chargeId?: string };

async function createDraft(tx: Tx, user: Actor, input: {
  clientId: string; propertyId?: string | null; jobId?: string | null; snowEventId?: string | null; subject: string; lines: LineIn[];
  instalmentKey?: string;
}) {
  if (!input.lines.length) throw new TransitionError("Nothing to invoice");
  const biz = await tx.business.findUniqueOrThrow({ where: { id: user.businessId } });
  // Paid deposits on these jobs' quotes become credit lines ("Less deposit"), each used once.
  const jobIds = [...new Set([input.jobId, ...input.lines.map((l) => l.jobId)].filter((x): x is string => !!x))];
  const quotes = jobIds.length ? await tx.quote.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } }) : [];
  const deposits = quotes.length ? await tx.invoice.findMany({ where: { kind: "DEPOSIT", quoteId: { in: quotes.map((q) => q.id) }, appliedToInvoiceId: null, amountPaidCents: { gt: 0 } }, orderBy: { number: "asc" } }) : [];
  const credits = depositCredit(input.lines.reduce((n, l) => n + l.totalCents, 0), deposits.map((d) => ({ id: d.id, paidCents: d.amountPaidCents })));
  input = { ...input, lines: [...input.lines, ...credits.map((c) => ({ name: `Less deposit (invoice #${deposits.find((d) => d.id === c.id)!.number})`, quantity: 1, unitPriceCents: -c.cents, totalCents: -c.cents }))] };
  // Account credits (referral rewards) come off next, each used once.
  const openCredits = await tx.clientCredit.findMany({ where: { clientId: input.clientId, appliedToInvoiceId: null }, orderBy: { createdAt: "asc" } });
  const creditUse = depositCredit(input.lines.reduce((n, l) => n + l.totalCents, 0), openCredits.map((c) => ({ id: c.id, paidCents: c.amountCents })));
  input = { ...input, lines: [...input.lines, ...creditUse.map((c) => ({ name: openCredits.find((x) => x.id === c.id)!.reason, quantity: 1, unitPriceCents: -c.cents, totalCents: -c.cents }))] };
  const number = await nextNumber(tx, user.businessId, "INVOICE");
  const totals = invoiceTotals(input.lines.map((l) => l.totalCents), 0, biz);
  const inv = await tx.invoice.create({
    data: {
      businessId: user.businessId, number, clientId: input.clientId, propertyId: input.propertyId, jobId: input.jobId, snowEventId: input.snowEventId,
      subject: input.subject, instalmentKey: input.instalmentKey, paymentTerms: biz.defaultPaymentTerms, etransferRef: etransferRef(number), allowPartial: parseSettings(biz.settings).allowPartialPayments,
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
  if (credits.length) await tx.invoice.updateMany({ where: { id: { in: credits.map((c) => c.id) } }, data: { appliedToInvoiceId: inv.id } });
  if (creditUse.length) {
    await tx.clientCredit.updateMany({ where: { id: { in: creditUse.map((c) => c.id) } }, data: { appliedToInvoiceId: inv.id } });
    const refIds = openCredits.filter((c) => creditUse.some((u) => u.id === c.id) && c.referralId).map((c) => c.referralId!);
    if (refIds.length) await tx.referral.updateMany({ where: { id: { in: refIds }, status: "QUALIFIED" }, data: { status: "REWARDED" } });
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
/** A hand-made invoice (Create → Invoice): any lines, not tied to visit charges. */
export async function createCustomInvoice(user: Actor & { id: string }, input: { clientId: string; propertyId?: string | null; jobId?: string | null; subject: string; lines: { name: string; quantity: number; unitPriceCents: number; serviceDate?: Date | null }[] }) {
  const client = await db.client.findFirst({ where: { id: input.clientId, businessId: user.businessId } });
  if (!client) throw new TransitionError("Pick a client");
  if (input.jobId && !(await db.job.findFirst({ where: { id: input.jobId, clientId: client.id } }))) throw new TransitionError("That job isn't this client's");
  const lines = input.lines.filter((l) => l.name.trim() && l.quantity > 0).map((l) => ({ ...l, name: l.name.trim().slice(0, 200), totalCents: Math.round(l.quantity * l.unitPriceCents), jobId: input.jobId ?? null }));
  if (!lines.length) throw new TransitionError("Add at least one line");
  return db.$transaction((tx) => createDraft(tx, user, { clientId: client.id, propertyId: input.propertyId, jobId: input.jobId, subject: input.subject.trim() || "Services", lines }));
}

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
  await invoiceSeasonalInstalments({ businessId: user.businessId }); // sent, not drafts: not part of the count
  return made;
}

/**
 * Seasonal snow plans: invoice and send every instalment that has come due. Each invoice carries a unique
 * instalmentKey, so the hourly run, the billing run and saving a plan can all call this and never bill one twice
 * (a voided instalment is not re-issued either). Ended plans are skipped: no more instalments after a plan is cancelled.
 */
export async function invoiceSeasonalInstalments(where: { businessId?: string; id?: string } = {}) {
  const today = todayLocal();
  const jobs = await db.job.findMany({
    where: { ...where, kind: "SNOW_PLAN", snowBillingMode: "SEASONAL", closedAt: null, seasonalPriceCents: { gt: 0 }, seasonalInstalments: { gt: 0 }, seasonalFirstDueOn: { lte: toDbDate(today) } },
    include: { season: true },
  });
  let made = 0;
  for (const job of jobs) {
    const count = job.seasonalInstalments!;
    const system = { id: null, businessId: job.businessId };
    for (const i of instalmentSchedule(job.seasonalPriceCents!, count, dateOnly(job.seasonalFirstDueOn)!)) {
      const key = instalmentKey(job.id, i.n);
      if (i.dueOn > today || (await db.invoice.count({ where: { businessId: job.businessId, instalmentKey: key } }))) continue;
      const name = `Snow clearing · ${job.season?.name ?? "season"}${count > 1 ? ` (instalment ${i.n} of ${count})` : " (full season)"}`;
      try {
        await db.$transaction(async (tx) => {
          const inv = await createDraft(tx, system, {
            clientId: job.clientId, propertyId: job.propertyId, jobId: job.id, subject: name, instalmentKey: key,
            lines: [{ name, quantity: 1, unitPriceCents: i.amountCents, totalCents: i.amountCents, serviceDate: toDbDate(i.dueOn), jobId: job.id }],
          });
          await sendInvoice(system, inv.id, tx);
        });
        made++;
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e; // unique instalmentKey: another run invoiced it first
      }
    }
  }
  if (made) kickOutbox();
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
      businessId: user.businessId, template: "invoice.sent", to: await billingEmailFor(t, inv.client), replyTo: env.helpEmail, priority: 3, props: { invoiceId: inv.id },
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

/** Re-derive paid amount and status after a payment or refund changes. */
export const recomputeInvoice = (invoiceId: string) => recompute(db, invoiceId);

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
  stripePaymentIntentId?: string; stripeCheckoutSessionId?: string; feeCents?: number; unmatchedPaymentId?: string; receivedAt?: Date;
}, outerTx?: Tx) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new TransitionError("Enter an amount");
  const run = async (tx: Tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: input.invoiceId, businessId: user.businessId } });
    if (inv.status === "VOID") throw new TransitionError("This invoice is void");
    if (input.stripePaymentIntentId && await tx.payment.findUnique({ where: { stripePaymentIntentId: input.stripePaymentIntentId } })) return null; // webhook replay
    const p = await tx.payment.create({
      data: {
        businessId: user.businessId, clientId: inv.clientId, invoiceId: inv.id, method: input.method, amountCents: input.amountCents,
        reference: input.reference || null, note: input.note || null, stripePaymentIntentId: input.stripePaymentIntentId,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId, feeCents: input.feeCents, recordedById: user.id ?? undefined,
        unmatchedPaymentId: input.unmatchedPaymentId, ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      },
    });
    await recompute(tx, inv.id);
    await qualifyReferral(tx, inv.clientId);
    const client = await tx.client.findUniqueOrThrow({ where: { id: inv.clientId } });
    await enqueue(tx, {
      businessId: user.businessId, template: "payment.receipt", to: await billingEmailFor(tx, client), replyTo: env.helpEmail, priority: 2, props: { paymentId: p.id },
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
  };
  if (outerTx) return run(outerTx);
  const result = await db.$transaction(run);
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
    // Deposits and account credits this invoice used up go back to unused, so the re-issued invoice gets them again.
    await tx.invoice.updateMany({ where: { kind: "DEPOSIT", appliedToInvoiceId: invoiceId }, data: { appliedToInvoiceId: null } });
    const credits = await tx.clientCredit.findMany({ where: { appliedToInvoiceId: invoiceId } });
    await tx.clientCredit.updateMany({ where: { appliedToInvoiceId: invoiceId }, data: { appliedToInvoiceId: null } });
    const refIds = credits.flatMap((c) => (c.referralId ? [c.referralId] : []));
    if (refIds.length) await tx.referral.updateMany({ where: { id: { in: refIds }, status: "REWARDED" }, data: { status: "QUALIFIED" } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason || null } });
    await logActivity(tx, { businessId: user.businessId, type: "invoice.voided", entityType: "Invoice", entityId: invoiceId, actorType: "USER", actorUserId: user.id ?? undefined, clientId: inv.clientId });
  });
}

export type DraftLineIn = { id?: string; name: string; description?: string; quantity: number; unitPriceCents: number; serviceDate?: Date | null };
/**
 * Edit a draft: lines, discount, terms, message. Sent invoices stay locked (void and re-issue).
 * A removed line releases its visit charge, exactly as void does, so a later invoice picks it up. A kept line may be
 * re-priced: only the invoice line changes, the charge keeps its own amount and stays linked (still billed, never twice).
 * Credit lines (deposits, account credits) are not touched.
 */
export async function updateDraftInvoice(user: Actor & { id: string }, invoiceId: string, input: { lines: DraftLineIn[]; discountCents: number; paymentTerms: PaymentTerms; message: string }) {
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
    const locked = new TransitionError("Only draft invoices can be edited. Void a sent invoice and re-issue it.");
    if (inv.status !== "DRAFT" || inv.kind !== "STANDARD") throw locked;
    const credits = inv.lineItems.filter(isCreditLine), editable = inv.lineItems.filter((l) => !isCreditLine(l));
    const lines = input.lines.filter((l) => l.name.trim()).map((l) => ({ ...l, name: l.name.trim().slice(0, 200), totalCents: Math.round(l.quantity * l.unitPriceCents) }));
    const ids = lines.flatMap((l) => (l.id ? [l.id] : []));
    if (new Set(ids).size !== ids.length || ids.some((id) => !editable.some((e) => e.id === id))) throw new TransitionError("This invoice changed. Refresh and try again.");
    const biz = await tx.business.findUniqueOrThrow({ where: { id: user.businessId } });
    const problem = draftEditProblem(lines.map((l) => l.totalCents), -credits.reduce((n, c) => n + c.totalCents, 0), input.discountCents, inv.amountPaidCents, biz);
    if (problem) throw new TransitionError(problem);
    const totals = invoiceTotals([...lines, ...credits].map((l) => l.totalCents), input.discountCents, biz);
    // Checked again in the write, so an invoice sent a moment ago can't be changed under the client.
    const res = await tx.invoice.updateMany({
      where: { id: inv.id, status: "DRAFT", kind: "STANDARD" },
      data: { paymentTerms: input.paymentTerms, message: input.message || null, discountCents: input.discountCents, subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents },
    });
    if (res.count !== 1) throw locked;
    const gone = editable.filter((e) => !ids.includes(e.id)).map((e) => e.id);
    await tx.visitCharge.updateMany({ where: { invoiceLineItemId: { in: gone } }, data: { invoiceLineItemId: null } });
    await tx.invoiceLineItem.deleteMany({ where: { id: { in: gone } } });
    for (const [i, l] of lines.entries()) {
      const data = { name: l.name, description: l.description || null, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, serviceDate: l.serviceDate ?? null, sortOrder: i };
      if (l.id) await tx.invoiceLineItem.update({ where: { id: l.id }, data });
      else await tx.invoiceLineItem.create({ data: { ...data, invoiceId: inv.id, jobId: inv.jobId } });
    }
    for (const [i, c] of credits.entries()) await tx.invoiceLineItem.update({ where: { id: c.id }, data: { sortOrder: lines.length + i } });
    if (inv.amountPaidCents) await recompute(tx, inv.id); // a part-paid draft whose new total is covered becomes paid
    await logActivity(tx, { businessId: user.businessId, type: "invoice.edited", entityType: "Invoice", entityId: inv.id, actorType: "USER", actorUserId: user.id, clientId: inv.clientId, jobId: inv.jobId ?? undefined });
  });
}

export async function setBadDebt(user: Actor, invoiceId: string, bad: boolean) {
  const inv = await db.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId } });
  if (bad && inv.status !== "AWAITING_PAYMENT") throw new TransitionError("Only unpaid invoices can be written off");
  if (!bad && inv.status !== "BAD_DEBT") return;
  await db.invoice.update({ where: { id: invoiceId }, data: bad ? { status: "BAD_DEBT", badDebtAt: new Date() } : { status: "AWAITING_PAYMENT", badDebtAt: null } });
}

/** When a client approves a quote with a deposit: a deposit invoice they can pay right away (own ETC- ref for Interac matching). */
export async function createDepositInvoice(tx: Tx, quoteId: string) {
  const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
  const cents = depositCents(q.totalCents, q.depositType, q.depositValue);
  if (cents <= 0 || (await tx.invoice.count({ where: { kind: "DEPOSIT", quoteId } }))) return null;
  const biz = await tx.business.findUniqueOrThrow({ where: { id: q.businessId } });
  const number = await nextNumber(tx, q.businessId, "INVOICE");
  const today = todayLocal();
  const inv = await tx.invoice.create({
    data: {
      businessId: q.businessId, number, clientId: q.clientId, propertyId: q.propertyId, kind: "DEPOSIT", quoteId, subject: `Deposit for quote #${q.number}`,
      paymentTerms: "DUE_ON_RECEIPT", etransferRef: etransferRef(number), status: "AWAITING_PAYMENT", issuedOn: toDbDate(today), dueOn: toDbDate(today), sentAt: new Date(),
      subtotalCents: cents, taxCents: 0, totalCents: cents, allowPartial: false,
      lineItems: { create: [{ name: `Deposit for quote #${q.number}${q.title ? ` (${q.title})` : ""}`, quantity: 1, unitPriceCents: cents, totalCents: cents, sortOrder: 0 }] },
    },
  });
  void biz;
  await logActivity(tx, { businessId: q.businessId, type: "invoice.created", entityType: "Invoice", entityId: inv.id, actorType: "SYSTEM", clientId: q.clientId, data: { deposit: true } });
  return inv;
}
