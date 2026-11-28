// Invoices and payments: unbilled charges -> draft invoice -> send -> payment (cash / e-Transfer / card) -> receipt.
import type { PaymentMethod, PaymentTerms, Prisma } from "@/generated/prisma/client";
import { billingEmail, depositCents, depositCredit, draftEditProblem, dueDate, lateFeeDue, etransferRef, invoiceTotals, invoiceTotalsWithCredits, isCreditLine, statusAfterPayments } from "../billing/invoice";
import { splitOverpayment } from "../billing/adjustments";
import { instalmentKey, instalmentSchedule } from "../billing/instalments";
import { periodKey, periodLabel, periodsDue } from "../billing/periods";
import { dateOnly, todayLocal, toDbDate } from "../dates";
import { db, type Db, type Tx } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity, nextNumber } from "../records";
import { TransitionError } from "../status/visit";
import { parseSettings } from "../settings";
import { qualifyReferral } from "./marketing";
import { autoPayChargeOn, autoPayReady } from "../billing/autopay";
import { stripeEnabled } from "../stripe";

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
  const work = input.lines.map((l) => l.totalCents);
  // A discount agreed on the quote this job came from comes off the job's first invoice, once.
  let discountCents = 0;
  if (jobIds.length === 1) {
    const job = await tx.job.findUnique({ where: { id: jobIds[0] }, select: { discountCents: true } });
    const used = job?.discountCents ? await tx.invoice.count({ where: { status: { not: "VOID" }, discountCents: { gt: 0 }, OR: [{ jobId: jobIds[0] }, { lineItems: { some: { jobId: jobIds[0] } } }] } }) : 1;
    if (job?.discountCents && !used) discountCents = Math.min(job.discountCents, work.reduce((a, b) => a + b, 0));
  }
  // Deposits and credits are money already paid (tax included), so they come off what the work totals WITH tax.
  let owing = invoiceTotals(work, discountCents, biz).totalCents;
  const credits = depositCredit(owing, deposits.map((d) => ({ id: d.id, paidCents: d.amountPaidCents })));
  owing -= credits.reduce((n, c) => n + c.cents, 0);
  // Account credits (referral rewards, overpayments, goodwill) come off next.
  const openCredits = await tx.clientCredit.findMany({ where: { clientId: input.clientId, appliedToInvoiceId: null }, orderBy: { createdAt: "asc" } });
  const creditUse = depositCredit(owing, openCredits.map((c) => ({ id: c.id, paidCents: c.amountCents })));
  const creditCents = [...credits, ...creditUse].reduce((n, c) => n + c.cents, 0);
  input = { ...input, lines: [
    ...input.lines,
    ...credits.map((c) => ({ name: `Less deposit (invoice #${deposits.find((d) => d.id === c.id)!.number})`, quantity: 1, unitPriceCents: -c.cents, totalCents: -c.cents })),
    ...creditUse.map((c) => ({ name: openCredits.find((x) => x.id === c.id)!.reason, quantity: 1, unitPriceCents: -c.cents, totalCents: -c.cents })),
  ] };
  const number = await nextNumber(tx, user.businessId, "INVOICE");
  const totals = invoiceTotalsWithCredits(work, creditCents, discountCents, biz);
  const inv = await tx.invoice.create({
    data: {
      businessId: user.businessId, number, clientId: input.clientId, propertyId: input.propertyId, jobId: input.jobId, snowEventId: input.snowEventId,
      subject: input.subject, instalmentKey: input.instalmentKey, paymentTerms: biz.defaultPaymentTerms, etransferRef: etransferRef(number), allowPartial: parseSettings(biz.settings).allowPartialPayments,
      subtotalCents: totals.subtotalCents, discountCents, taxCents: totals.taxCents, totalCents: totals.totalCents,
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
  // Claim each one only if it is still unused (two invoices made at once can't both take it), and never lose the part
  // this invoice didn't need: what is left of a deposit or a credit stays on the client's account for the next invoice.
  const taken = new TransitionError("A deposit or credit was just used on another invoice. Refresh and try again.");
  for (const c of credits) {
    const d = deposits.find((x) => x.id === c.id)!;
    if ((await tx.invoice.updateMany({ where: { id: d.id, appliedToInvoiceId: null }, data: { appliedToInvoiceId: inv.id } })).count !== 1) throw taken;
    if (c.cents < d.amountPaidCents) await tx.clientCredit.create({ data: { businessId: user.businessId, clientId: input.clientId, amountCents: d.amountPaidCents - c.cents, reason: `Rest of deposit (invoice #${d.number})` } });
  }
  for (const c of creditUse) {
    const row = openCredits.find((x) => x.id === c.id)!;
    if ((await tx.clientCredit.updateMany({ where: { id: row.id, appliedToInvoiceId: null }, data: { appliedToInvoiceId: inv.id, amountCents: c.cents } })).count !== 1) throw taken;
    if (c.cents < row.amountCents) await tx.clientCredit.create({ data: { businessId: user.businessId, clientId: input.clientId, amountCents: row.amountCents - c.cents, reason: row.reason, paymentId: row.paymentId } });
  }
  if (creditUse.length) {
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
    if (job.kind === "RECURRING") throw new TransitionError("This job's fixed price is invoiced automatically each month");
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
  return made + await invoiceRecurringPeriods({ businessId: user.businessId });
}

/**
 * Recurring jobs on a fixed price per month: one draft invoice per month that has come due (periodsDue), whatever the
 * visit count. Same guard as seasonal instalments: each invoice carries a unique instalmentKey ("<jobId>:<YYYY-MM>"),
 * so the hourly run and the billing run can both call this and never bill a month twice (a voided month is not
 * re-issued). Closed jobs are skipped; nothing before the job was created is back-billed.
 */
export async function invoiceRecurringPeriods(where: { businessId?: string; id?: string } = {}) {
  const today = todayLocal();
  const jobs = await db.job.findMany({
    where: { ...where, kind: "RECURRING", billingType: "FIXED_PRICE", closedAt: null, totalCents: { gt: 0 } },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  let made = 0;
  for (const job of jobs) {
    const created = todayLocal(job.createdAt), starts = dateOnly(job.recurrenceStartsOn);
    const due = periodsDue({
      startsOn: starts && starts > created ? starts : created, endsOn: dateOnly(job.recurrenceEndsOn), invoiceDay: job.invoiceDay,
      pausedFrom: dateOnly(job.pausedFrom), pausedUntil: dateOnly(job.pausedUntil),
    }, today);
    for (const p of due) {
      const key = periodKey(job.id, p.period);
      if (await db.invoice.count({ where: { businessId: job.businessId, instalmentKey: key } })) continue;
      try {
        await db.$transaction((tx) => createDraft(tx, { id: null, businessId: job.businessId }, {
          clientId: job.clientId, propertyId: job.propertyId, jobId: job.id, subject: `${job.title} · ${periodLabel(p.period)}`, instalmentKey: key,
          lines: job.lineItems.map((l) => ({ name: l.name, quantity: Number(l.quantity), unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, serviceDate: toDbDate(p.dueOn), jobId: job.id })),
        }));
        made++;
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e; // unique instalmentKey: another run invoiced it first
      }
    }
  }
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

/**
 * Adds the late fee (Settings) to invoices that have earned one. Once per invoice, claimed with a conditional update so two
 * runs can't both add it. The fee is not taxed (a late-payment charge isn't a taxable supply) and never chases a client
 * who turned invoice follow-ups off, has a refund on the invoice, or whose saved card is still being tried.
 */
export async function applyLateFees() {
  const today = todayLocal();
  let added = 0;
  for (const biz of await db.business.findMany({ select: { id: true, settings: true } })) {
    const s = parseSettings(biz.settings);
    if (!s.lateFee) continue;
    const invs = await db.invoice.findMany({
      where: {
        businessId: biz.id, status: "AWAITING_PAYMENT", kind: "STANDARD", lateFeeAppliedAt: null, dueOn: { lt: toDbDate(today) },
        client: { followUpInvoices: true }, payments: { none: { refundedCents: { gt: 0 } } }, OR: [{ autoPayState: null }, { autoPayState: { notIn: ["SCHEDULED", "RETRYING"] } }],
      },
      include: { client: true, _count: { select: { lineItems: true } } },
    });
    for (const inv of invs) {
      const fee = lateFeeDue({ ...inv, dueOn: dateOnly(inv.dueOn) }, today, s);
      if (fee <= 0) continue;
      await db.$transaction(async (tx) => {
        const claimed = await tx.invoice.updateMany({ where: { id: inv.id, lateFeeAppliedAt: null, status: "AWAITING_PAYMENT" }, data: { lateFeeAppliedAt: new Date(), subtotalCents: { increment: fee }, totalCents: { increment: fee } } });
        if (claimed.count !== 1) return;
        await tx.invoiceLineItem.create({ data: { invoiceId: inv.id, name: "Late fee", description: `Unpaid ${s.lateFeeDays} days past the due date`, quantity: 1, unitPriceCents: fee, totalCents: fee, serviceDate: toDbDate(today), sortOrder: inv._count.lineItems } });
        await logActivity(tx, { businessId: biz.id, type: "invoice.late_fee", entityType: "Invoice", entityId: inv.id, actorType: "SYSTEM", clientId: inv.clientId, data: { cents: fee } });
        for (const to of env.ownerEmails) await enqueue(tx, { businessId: biz.id, template: "owner.notice", to, priority: 5, dedupeKey: `invoice:${inv.id}:late-fee:${to}`, props: { title: `Late fee added to invoice #${inv.number}`, body: `${inv.client.firstName} ${inv.client.lastName}: $${(fee / 100).toFixed(2)} added. Their next reminder shows the new balance.`, path: `/invoices/${inv.id}` } });
        added++;
      });
    }
  }
  if (added) kickOutbox();
  return added;
}

/**
 * A draft becomes a real invoice: issued today, due per its terms. Used by every path that issues one (send, mark sent,
 * invoice-on-Done), so they all agree on two things:
 * - nothing left to pay (a deposit or credit covered it) means it is PAID now, not "awaiting payment" forever;
 * - a client who opted in to auto-pay gets the day their card is charged stamped here (the scheduler does the charging).
 *   Not when their email bounces: they couldn't be told first.
 */
export async function issueInvoice(t: Tx, invoiceId: string) {
  const inv = await t.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { client: true } });
  if (inv.status !== "DRAFT") return inv;
  const today = todayLocal(), due = dueDate(today, inv.paymentTerms);
  const settled = inv.totalCents - inv.amountPaidCents <= 0;
  const s = !settled && stripeEnabled() && inv.client.autoPayConsentAt && !inv.client.emailBouncedAt ? parseSettings((await t.business.findUniqueOrThrow({ where: { id: inv.businessId } })).settings) : null;
  const chargeOn = s && autoPayChargeOn({ kind: inv.kind, issuedOn: today, dueOn: due }, autoPayReady(inv.client, s, true), s.autoPayGraceDays);
  return t.invoice.update({
    where: { id: inv.id },
    data: {
      status: settled ? "PAID" : "AWAITING_PAYMENT", paidAt: settled ? new Date() : null, issuedOn: toDbDate(today), dueOn: toDbDate(due), sentAt: new Date(),
      ...(chargeOn ? { autoPayState: "SCHEDULED" as const, autoPayOn: toDbDate(chargeOn) } : {}),
    },
  });
}

export async function sendInvoice(user: Actor, invoiceId: string, tx?: Tx) {
  const run = async (t: Tx) => {
    const inv = await t.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId }, include: { client: true } });
    if (inv.status === "VOID" || inv.status === "BAD_DEBT") throw new TransitionError("Void invoices can't be sent");
    if (inv.status === "DRAFT") await issueInvoice(t, inv.id);
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
  await db.$transaction((tx) => issueInvoice(tx, inv.id));
}

/** Re-derive paid amount and status after a payment or refund changes. */
export const recomputeInvoice = (invoiceId: string, tx: Db = db) => recompute(tx, invoiceId);

async function recompute(tx: Db, invoiceId: string) {
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
  stripePaymentIntentId?: string; stripeCheckoutSessionId?: string; feeCents?: number; unmatchedPaymentId?: string; receivedAt?: Date; tipCents?: number;
}, outerTx?: Tx) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new TransitionError("Enter an amount");
  const run = async (tx: Tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: input.invoiceId, businessId: user.businessId } });
    if (inv.status === "VOID") throw new TransitionError("This invoice is void");
    if (input.stripePaymentIntentId && await tx.payment.findUnique({ where: { stripePaymentIntentId: input.stripePaymentIntentId } })) return null; // webhook replay
    // More than is owed (two payments crossing, an e-Transfer for the wrong amount): the invoice takes its balance and
    // the rest is kept as account credit, linked to this payment. The owner's own form asks first (recordPaymentKeepingExtra).
    const { appliedCents, creditCents: extraCents } = splitOverpayment(inv.totalCents - inv.amountPaidCents, input.amountCents);
    const p = await tx.payment.create({
      data: {
        businessId: user.businessId, clientId: inv.clientId, invoiceId: inv.id, method: input.method, amountCents: appliedCents,
        reference: input.reference || null, note: input.note || null, stripePaymentIntentId: input.stripePaymentIntentId,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId, feeCents: input.feeCents, tipCents: input.tipCents || null, recordedById: user.id ?? undefined,
        unmatchedPaymentId: input.unmatchedPaymentId, ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      },
    });
    if (extraCents > 0) {
      const reason = `Credit from overpayment on invoice #${inv.number}`;
      await tx.clientCredit.create({ data: { businessId: user.businessId, clientId: inv.clientId, amountCents: extraCents, reason, paymentId: p.id } });
      await logActivity(tx, { businessId: user.businessId, type: "payment.credit_added", entityType: "Client", entityId: inv.clientId, actorType: user.id ? "USER" : "SYSTEM", actorUserId: user.id ?? undefined, clientId: inv.clientId, data: { amountCents: extraCents, reason } });
      for (const to of env.ownerEmails) await enqueue(tx, { businessId: user.businessId, template: "owner.notice", to, priority: 4, dedupeKey: `payment:${p.id}:overpaid:${to}`, props: { title: `Invoice #${inv.number} was overpaid`, body: `$${(extraCents / 100).toFixed(2)} more than it owed came in. It is saved as account credit and comes off their next invoice; refund it instead if you prefer.`, path: `/invoices/${inv.id}` } });
    }
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
      actorUserId: user.id ?? undefined, clientId: inv.clientId, jobId: inv.jobId ?? undefined, data: { method: input.method, amountCents: appliedCents },
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
    if (p.method === "CARD") throw new TransitionError("Card payments can't be removed. Refund it instead.");
    // An overpayment's extra went to account credit: it leaves with the payment, unless it has been spent.
    const extra = await tx.clientCredit.findMany({ where: { paymentId: p.id } });
    if (extra.some((c) => c.appliedToInvoiceId)) throw new TransitionError("The extra from this payment was already used as credit on another invoice. Refund it instead.");
    await tx.clientCredit.deleteMany({ where: { paymentId: p.id } });
    await tx.payment.delete({ where: { id: p.id } });
    await recompute(tx, p.invoiceId);
    await logActivity(tx, { businessId: user.businessId, type: "payment.deleted", entityType: "Invoice", entityId: p.invoiceId, actorType: "USER", actorUserId: user.id ?? undefined, clientId: p.clientId, data: { amountCents: p.amountCents } });
  });
}

