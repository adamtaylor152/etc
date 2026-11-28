// Quotes (estimates): build -> send -> client approves / asks for changes -> convert to a job.
// Photos the client sent with the request stay linked (requestId) and show on the quote and the job.
import { createDepositInvoice } from "./invoices";
import { addDays, todayLocal, toDbDate } from "../dates";
import { db, type Tx } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity, nextNumber } from "../records";
import { assertQuoteTransition, quoteEditable, quoteTotal, quoteTotals, type QuoteLine } from "../status/quote";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };
export type QuoteLineInput = { name: string; description?: string; quantity: number; unitPriceCents: number; isOptional: boolean; isSelected: boolean };

/** Stored money fields for a quote: subtotal before discount, GST, and the total the client pays. */
async function money(tx: Tx, businessId: string, lines: QuoteLine[], discountCents: number) {
  const { subtotalCents, taxCents, totalCents } = quoteTotals(lines, discountCents, await tx.business.findUniqueOrThrow({ where: { id: businessId } }));
  return { subtotalCents, taxCents, totalCents };
}

const lineRows = (lines: QuoteLineInput[]) => lines.map((l, i) => ({
  name: l.name, description: l.description || null, quantity: l.quantity, unitPriceCents: l.unitPriceCents,
  totalCents: Math.round(l.quantity * l.unitPriceCents), isOptional: l.isOptional, isSelected: l.isOptional ? l.isSelected : true, sortOrder: i,
}));

export async function createQuote(user: Actor, input: { clientId: string; propertyId?: string | null; requestId?: string | null; title: string; message?: string; lines: QuoteLineInput[] }) {
  await db.client.findFirstOrThrow({ where: { id: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const rows = lineRows(input.lines);
    const q = await tx.quote.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "QUOTE"), clientId: input.clientId,
        propertyId: input.propertyId, requestId: input.requestId, title: input.title, message: input.message || null,
        ...(await money(tx, user.businessId, rows, 0)), validUntil: toDbDate(addDays(todayLocal(), 30)), lineItems: { create: rows },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "quote.created", entityType: "Quote", entityId: q.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId });
    return q;
  });
}

export async function updateQuote(user: Actor, quoteId: string, input: { title: string; message?: string; validUntil: string | null; discountCents: number; lines: QuoteLineInput[]; deposit?: { type: string; value: number; required: boolean } }) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId } });
    if (!quoteEditable(q.status)) throw new TransitionError("Only draft quotes (or ones the client asked to change) can be edited");
    const rows = lineRows(input.lines);
    await tx.quoteLineItem.deleteMany({ where: { quoteId } });
    await tx.quoteLineItem.createMany({ data: rows.map((r) => ({ ...r, quoteId })) });
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        title: input.title, message: input.message || null, validUntil: input.validUntil ? toDbDate(input.validUntil) : null, discountCents: input.discountCents, ...(await money(tx, user.businessId, rows, input.discountCents)),
        ...(input.deposit ? { depositType: ["PERCENT", "FIXED"].includes(input.deposit.type) ? input.deposit.type : "NONE", depositValue: Math.max(0, Math.round(input.deposit.value)), depositRequired: input.deposit.required } : {}),
      },
    });
  });
}

export async function sendQuote(user: Actor, quoteId: string) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId }, include: { client: true, lineItems: true } });
    if (!q.lineItems.length) throw new TransitionError("Add at least one line item");
    assertQuoteTransition(q.status, "AWAITING_RESPONSE");
    await tx.quote.update({ where: { id: quoteId }, data: { status: "AWAITING_RESPONSE", sentAt: q.sentAt ?? new Date(), changesRequestedAt: null } });
    await enqueue(tx, {
      businessId: user.businessId, template: "quote.sent", to: q.client.email, replyTo: env.helpEmail, priority: 3, props: { quoteId },
      dedupeKey: `quote:${quoteId}:sent:${Date.now()}`, clientId: q.clientId, entityType: "Quote", entityId: quoteId,
    });
    await logActivity(tx, { businessId: user.businessId, type: "quote.sent", entityType: "Quote", entityId: quoteId, actorType: "USER", actorUserId: user.id, clientId: q.clientId });
  });
  kickOutbox();
}

async function notifyOwners(tx: Tx, businessId: string, title: string, body: string, path: string, key: string) {
  for (const to of env.ownerEmails) {
    await enqueue(tx, { businessId, template: "owner.notice", to, priority: 3, props: { title, body, path }, dedupeKey: `${key}:${to}` });
  }
}

