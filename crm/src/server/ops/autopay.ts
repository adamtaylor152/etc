// Card on file and automatic payments. A client saves a card (Stripe Checkout) and may opt in to automatic charges;
// sendInvoice stamps their invoices with a charge date, and runAutoPay() (hourly) charges the ones that are due.
// Never charged twice: the AutoPayAttempt row (unique on invoice + try number) is claimed BEFORE Stripe is called,
// the Stripe call carries that row's idempotency key, and the payment row is unique on the PaymentIntent id, so two
// scheduler runs, a crash mid-charge, or the webhook racing the direct answer all end in one charge and one payment.
import type { AutoPayAttempt, Client, Invoice } from "@/generated/prisma/client";
import { AUTOPAY_TROUBLE, autoPayDecision, autoPayPending, autoPayReady, cardLabel, chargeOutcome, nextAttemptOn, type ChargeResult } from "../billing/autopay";
import { dateOnly, todayLocal, toDbDate } from "../dates";
import { db, type Db, type Tx } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { money } from "../money";
import { clientName } from "../queries";
import { logActivity } from "../records";
import { getSettings, type Settings } from "../settings";
import { TransitionError } from "../status/visit";
import { cancelPi, cardOf, chargeSavedCard, createCustomer, detachCard, retrievePi, stripeEnabled, stripeFee } from "../stripe";
import { billingEmailFor, recordPayment } from "./invoices";

/** Saved cards and auto-pay exist only with Stripe keys AND the business switch on. */
export const cardsOffered = async (businessId: string) => stripeEnabled() && (await getSettings(db, businessId)).autoPay;

type Who = { actorType: "CLIENT" | "USER" | "SYSTEM"; actorUserId?: string; actorClientId?: string };
const tellOwners = async (tx: Db, businessId: string, key: string, title: string, body: string, path: string) => {
  for (const to of env.ownerEmails) await enqueue(tx, { businessId, template: "owner.notice", to, priority: 2, dedupeKey: `${key}:${to}`, props: { title, body, path } });
};

// ---------- the card and the client's choice ----------

/** The client's Stripe Customer, made on first use. */
export async function customerFor(c: Pick<Client, "id" | "businessId" | "email" | "firstName" | "lastName" | "companyName" | "stripeCustomerId">) {
  if (c.stripeCustomerId) return c.stripeCustomerId;
  const id = await createCustomer({ id: c.id, businessId: c.businessId, email: c.email, name: clientName(c) });
  await db.client.update({ where: { id: c.id }, data: { stripeCustomerId: id } });
  return id;
}

/** Invoices waiting on the card go back to being paid the usual way (and their reminders resume). */
const stopPending = (tx: Tx, clientId: string) =>
  tx.invoice.updateMany({ where: { clientId, autoPayState: { in: ["SCHEDULED", "RETRYING"] } }, data: { autoPayState: "STOPPED", autoPayOn: null } });

/**
 * Webhook: a Checkout that saves a card finished. `autoPay` is the box the client ticked on our page, so it is their
 * consent for this card (stored with when and where). Replays, and cards that aren't on this client's Customer, are ignored.
 */
export async function saveCard(input: { clientId: string; paymentMethodId: string; autoPay: boolean; source: string }) {
  const c = await db.client.findUnique({ where: { id: input.clientId } });
  if (!c || !c.stripeCustomerId || c.cardPaymentMethodId === input.paymentMethodId) return;
  const card = await cardOf(input.paymentMethodId);
  if (!card || card.customerId !== c.stripeCustomerId) return;
  await db.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: c.id },
      data: {
        cardPaymentMethodId: card.id, cardBrand: card.brand, cardLast4: card.last4, cardExpMonth: card.expMonth, cardExpYear: card.expYear, cardSavedAt: new Date(),
        autoPayConsentAt: input.autoPay ? new Date() : null, autoPayConsentSource: input.autoPay ? input.source : null,
      },
    });
    if (!input.autoPay) await stopPending(tx, c.id);
    await logActivity(tx, { businessId: c.businessId, type: "card.saved", entityType: "Client", entityId: c.id, actorType: "CLIENT", actorClientId: c.id, clientId: c.id, data: { reason: `${cardLabel({ cardBrand: card.brand, cardLast4: card.last4 })}${input.autoPay ? ", auto-pay on" : ""}` } });
  });
  if (c.cardPaymentMethodId) await detachCard(c.cardPaymentMethodId); // the card it replaced
}

