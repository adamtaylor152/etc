// Against a real database, with Stripe replaced by fakes (nothing here talks to Stripe): an invoice sent to a client
// with auto-pay on is stamped, charged once however often the scheduler or webhook runs, retried on a schedule when the
// card is declined, and handed to the owner when the tries run out. The key below only makes stripeEnabled() true.
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import type { Prisma } from "@/generated/prisma/client";
import type { ChargeResult } from "@/server/billing/autopay";
import { addDays, dateOnly, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { renderMessage } from "@/server/email/outbox";
import { env } from "@/server/env";
import { runAutoPay, setAutoPay, settleAttempt, type AutoPayDeps } from "@/server/ops/autopay";
import { createCustomInvoice, sendInvoice } from "@/server/ops/invoices";
import { parseSettings } from "@/server/settings";

type Args = Parameters<AutoPayDeps["charge"]>[0];
const declined: ChargeResult = { piId: null, status: null, error: { type: "StripeCardError", code: "card_declined", declineCode: "insufficient_funds", message: "Your card has insufficient funds." } };
function fakeStripe(answer: (a: Args, call: number) => ChargeResult) {
  const calls: Args[] = [];
  const deps: AutoPayDeps = {
    charge: async (a) => { calls.push(a); return answer(a, calls.length); },
    fee: async () => 175, retrieve: async (id) => ({ piId: id, status: "succeeded" }), cancel: async () => {},
  };
  return { calls, deps };
}

let bid: string, before: Prisma.JsonValue, keyBefore: string | undefined;
beforeAll(async () => {
  bid = await businessId();
  before = (await db.business.findUniqueOrThrow({ where: { id: bid } })).settings;
  await db.business.update({ where: { id: bid }, data: { settings: { ...parseSettings(before), autoPay: true, autoPayGraceDays: 2 } } });
  keyBefore = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_never_sent";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});
afterAll(async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  await db.business.update({ where: { id: bid }, data: { settings: before as Prisma.InputJsonValue } });
  if (keyBefore === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = keyBefore;
});

/** A client who saved a Visa and opted in, with one sent invoice whose charge day has come. */
async function dueInvoice(tag: string, cents = 5000) {
  const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
  const id = `${tag}${Date.now().toString(36)}`;
  const client = await db.client.create({
    data: {
      businessId: bid, firstName: "Otto", lastName: id, email: `autopay-${id}@example.com`, source: "MANUAL",
      stripeCustomerId: `cus_${id}`, cardPaymentMethodId: `pm_${id}`, cardBrand: "visa", cardLast4: "4242", cardExpMonth: 4, cardExpYear: 2030, cardSavedAt: new Date(),
      autoPayConsentAt: new Date(), autoPayConsentSource: "hub",
    },
  });
  const draft = await createCustomInvoice(owner, { clientId: client.id, subject: "Snow clearing", lines: [{ name: "Driveway", quantity: 1, unitPriceCents: cents }] });
  await sendInvoice(owner, draft.id);
  const sent = await db.invoice.findUniqueOrThrow({ where: { id: draft.id } });
  const scope = { clientId: client.id };
  const makeDue = () => db.invoice.update({ where: { id: draft.id }, data: { autoPayOn: toDbDate(todayLocal()) } }); // as if the days had passed
  const inv = () => db.invoice.findUniqueOrThrow({ where: { id: draft.id }, include: { payments: true, autoPayAttempts: { orderBy: { n: "asc" } } } });
  const emails = (template: string) => db.emailMessage.findMany({ where: { template, entityId: draft.id } });
  return { owner, client, sent, scope, makeDue, inv, emails };
}

describe("auto-pay", () => {
  it("stamps the charge date on send, says so in the email, and charges exactly once", async () => {
    const t = await dueInvoice("ok");
    const today = todayLocal();
    expect(t.sent.autoPayState).toBe("SCHEDULED");
    expect(dateOnly(t.sent.autoPayOn)! >= addDays(today, 2)).toBe(true); // the grace period, or the due date if later
    const [mail] = await t.emails("invoice.sent");
    expect((await renderMessage(mail)).text).toContain("charge your Visa ending 4242 on");

    const stripe = fakeStripe((a) => ({ piId: `pi_${a.attemptId}`, status: "succeeded", amountReceived: a.amountCents }));
    await runAutoPay(stripe.deps, new Date(), t.scope); // not due yet
    expect(stripe.calls).toHaveLength(0);

    await t.makeDue();
    await Promise.all([runAutoPay(stripe.deps, new Date(), t.scope), runAutoPay(stripe.deps, new Date(), t.scope)]); // two schedulers at once
    await runAutoPay(stripe.deps, new Date(), t.scope);
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]).toMatchObject({ amountCents: 5000, customerId: t.client.stripeCustomerId, paymentMethodId: t.client.cardPaymentMethodId, idempotencyKey: `autopay:${t.sent.id}:1` });

    let inv = await t.inv();
    expect(inv).toMatchObject({ status: "PAID", amountPaidCents: 5000, autoPayState: "PAID", autoPayOn: null });
    expect(inv.payments).toHaveLength(1);
    expect(inv.payments[0]).toMatchObject({ method: "CARD", amountCents: 5000, feeCents: 175, stripePaymentIntentId: `pi_${inv.autoPayAttempts[0].id}`, reference: "Auto-pay · Visa •••• 4242" });
    expect(inv.autoPayAttempts.map((a) => a.status)).toEqual(["SUCCEEDED"]);
    expect(await db.emailMessage.count({ where: { template: "payment.receipt", entityId: inv.payments[0].id } })).toBe(1); // same receipt path as any payment

    // The webhook arrives after (or with) the direct answer: nothing is recorded twice.
    const again = { piId: inv.payments[0].stripePaymentIntentId, status: "succeeded", amountReceived: 5000 };
    await Promise.all([settleAttempt(inv.autoPayAttempts[0].id, again, stripe.deps), settleAttempt(inv.autoPayAttempts[0].id, again, stripe.deps)]);
    inv = await t.inv();
    expect(inv.payments).toHaveLength(1);
    expect(inv.amountPaidCents).toBe(5000);
  });

  it("webhook first, direct answer second: still one payment", async () => {
    const t = await dueInvoice("race");
    await t.makeDue();
    // The create call "times out" (no answer), then the webhook reports success, then the stale attempt is looked at again.
    const stripe = fakeStripe((a, call) => (call === 1 ? { piId: null, status: null, error: { type: "StripeConnectionError" } } : { piId: `pi_${a.attemptId}`, status: "succeeded", amountReceived: a.amountCents }));
    await runAutoPay(stripe.deps, new Date(), t.scope);
    let inv = await t.inv();
    expect(inv.autoPayAttempts.map((a) => a.status)).toEqual(["PENDING"]);
    expect(inv).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: "SCHEDULED" });
    await runAutoPay(stripe.deps, new Date(), t.scope); // an attempt is in flight: no second charge is started
    expect(stripe.calls).toHaveLength(1);
    expect(await t.emails("autopay.failed")).toHaveLength(0); // no answer is not a decline: the client hears nothing

    // 11 minutes later the same request is repeated with the same idempotency key (Stripe would replay its first answer).
    await runAutoPay(stripe.deps, new Date(Date.now() + 11 * 60_000), t.scope);
    expect(stripe.calls.map((c) => c.idempotencyKey)).toEqual([`autopay:${t.sent.id}:1`, `autopay:${t.sent.id}:1`]);
    await settleAttempt(inv.autoPayAttempts[0].id, { piId: `pi_${inv.autoPayAttempts[0].id}`, status: "succeeded", amountReceived: 5000 }, stripe.deps); // the webhook
    inv = await t.inv();
    expect(inv.payments).toHaveLength(1);
    expect(inv).toMatchObject({ status: "PAID", autoPayState: "PAID" });
    expect(inv.autoPayAttempts).toHaveLength(1);
  });

  it("declined: emails the client, retries after 3 and 7 days, then stops and tells the owner without switching anything off", async () => {
    const t = await dueInvoice("no");
    const today = todayLocal();
    await t.makeDue();
    const stripe = fakeStripe(() => declined);

    await runAutoPay(stripe.deps, new Date(), t.scope);
    let inv = await t.inv();
    expect(inv).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: "RETRYING" });
    expect(dateOnly(inv.autoPayOn)).toBe(addDays(today, 3));
    expect(inv.autoPayAttempts.map((a) => [a.n, a.status, a.failureCode])).toEqual([[1, "FAILED", "insufficient_funds"]]);
    let mails = await t.emails("autopay.failed");
    expect(mails).toHaveLength(1);
    expect(mails[0].props).toMatchObject({ retryOn: addDays(today, 3), needsAction: false, code: "insufficient_funds", card: "Visa •••• 4242" });
    const text = (await renderMessage(mails[0])).text;
    expect(text).toContain("enough funds");
    expect(text).toMatch(/try again on/);
    expect(text).toContain("Update your card");

    await runAutoPay(stripe.deps, new Date(), t.scope); // same day: the retry isn't due
    expect(stripe.calls).toHaveLength(1);

    await t.makeDue();
    await runAutoPay(stripe.deps, new Date(), t.scope);
    inv = await t.inv();
    expect(dateOnly(inv.autoPayOn)).toBe(addDays(today, 7));
    expect(stripe.calls.map((c) => c.idempotencyKey)).toEqual([`autopay:${t.sent.id}:1`, `autopay:${t.sent.id}:2`]);
    expect(await db.emailMessage.count({ where: { template: "owner.notice", dedupeKey: { startsWith: `autopay:${t.sent.id}:stopped` } } })).toBe(0);

    await t.makeDue();
    await runAutoPay(stripe.deps, new Date(), t.scope);
    inv = await t.inv();
    expect(inv).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: "FAILED", autoPayOn: null, amountPaidCents: 0 });
    expect(inv.autoPayAttempts.map((a) => a.status)).toEqual(["FAILED", "FAILED", "FAILED"]);
    mails = await t.emails("autopay.failed");
    expect(mails).toHaveLength(3);
    expect((await renderMessage(mails.find((m) => (m.props as { retryOn: string | null }).retryOn === null)!)).text).toMatch(/won.t try this invoice again/);
    expect(await db.emailMessage.count({ where: { template: "owner.notice", dedupeKey: { startsWith: `autopay:${t.sent.id}:stopped` } } })).toBe(env.ownerEmails.length);
    expect((await db.client.findUniqueOrThrow({ where: { id: t.client.id } })).autoPayConsentAt).not.toBeNull(); // nothing turned off silently

    await runAutoPay(stripe.deps, new Date(), t.scope);
    expect(stripe.calls).toHaveLength(3); // and no fourth try
  });

  it("bank wants the client to approve: no retry, a pay link instead", async () => {
    const t = await dueInvoice("sca");
    await t.makeDue();
    const stripe = fakeStripe(() => ({ piId: "pi_sca", status: "requires_payment_method", error: { type: "StripeCardError", code: "authentication_required" } }));
    await runAutoPay(stripe.deps, new Date(), t.scope);
    const inv = await t.inv();
    expect(inv).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: "NEEDS_ACTION", autoPayOn: null });
    expect(inv.autoPayAttempts.map((a) => a.status)).toEqual(["REQUIRES_ACTION"]);
    const [mail] = await t.emails("autopay.failed");
    expect(mail.props).toMatchObject({ needsAction: true, retryOn: null });
    expect((await renderMessage(mail)).text).toMatch(/pay from the invoice page/);
  });

  it("Stripe rejecting the request stops quietly: the owner is told, the client is not", async () => {
    const t = await dueInvoice("bad");
    await t.makeDue();
    const stripe = fakeStripe(() => ({ piId: null, status: null, error: { type: "StripeInvalidRequestError", code: "resource_missing", message: "No such PaymentMethod" } }));
    await runAutoPay(stripe.deps, new Date(), t.scope);
    const inv = await t.inv();
    expect(inv).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: "FAILED", autoPayOn: null });
    expect(await t.emails("autopay.failed")).toHaveLength(0);
    expect(await db.emailMessage.count({ where: { template: "owner.notice", dedupeKey: { startsWith: `autopay:${inv.autoPayAttempts[0].id}:resource_missing` } } })).toBe(env.ownerEmails.length);
  });

  it("turning auto-pay off releases invoices already scheduled; only the client can turn it on", async () => {
    const t = await dueInvoice("off");
    await t.makeDue();
    await setAutoPay(t.client.id, false, { actorType: "USER", actorUserId: t.owner.id });
    expect(await t.inv()).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: "STOPPED", autoPayOn: null });
    const stripe = fakeStripe(() => declined);
    await runAutoPay(stripe.deps, new Date(), t.scope);
    expect(stripe.calls).toHaveLength(0);
    await expect(setAutoPay(t.client.id, true, { actorType: "USER", actorUserId: t.owner.id })).rejects.toThrow();
    await setAutoPay(t.client.id, true, { actorType: "CLIENT", actorClientId: t.client.id });
    expect((await db.client.findUniqueOrThrow({ where: { id: t.client.id } })).autoPayConsentSource).toBe("hub");
    expect((await t.inv()).autoPayState).toBe("STOPPED"); // turning it back on never revives an old invoice
  });

  it("webhook: signature checked, a failed charge settles once, a detached card and a dispute are handled", async () => {
    // Events are signed here with a test secret (local crypto, as Stripe's own test helper does); Stripe is not contacted.
    const hook = (type: string, object: object, secret = "whsec_test") => {
      const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
      const sig = new Stripe("sk_test_fake_never_sent").webhooks.generateTestHeaderString({ payload, secret });
      return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": sig } }));
    };
    const t = await dueInvoice("hook");
    await t.makeDue();
    const stripe = fakeStripe(() => ({ piId: null, status: null, error: { type: "StripeConnectionError" } })); // the direct answer never came
    await runAutoPay(stripe.deps, new Date(), t.scope);
    const attemptId = (await t.inv()).autoPayAttempts[0].id;
    const failed = { id: "pi_hook", object: "payment_intent", status: "requires_payment_method", amount_received: 0, metadata: { autoPayAttemptId: attemptId }, last_payment_error: { code: "card_declined", decline_code: "expired_card", message: "Your card has expired." } };

    expect((await hook("payment_intent.payment_failed", failed, "whsec_wrong")).status).toBe(400);
    expect((await t.inv()).autoPayAttempts[0].status).toBe("PENDING"); // a forged event changes nothing
    expect((await hook("payment_intent.payment_failed", failed)).status).toBe(200);
    expect((await hook("payment_intent.payment_failed", failed)).status).toBe(200); // Stripe delivers twice
    let inv = await t.inv();
    expect(inv.autoPayState).toBe("RETRYING");
    expect(inv.autoPayAttempts[0]).toMatchObject({ status: "FAILED", failureCode: "expired_card", stripePaymentIntentId: "pi_hook" });
    expect(await t.emails("autopay.failed")).toHaveLength(1);

    expect((await hook("payment_method.detached", { id: t.client.cardPaymentMethodId, object: "payment_method" })).status).toBe(200);
    expect(await db.client.findUniqueOrThrow({ where: { id: t.client.id } })).toMatchObject({ cardPaymentMethodId: null, cardLast4: null, autoPayConsentAt: null });
    inv = await t.inv();
    expect(inv).toMatchObject({ autoPayState: "STOPPED", autoPayOn: null });

    const dispute = { id: `dp_${attemptId}`, object: "dispute", amount: 5000, reason: "fraudulent", payment_intent: null };
    expect((await hook("charge.dispute.created", dispute)).status).toBe(200);
    expect((await hook("charge.dispute.created", dispute)).status).toBe(200);
    expect(await db.emailMessage.count({ where: { template: "owner.notice", dedupeKey: { startsWith: `dispute:dp_${attemptId}:` } } })).toBe(env.ownerEmails.length);
  });

  it("no opt-in, no auto-pay: the invoice asks for payment as usual", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
    const id = `plain${Date.now().toString(36)}`;
    // A saved card without the opt-in is not consent to be charged.
    const client = await db.client.create({ data: { businessId: bid, firstName: "Pat", lastName: id, email: `autopay-${id}@example.com`, source: "MANUAL", stripeCustomerId: `cus_${id}`, cardPaymentMethodId: `pm_${id}`, cardBrand: "visa", cardLast4: "4242" } });
    const draft = await createCustomInvoice(owner, { clientId: client.id, subject: "Snow clearing", lines: [{ name: "Driveway", quantity: 1, unitPriceCents: 5000 }] });
    await sendInvoice(owner, draft.id);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    expect(inv).toMatchObject({ status: "AWAITING_PAYMENT", autoPayState: null, autoPayOn: null });
    const [mail] = await db.emailMessage.findMany({ where: { template: "invoice.sent", entityId: draft.id } });
    expect((await renderMessage(mail)).text).not.toContain("charge your");
  });
});