/** Client approves on /q/[token]. `selected` = optional line ids they ticked. */
export async function approveQuote(quoteId: string, input: { name: string; selected: string[]; ip: string | null }) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lineItems: true, client: true } });
    assertQuoteTransition(q.status, "APPROVED");
    for (const l of q.lineItems.filter((l) => l.isOptional)) {
      await tx.quoteLineItem.update({ where: { id: l.id }, data: { isSelected: input.selected.includes(l.id) } });
    }
    const lines = q.lineItems.map((l) => ({ ...l, isSelected: !l.isOptional || input.selected.includes(l.id) }));
    await tx.quote.update({ where: { id: quoteId }, data: { status: "APPROVED", approvedAt: new Date(), approvedByName: input.name, approvedIp: input.ip, ...(await money(tx, q.businessId, lines, q.discountCents)) } });
    await logActivity(tx, { businessId: q.businessId, type: "quote.approved", entityType: "Quote", entityId: quoteId, actorType: "CLIENT", actorClientId: q.clientId, clientId: q.clientId, data: { name: input.name } });
    await createDepositInvoice(tx, quoteId);
    await notifyOwners(tx, q.businessId, `Quote #${q.number} approved`, `${input.name} approved "${q.title}". Convert it to a job and book a date.`, `/quotes/${quoteId}`, `quote:${quoteId}:approved`);
    await enqueue(tx, {
      businessId: q.businessId, template: "quote.approved", to: q.client.email, replyTo: env.helpEmail, priority: 3, props: { quoteId },
      dedupeKey: `quote:${quoteId}:approved-client`, clientId: q.clientId, entityType: "Quote", entityId: quoteId,
    });
  });
  kickOutbox();
}

export async function requestQuoteChanges(quoteId: string, message: string) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
    assertQuoteTransition(q.status, "CHANGES_REQUESTED");
    await tx.quote.update({ where: { id: quoteId }, data: { status: "CHANGES_REQUESTED", changesRequestedAt: new Date(), changeRequestMessage: message } });
    await logActivity(tx, { businessId: q.businessId, type: "quote.changes_requested", entityType: "Quote", entityId: quoteId, actorType: "CLIENT", actorClientId: q.clientId, clientId: q.clientId, data: { message } });
    await notifyOwners(tx, q.businessId, `Changes requested on quote #${q.number}`, message, `/quotes/${quoteId}`, `quote:${quoteId}:changes:${Date.now()}`);
  });
  kickOutbox();
}

export async function markQuoteApproved(user: Actor, quoteId: string) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId } });
    assertQuoteTransition(q.status, "APPROVED");
    await tx.quote.update({ where: { id: quoteId }, data: { status: "APPROVED", approvedAt: new Date(), approvedByName: "Approved by phone/in person" } });
    await createDepositInvoice(tx, quoteId);
    await logActivity(tx, { businessId: user.businessId, type: "quote.approved", entityType: "Quote", entityId: quoteId, actorType: "USER", actorUserId: user.id, clientId: q.clientId });
  });
}

/** Approved quote -> one-off job with the chosen lines and a visit to schedule. */
export async function convertQuote(user: Actor, quoteId: string, input: { date: string | null; billingType: "PER_VISIT" | "FIXED_PRICE"; skipDeposit?: boolean }) {
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId }, include: { lineItems: { orderBy: { sortOrder: "asc" } }, request: true } });
    assertQuoteTransition(q.status, "CONVERTED");
    if (q.depositRequired && !input.skipDeposit) {
      const unpaid = await tx.invoice.findFirst({ where: { kind: "DEPOSIT", quoteId: q.id, status: { notIn: ["PAID", "VOID"] } } });
      if (unpaid) throw new TransitionError(`The deposit (invoice #${unpaid.number}) hasn't been paid yet. Tick "book without the deposit" to go ahead anyway.`);
    }
    const propertyId = q.propertyId ?? q.request?.propertyId ?? (await tx.property.findFirst({ where: { clientId: q.clientId, archivedAt: null }, orderBy: { isDefault: "desc" } }))?.id;
    if (!propertyId) throw new TransitionError("The client needs an address first");
    const prop = await tx.property.findUniqueOrThrow({ where: { id: propertyId } });
    const lines = q.lineItems.filter((l) => !l.isOptional || l.isSelected);
    const job = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: q.clientId, propertyId, requestId: q.requestId,
        quoteId: q.id, kind: "ONE_OFF", title: q.title ?? "Job", billingType: input.billingType,
        invoiceSchedule: input.billingType === "PER_VISIT" ? "AFTER_EACH_VISIT" : "ON_COMPLETION",
        totalCents: input.billingType === "FIXED_PRICE" ? quoteTotal(q.lineItems, q.discountCents) : null, // pre-tax: the invoice adds GST itself
        lineItems: { create: lines.map((l, i) => ({ name: l.name, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, perVisit: input.billingType === "PER_VISIT", sortOrder: i })) },
        visits: { create: [{ businessId: user.businessId, propertyId, scheduledDate: input.date ? toDbDate(input.date) : null, routeSort: prop.routeSort }] },
      },
    });
    await tx.quote.update({ where: { id: q.id }, data: { status: "CONVERTED", convertedAt: new Date(), jobId: job.id } });
    if (q.requestId) await tx.request.update({ where: { id: q.requestId }, data: { status: "CONVERTED", convertedAt: new Date() } });
    await tx.attachment.updateMany({ where: { quoteId: q.id, jobId: null }, data: { jobId: job.id } });
    await logActivity(tx, { businessId: user.businessId, type: "quote.converted", entityType: "Quote", entityId: q.id, actorType: "USER", actorUserId: user.id, clientId: q.clientId, jobId: job.id });
    return job;
  });
}

export async function archiveQuote(user: Actor, quoteId: string) {
  const q = await db.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId } });
  assertQuoteTransition(q.status, "ARCHIVED");
  await db.quote.update({ where: { id: quoteId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
}