/** Forget the card (client from their page, owner from the client page, or Stripe says it's gone). Auto-pay goes off with it. */
export async function removeCard(clientId: string, who: Who, detach = true) {
  const c = await db.client.findUniqueOrThrow({ where: { id: clientId } });
  if (!c.cardPaymentMethodId) return;
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id: c.id }, data: { cardPaymentMethodId: null, cardBrand: null, cardLast4: null, cardExpMonth: null, cardExpYear: null, cardSavedAt: null, autoPayConsentAt: null, autoPayConsentSource: null } });
    await stopPending(tx, c.id);
    await logActivity(tx, { businessId: c.businessId, type: "card.removed", entityType: "Client", entityId: c.id, clientId: c.id, ...who });
  });
  if (detach) await detachCard(c.cardPaymentMethodId);
}

/** Webhook payment_method.detached (removed in the Stripe dashboard, or by us a moment ago: then nothing matches). */
export async function cardDetached(paymentMethodId: string) {
  const c = await db.client.findFirst({ where: { cardPaymentMethodId: paymentMethodId } });
  if (c) await removeCard(c.id, { actorType: "SYSTEM" }, false);
}

/** Auto-pay on (only ever by the client, on their own page) or off (client or owner). Off releases invoices already scheduled. */
export async function setAutoPay(clientId: string, on: boolean, who: Who) {
  const c = await db.client.findUniqueOrThrow({ where: { id: clientId } });
  if (on && (who.actorType !== "CLIENT" || !c.cardPaymentMethodId || !(await cardsOffered(c.businessId)))) throw new TransitionError("Save a card first");
  if (on === !!c.autoPayConsentAt) return;
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id: c.id }, data: { autoPayConsentAt: on ? new Date() : null, autoPayConsentSource: on ? "hub" : null } });
    if (!on) await stopPending(tx, c.id);
    await logActivity(tx, { businessId: c.businessId, type: on ? "autopay.on" : "autopay.off", entityType: "Client", entityId: c.id, clientId: c.id, ...who });
  });
}

// ---------- charging ----------

/** The Stripe calls charging makes. Tests pass fakes; nothing else in this file talks to Stripe while charging. */
export type AutoPayDeps = { charge: typeof chargeSavedCard; fee: typeof stripeFee; retrieve: typeof retrievePi; cancel: typeof cancelPi };
const real: AutoPayDeps = { charge: chargeSavedCard, fee: stripeFee, retrieve: retrievePi, cancel: cancelPi };

const STALE_MS = 10 * 60_000; // an attempt with no answer after this long gets looked at again
const REPEATABLE_MS = 23 * 3_600_000; // Stripe remembers an idempotency key for 24 hours: only repeat a request inside that
const BATCH = 25; // per hourly run; the rest wait an hour

const chargeArgs = (a: AutoPayAttempt, inv: Pick<Invoice, "number">, customerId: string) => ({
  attemptId: a.id, invoiceId: a.invoiceId, businessId: a.businessId, number: inv.number, amountCents: a.amountCents,
  customerId, paymentMethodId: a.stripePaymentMethodId, idempotencyKey: `autopay:${a.invoiceId}:${a.n}`,
});

