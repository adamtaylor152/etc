// Quotes (estimates): build -> send -> client approves / asks for changes -> convert to a job.
// Photos the client sent with the request stay linked (requestId) and show on the quote and the job.
import { createDepositInvoice } from "./invoices";
import { addDays, todayLocal, toDbDate } from "../dates";
import { db, type Tx } from "../db";
import { z } from "zod";
import { enqueue, enqueueSms, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { clientName } from "../queries";
import { logActivity, nextNumber } from "../records";
import { smsEnabled } from "../sms";
import { assertQuoteTransition, quoteDiscountCents, quoteEditable, quoteTotal, quoteTotals, type QuoteDiscount, type QuoteLine } from "../status/quote";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };
export type QuoteLineInput = { name: string; description?: string; quantity: number; unitPriceCents: number; isOptional: boolean; isSelected: boolean };

export type DiscountInput = { type: string; value: number }; // value: cents, or percent x100
const discountOf = (d: DiscountInput): QuoteDiscount => (d.type === "PERCENT"
  ? { discountType: "PERCENT", discountValue: Math.min(10_000, Math.max(0, Math.round(d.value))), discountCents: 0 }
  : { discountType: "FIXED", discountValue: Math.max(0, Math.round(d.value)), discountCents: Math.max(0, Math.round(d.value)) });

/** Stored money fields for a quote: subtotal before discount, the discount in dollars, GST, and the total the client pays. */
async function money(tx: Tx, businessId: string, lines: QuoteLine[], d: QuoteDiscount) {
  const discountCents = quoteDiscountCents(lines, d);
  const { subtotalCents, taxCents, totalCents } = quoteTotals(lines, discountCents, await tx.business.findUniqueOrThrow({ where: { id: businessId } }));
  return { subtotalCents, discountCents, taxCents, totalCents };
}

const lineRows = (lines: QuoteLineInput[]) => lines.map((l, i) => ({
  name: l.name, description: l.description || null, quantity: l.quantity, unitPriceCents: l.unitPriceCents,
  totalCents: Math.round(l.quantity * l.unitPriceCents), isOptional: l.isOptional, isSelected: l.isOptional ? l.isSelected : true, sortOrder: i,
}));

/** `from`: a template or another quote ("create similar") whose discount and deposit settings carry over; the lines come from the form. */
export async function createQuote(user: Actor, input: { clientId: string; propertyId?: string | null; requestId?: string | null; title: string; message?: string; lines: QuoteLineInput[]; from?: { templateId?: string; quoteId?: string } }) {
  await db.client.findFirstOrThrow({ where: { id: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const rows = lineRows(input.lines);
    const tpl = input.from?.templateId ? await tx.quoteTemplate.findFirst({ where: { id: input.from.templateId, businessId: user.businessId } }) : null;
    const like = input.from?.quoteId ? await tx.quote.findFirst({ where: { id: input.from.quoteId, businessId: user.businessId } }) : null;
    const src = tpl ?? like;
    const d = discountOf(src ? { type: src.discountType, value: like && like.discountType !== "PERCENT" ? like.discountCents : src.discountValue } : { type: "FIXED", value: 0 });
    const q = await tx.quote.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "QUOTE"), clientId: input.clientId,
        propertyId: input.propertyId, requestId: input.requestId, title: input.title, message: input.message || null,
        discountType: d.discountType, discountValue: d.discountValue, ...(await money(tx, user.businessId, rows, d)),
        ...(src ? { depositType: src.depositType, depositValue: src.depositValue, depositRequired: src.depositRequired } : {}),
        validUntil: toDbDate(addDays(todayLocal(), 30)), lineItems: { create: rows },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "quote.created", entityType: "Quote", entityId: q.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId });
    return q;
  });
}

export async function updateQuote(user: Actor, quoteId: string, input: { title: string; message?: string; validUntil: string | null; discount: DiscountInput; lines: QuoteLineInput[]; deposit?: { type: string; value: number; required: boolean } }) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId } });
    if (!quoteEditable(q.status)) throw new TransitionError("Only draft quotes (or ones the client asked to change) can be edited");
    const rows = lineRows(input.lines);
    const d = discountOf(input.discount);
    await tx.quoteLineItem.deleteMany({ where: { quoteId } });
    await tx.quoteLineItem.createMany({ data: rows.map((r) => ({ ...r, quoteId })) });
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        title: input.title, message: input.message || null, validUntil: input.validUntil ? toDbDate(input.validUntil) : null,
        discountType: d.discountType, discountValue: d.discountValue, ...(await money(tx, user.businessId, rows, d)),
        ...(input.deposit ? { depositType: ["PERCENT", "FIXED"].includes(input.deposit.type) ? input.deposit.type : "NONE", depositValue: Math.max(0, Math.round(input.deposit.value)), depositRequired: input.deposit.required } : {}),
      },
    });
  });
}