/** Void: charges go back to unbilled so they can be invoiced again. */
export async function voidInvoice(user: Actor, invoiceId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, businessId: user.businessId }, include: { payments: true } });
    if (inv.payments.some((p) => p.refundedCents < p.amountCents)) throw new TransitionError("Remove or refund its payments first"); // fully refunded payments hold no money
    await tx.visitCharge.updateMany({ where: { invoiceLineItem: { invoiceId } }, data: { invoiceLineItemId: null } });
    // Deposits and account credits this invoice used up go back to unused, so the re-issued invoice gets them again.
    const negatives = await tx.invoiceLineItem.findMany({ where: { invoiceId, totalCents: { lt: 0 } } });
    for (const d of await tx.invoice.findMany({ where: { kind: "DEPOSIT", appliedToInvoiceId: invoiceId } })) {
      const used = -(negatives.find((l) => l.name === `Less deposit (invoice #${d.number})`)?.totalCents ?? -d.amountPaidCents);
      if (used >= d.amountPaidCents) await tx.invoice.update({ where: { id: d.id }, data: { appliedToInvoiceId: null } });
      else if (used > 0) await tx.clientCredit.create({ data: { businessId: user.businessId, clientId: inv.clientId, amountCents: used, reason: `Deposit returned (void invoice #${inv.number})` } });
    }
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
    const totals = invoiceTotalsWithCredits(lines.map((l) => l.totalCents), -credits.reduce((n, c) => n + c.totalCents, 0), input.discountCents, biz);
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