/** Hourly: settle attempts that never got an answer, then charge every auto-pay invoice whose day has come. No-op without Stripe. */
export async function runAutoPay(deps: AutoPayDeps = real, now = new Date(), where: { businessId?: string; clientId?: string } = {}) {
  if (!stripeEnabled()) return;
  const stuck = await db.autoPayAttempt.findMany({ where: { ...where, status: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_MS) } }, include: { invoice: { include: { client: true } } } });
  for (const a of stuck) await reconcile(a, deps, now).catch((e) => console.error(`auto-pay reconcile failed (attempt ${a.id})`, e));
  const today = todayLocal(now);
  const due = await db.invoice.findMany({
    where: { ...where, status: "AWAITING_PAYMENT", autoPayState: { in: ["SCHEDULED", "RETRYING"] }, autoPayOn: { lte: toDbDate(today) } },
    include: { client: true, autoPayAttempts: true }, orderBy: { autoPayOn: "asc" }, take: BATCH,
  });
  const settings = new Map<string, Settings>();
  for (const inv of due) {
    if (!settings.has(inv.businessId)) settings.set(inv.businessId, await getSettings(db, inv.businessId));
    await chargeInvoice(inv, settings.get(inv.businessId)!, today, deps).catch((e) => console.error(`auto-pay failed (invoice ${inv.id})`, e));
  }
}

async function chargeInvoice(inv: Invoice & { client: Client; autoPayAttempts: AutoPayAttempt[] }, settings: Settings, today: string, deps: AutoPayDeps) {
  const c = inv.client, balanceCents = inv.totalCents - inv.amountPaidCents;
  const d = autoPayDecision({ ...inv, balanceCents, autoPayOn: dateOnly(inv.autoPayOn), attempts: inv.autoPayAttempts }, autoPayReady(c, settings, true), today);
  if (d.do === "wait") return;
  if (d.do === "stop") {
    await db.invoice.update({ where: { id: inv.id }, data: { autoPayState: "STOPPED", autoPayOn: null } });
    return;
  }
  let a: AutoPayAttempt;
  try {
    // The claim. A second runner gets a unique violation here and never reaches Stripe.
    a = await db.autoPayAttempt.create({
      data: { businessId: inv.businessId, invoiceId: inv.id, clientId: c.id, n: inv.autoPayAttempts.length + 1, amountCents: balanceCents, stripePaymentMethodId: c.cardPaymentMethodId!, cardLabel: cardLabel(c) ?? "Card" },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return;
    throw e;
  }
  await settleAttempt(a.id, await deps.charge(chargeArgs(a, inv, c.stripeCustomerId!)), deps);
}

/** An attempt with no recorded answer (crash, timeout, Stripe still "processing"): ask Stripe, never guess. */
async function reconcile(a: AutoPayAttempt & { invoice: Invoice & { client: Client } }, deps: AutoPayDeps, now: Date) {
  if (a.stripePaymentIntentId) return settleAttempt(a.id, await deps.retrieve(a.stripePaymentIntentId), deps);
  const customerId = a.invoice.client.stripeCustomerId;
  if (a.invoice.status === "AWAITING_PAYMENT" && customerId && now.getTime() - a.createdAt.getTime() < REPEATABLE_MS) {
    return settleAttempt(a.id, await deps.charge(chargeArgs(a, a.invoice, customerId)), deps); // same key: Stripe replays its first answer, or charges for the first time
  }
  // No answer on file and too late to repeat the request safely.
  await stopForOwner(a, "unknown", "No answer from Stripe", "we never got an answer. Look for the payment in Stripe before collecting it another way.");
}

/**
 * A try that ended without the bank saying yes or no (Stripe never answered, or rejected the request itself): stop this
 * invoice and have a person look before anything else is charged. The client is not emailed: it isn't about their card.
 */
async function stopForOwner(a: AutoPayAttempt & { invoice: Invoice & { client: Client } }, code: string, detail: string, what: string) {
  await db.$transaction(async (tx) => {
    const won = await tx.autoPayAttempt.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "FAILED", finishedAt: new Date(), failureCode: code, failureMessage: detail.slice(0, 300) } });
    if (!won.count) return;
    await tx.invoice.updateMany({ where: { id: a.invoiceId, autoPayState: { in: ["SCHEDULED", "RETRYING"] } }, data: { autoPayState: "FAILED", autoPayOn: null } });
    await tellOwners(tx, a.businessId, `autopay:${a.id}:${code}`, `Check Stripe: auto-pay for invoice #${a.invoice.number}`,
      `We tried to charge ${a.cardLabel} ${money(a.amountCents)} for ${clientName(a.invoice.client)}, but ${what} Nothing more will be charged automatically for this invoice, and the client has not been emailed about it.`, `/invoices/${a.invoiceId}`);
  });
  kickOutbox();
}