/** `via`: email (default) or a text with the same tokenized link. Texts follow the usual consent rules (enqueueSms). */
export async function sendQuote(user: Actor, quoteId: string, via: "EMAIL" | "SMS" = "EMAIL") {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId }, include: { client: true, lineItems: true } });
    if (!q.lineItems.length) throw new TransitionError("Add at least one line item");
    assertQuoteTransition(q.status, "AWAITING_RESPONSE");
    await tx.quote.update({ where: { id: quoteId }, data: { status: "AWAITING_RESPONSE", sentAt: q.sentAt ?? new Date(), lastSentAt: new Date(), lastSentVia: via, changesRequestedAt: null } });
    if (via === "SMS") {
      if (!smsEnabled()) throw new TransitionError("Texting isn't set up yet (Telnyx key missing)");
      const queued = await enqueueSms(tx, { businessId: user.businessId, template: "sms.quote", client: q.client, props: { quoteId }, dedupeKey: `quote:${quoteId}:sent-sms:${Date.now()}`, entityType: "Quote", entityId: quoteId });
      if (!queued) throw new TransitionError(`${q.client.firstName} hasn't agreed to texts, texted STOP, or has no mobile number. Send it by email instead.`);
    } else {
      await enqueue(tx, {
        businessId: user.businessId, template: "quote.sent", to: q.client.email, replyTo: env.helpEmail, priority: 3, props: { quoteId },
        dedupeKey: `quote:${quoteId}:sent:${Date.now()}`, clientId: q.clientId, entityType: "Quote", entityId: quoteId,
      });
    }
    await logActivity(tx, { businessId: user.businessId, type: "quote.sent", entityType: "Quote", entityId: quoteId, actorType: "USER", actorUserId: user.id, clientId: q.clientId, data: { via } });
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
    await tx.quote.update({ where: { id: quoteId }, data: { status: "APPROVED", approvedAt: new Date(), approvedByName: input.name, approvedIp: input.ip, ...(await money(tx, q.businessId, lines, q)) } }); // a percent discount follows what they ticked
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

/** The client declines on /q/[token] (owners are told), or the owner marks the quote lost (`user`). The reason is optional. */
export async function declineQuote(quoteId: string, reason: string, user?: Actor) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, ...(user ? { businessId: user.businessId } : {}) }, include: { client: true } });
    assertQuoteTransition(q.status, "DECLINED");
    await tx.quote.update({ where: { id: quoteId }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason || null } });
    await logActivity(tx, {
      businessId: q.businessId, type: "quote.declined", entityType: "Quote", entityId: quoteId, clientId: q.clientId, data: { reason },
      ...(user ? { actorType: "USER" as const, actorUserId: user.id } : { actorType: "CLIENT" as const, actorClientId: q.clientId }),
    });
    if (!user) await notifyOwners(tx, q.businessId, `Quote #${q.number} declined`, `${clientName(q.client)} declined "${q.title}".${reason ? `\nReason: ${reason}` : " No reason given."}`, `/quotes/${quoteId}`, `quote:${quoteId}:declined:${Date.now()}`);
  });
  if (!user) kickOutbox();
}

/** Declined -> draft, to rework and send again. Safe because a declined quote has no signature, deposit invoice or job. */
export async function reopenQuote(user: Actor, quoteId: string) {
  await db.$transaction(async (tx) => {
    const q = await tx.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId } });
    assertQuoteTransition(q.status, "DRAFT");
    await tx.quote.update({ where: { id: quoteId }, data: { status: "DRAFT", declinedAt: null, declineReason: null } });
    await logActivity(tx, { businessId: user.businessId, type: "quote.reopened", entityType: "Quote", entityId: quoteId, actorType: "USER", actorUserId: user.id, clientId: q.clientId });
  });
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

// ---------- templates ----------
const TEMPLATE_MAX = 30;
const TemplateLines = z.array(z.object({ name: z.string(), description: z.string().optional(), quantity: z.number(), unitPriceCents: z.number(), isOptional: z.boolean(), isSelected: z.boolean() }));
/** A template's stored lines (JSON), ready for the quote form. Anything malformed reads as no lines. */
export const templateLines = (raw: unknown): QuoteLineInput[] => TemplateLines.safeParse(raw).data ?? [];

/** Save a quote's title, message, lines, discount and deposit settings under a name. Saving under an existing name replaces it. */
export async function saveQuoteTemplate(user: Actor, quoteId: string, name: string) {
  const q = await db.quote.findFirstOrThrow({ where: { id: quoteId, businessId: user.businessId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  const key = { businessId_name: { businessId: user.businessId, name } };
  if (!(await db.quoteTemplate.findUnique({ where: key })) && (await db.quoteTemplate.count({ where: { businessId: user.businessId } })) >= TEMPLATE_MAX) {
    throw new TransitionError(`You can keep up to ${TEMPLATE_MAX} quote templates. Delete one in Settings first.`);
  }
  const data = {
    title: q.title, message: q.message, depositType: q.depositType, depositValue: q.depositValue, depositRequired: q.depositRequired,
    discountType: q.discountType, discountValue: q.discountType === "PERCENT" ? q.discountValue : q.discountCents,
    lines: q.lineItems.map((l) => ({ name: l.name, description: l.description ?? "", quantity: Number(l.quantity), unitPriceCents: l.unitPriceCents, isOptional: l.isOptional, isSelected: l.isSelected })),
  };
  await db.quoteTemplate.upsert({ where: key, create: { ...data, businessId: user.businessId, name }, update: data });
}

export async function renameQuoteTemplate(user: Actor, id: string, name: string) {
  if (await db.quoteTemplate.findFirst({ where: { businessId: user.businessId, name, id: { not: id } } })) throw new TransitionError(`There's already a template called "${name}"`);
  await db.quoteTemplate.updateMany({ where: { id, businessId: user.businessId }, data: { name } });
}

export async function deleteQuoteTemplate(user: Actor, id: string) {
  await db.quoteTemplate.deleteMany({ where: { id, businessId: user.businessId } });
}