/**
 * Record what Stripe said about an attempt. Called with the direct answer, a later retrieve, and the webhook: whichever
 * comes first wins the conditional update, the rest do nothing.
 */
export async function settleAttempt(attemptId: string, r: ChargeResult, deps: AutoPayDeps = real) {
  const a = await db.autoPayAttempt.findUnique({ where: { id: attemptId }, include: { invoice: { include: { client: true } } } });
  if (!a || a.status === "SUCCEEDED") return;
  if (r.piId && r.piId !== a.stripePaymentIntentId) await db.autoPayAttempt.update({ where: { id: a.id }, data: { stripePaymentIntentId: r.piId } });
  const out = chargeOutcome(r), inv = a.invoice, who = clientName(inv.client);
  if (out.kind === "pending" || out.kind === "unknown") return; // stays PENDING: the webhook or the next run settles it
  if (out.kind === "refused") return stopForOwner(a, out.code, r.error?.message ?? out.code, `Stripe rejected the request (${r.error?.message ?? out.code}), so the card was not charged. The saved card may be gone from Stripe; the client can save it again on their page.`);

  if (out.kind === "succeeded") {
    const feeCents = (await deps.fee(r.piId!)) ?? undefined;
    const done = { status: "SUCCEEDED" as const, finishedAt: new Date(), failureCode: null, failureMessage: null };
    try {
      await db.$transaction(async (tx) => {
        const won = await tx.autoPayAttempt.updateMany({ where: { id: a.id, status: { not: "SUCCEEDED" } }, data: done });
        if (!won.count) return;
        await tx.invoice.update({ where: { id: inv.id }, data: { autoPayState: "PAID", autoPayOn: null } });
        // The same path as every other payment: receipt, owner notice, referral, status.
        await recordPayment({ id: null, businessId: a.businessId }, { invoiceId: inv.id, method: "CARD", amountCents: r.amountReceived || a.amountCents, stripePaymentIntentId: r.piId!, reference: `Auto-pay · ${a.cardLabel}`, feeCents }, tx);
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return; // the payment row is already there
      if (!(e instanceof TransitionError)) throw e;
      // Voided while the charge was in flight. The money was taken, so say so rather than lose track of it.
      await db.autoPayAttempt.update({ where: { id: a.id }, data: { ...done, failureMessage: e.message } });
      await tellOwners(db, a.businessId, `autopay:${a.id}:orphan`, `Refund needed: ${money(a.amountCents)} from ${who}`,
        `Invoice #${inv.number} was voided while its automatic payment was going through, so ${a.cardLabel} was charged ${money(a.amountCents)} with no invoice to put it on. Refund it in Stripe.`, `/invoices/${inv.id}`);
    }
    kickOutbox();
    return;
  }

  const needsAction = out.kind === "needs_action";
  if (needsAction && r.status === "requires_action" && r.piId) await deps.cancel(r.piId); // they'll pay from the invoice page instead
  const code = needsAction ? "authentication_required" : out.code;
  await db.$transaction(async (tx) => {
    const won = await tx.autoPayAttempt.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: needsAction ? "REQUIRES_ACTION" : "FAILED", finishedAt: new Date(), failureCode: code, failureMessage: r.error?.message?.slice(0, 300) ?? null } });
    if (!won.count) return;
    const now = await tx.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    if (now.status !== "AWAITING_PAYMENT" || !autoPayPending(now.autoPayState)) return; // paid or released meanwhile: nothing to chase
    const first = await tx.autoPayAttempt.findFirstOrThrow({ where: { invoiceId: inv.id }, orderBy: { n: "asc" } });
    const retryOn = needsAction ? null : nextAttemptOn(todayLocal(first.createdAt), a.n, todayLocal());
    await tx.invoice.update({ where: { id: inv.id }, data: retryOn ? { autoPayState: "RETRYING", autoPayOn: toDbDate(retryOn) } : { autoPayState: needsAction ? "NEEDS_ACTION" : "FAILED", autoPayOn: null } });
    await enqueue(tx, {
      businessId: a.businessId, template: "autopay.failed", to: await billingEmailFor(tx, inv.client), replyTo: env.helpEmail, priority: 3,
      props: { invoiceId: inv.id, card: a.cardLabel, code, retryOn, needsAction }, dedupeKey: `autopay:${a.id}:failed`, clientId: inv.clientId, entityType: "Invoice", entityId: inv.id,
    });
    await logActivity(tx, { businessId: a.businessId, type: "autopay.failed", entityType: "Invoice", entityId: inv.id, clientId: inv.clientId, jobId: inv.jobId ?? undefined, data: { amountCents: a.amountCents, reason: `${a.cardLabel}: ${code}` } });
    // Out of tries (or the bank wants the client): nothing is switched off, but the owner hears about it.
    if (!retryOn) {
      await tellOwners(tx, a.businessId, `autopay:${inv.id}:stopped`, `Auto-pay ${needsAction ? "needs the client" : "failed"}: ${who}, invoice #${inv.number}`,
        needsAction
          ? `${who}'s bank wants them to approve the ${money(a.amountCents)} charge on ${a.cardLabel}, which can't be done automatically. We emailed them a link to pay on the invoice page. Auto-pay stays on for their next invoices.`
          : `We tried ${a.n} times to charge ${a.cardLabel} ${money(a.amountCents)} (last answer: ${code}) and have stopped. ${who} was emailed each time with a link to pay or update the card. Auto-pay stays on for their next invoices; this one needs collecting another way.`,
        `/invoices/${inv.id}`);
    }
  });
  kickOutbox();
}

/** Unpaid invoices whose automatic payment is in trouble (retrying, needs the client, or given up), for Billing and Home. */
export const autoPayTrouble = (businessId: string) =>
  db.invoice.findMany({ where: { businessId, status: "AWAITING_PAYMENT", autoPayState: { in: AUTOPAY_TROUBLE } }, include: { client: true, autoPayAttempts: { orderBy: { n: "desc" }, take: 1 } }, orderBy: { number: "asc" } });

/** Webhook charge.dispute.created: a chargeback has a deadline, so the owners hear at once. */
export async function disputeOpened(d: { id: string; amountCents: number; reason: string; paymentIntentId: string | null }) {
  const pay = d.paymentIntentId
    ? await db.payment.findFirst({ where: { OR: [{ stripePaymentIntentId: d.paymentIntentId }, { stripePaymentIntentId: { startsWith: `${d.paymentIntentId}:` } }] }, include: { client: true, invoice: true } })
    : null;
  const businessId = pay?.businessId ?? (await db.business.findUnique({ where: { slug: env.businessSlug } }))?.id;
  if (!businessId) return;
  await tellOwners(db, businessId, `dispute:${d.id}`, `Card dispute: ${money(d.amountCents)}${pay ? ` from ${clientName(pay.client)}` : ""}`,
    `A cardholder's bank has disputed a ${money(d.amountCents)} card payment${pay ? ` on invoice #${pay.invoice.number}` : ""} (reason: ${d.reason.replaceAll("_", " ")}). Stripe has taken the money back for now. Answer the dispute in the Stripe dashboard before its deadline, or the client keeps the refund.`,
    pay ? `/invoices/${pay.invoiceId}` : "/invoices");
  kickOutbox();
}
