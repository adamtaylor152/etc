// Against a real database, with Stripe faked: overpayments become account credit that the next invoice uses, manual
// credits add and remove, refunds re-open the invoice and are idempotent from both sides (CRM and Stripe webhook),
// and every PDF is produced from real rows.
import { describe, expect, it } from "vitest";
import { businessId, db } from "@/server/db";
import { attachmentsFor, renderMessage } from "@/server/email/outbox";
import { addCredit, recordPaymentKeepingExtra, removeCredit } from "@/server/ops/credits";
import { createCustomInvoice, deletePayment, recordPayment, sendInvoice, voidInvoice } from "@/server/ops/invoices";
import { refundPayment, syncStripeRefund } from "@/server/ops/refunds";
import { invoicePdf, quotePdf, statementPdf } from "@/server/pdf/documents";
import { nextNumber } from "@/server/records";
import type { StripeRefund } from "@/server/stripe-refunds";

async function setup(tag: string) {
  const bid = await businessId();
  const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
  const client = await db.client.create({ data: { businessId: bid, firstName: "Billing", lastName: tag, email: `billing-${tag}@example.com`, source: "MANUAL" } });
  const invoice = async (dollars: number) => {
    const inv = await createCustomInvoice(owner, { clientId: client.id, subject: "Yard cleanup", lines: [{ name: "Yard cleanup", quantity: 1, unitPriceCents: dollars * 100 }] });
    await sendInvoice(owner, inv.id);
    return db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lineItems: true } });
  };
  return { bid, owner, client, invoice };
}
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isPdf = (b: Uint8Array | undefined) => Buffer.from(b!.slice(0, 5)).toString() === "%PDF-";

describe("overpayments and account credit", () => {
  it("an overpayment needs a yes, then the extra is credit that the next invoice takes off", async () => {
    const { owner, client, invoice } = await setup(tag());
    const inv = await invoice(50);
    const pay = { invoiceId: inv.id, method: "ETRANSFER" as const, amountCents: 7000 };
    await expect(recordPaymentKeepingExtra(owner, { ...pay, keepExtra: false })).rejects.toThrow(/\$20 more than this invoice owes/);
    expect(await db.payment.count({ where: { invoiceId: inv.id } })).toBe(0);

    const { payment, creditCents } = await recordPaymentKeepingExtra(owner, { ...pay, keepExtra: true });
    expect(creditCents).toBe(2000);
    expect(payment).toMatchObject({ amountCents: 5000 }); // the payment row is only the money toward this invoice
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "PAID", amountPaidCents: 5000 });
    const credit = await db.clientCredit.findFirstOrThrow({ where: { clientId: client.id } });
    expect(credit).toMatchObject({ amountCents: 2000, paymentId: payment!.id, appliedToInvoiceId: null, reason: `Credit from overpayment on invoice #${inv.number}` });
    // The receipt renders and mentions the credit.
    expect((await renderMessage({ template: "payment.receipt", props: { paymentId: payment!.id }, businessId: inv.businessId, to: client.email })).text).toContain("$20 you sent is saved as credit");

    const next = await invoice(30);
    expect(next.totalCents).toBe(1000);
    expect(next.lineItems.map((l) => l.totalCents).sort((a, b) => a - b)).toEqual([-2000, 3000]);
    expect((await db.clientCredit.findUniqueOrThrow({ where: { id: credit.id } })).appliedToInvoiceId).toBe(next.id);
    // The extra has been spent, so the payment it came from can't just be removed.
    await expect(deletePayment(owner, payment!.id)).rejects.toThrow(/already used as credit/);
  });

  it("removing an overpaying payment takes its unused credit with it", async () => {
    const { owner, client, invoice } = await setup(tag());
    const inv = await invoice(40);
    const { payment } = await recordPaymentKeepingExtra(owner, { invoiceId: inv.id, method: "CASH", amountCents: 4500, keepExtra: true });
    expect(await db.clientCredit.count({ where: { clientId: client.id } })).toBe(1);
    await deletePayment(owner, payment!.id);
    expect(await db.clientCredit.count({ where: { clientId: client.id } })).toBe(0);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "AWAITING_PAYMENT", amountPaidCents: 0 });
  });

  it("manual credit: add with a reason, remove while unused, not once an invoice has used it", async () => {
    const { owner, client, invoice } = await setup(tag());
    await expect(addCredit(owner, { clientId: client.id, amountCents: 0, reason: "x" })).rejects.toThrow(/Enter a credit amount/);
    const a = await addCredit(owner, { clientId: client.id, amountCents: 1500, reason: "Goodwill credit" });
    await removeCredit(owner, a.id);
    expect(await db.clientCredit.count({ where: { clientId: client.id } })).toBe(0);
    const b = await addCredit(owner, { clientId: client.id, amountCents: 1500, reason: "Goodwill credit" });
    const inv = await invoice(60);
    expect(inv.totalCents).toBe(4500);
    expect(inv.lineItems.find((l) => l.totalCents < 0)?.name).toBe("Goodwill credit");
    await expect(removeCredit(owner, b.id)).rejects.toThrow(/already used on an invoice/);
    // Void gives the credit back (existing behaviour), and then it can be removed.
    await voidInvoice(owner, inv.id, "test");
    await removeCredit(owner, b.id);
    expect(await db.activityEvent.count({ where: { clientId: client.id, type: { in: ["payment.credit_added", "payment.credit_removed"] } } })).toBe(4);
  });
});

describe("refunds", () => {
  it("cash: recorded only, re-opens the invoice, logged, receipt queued; stale and too-big refunds refused", async () => {
    const { owner, client, invoice } = await setup(tag());
    const inv = await invoice(50);
    const p = (await recordPayment(owner, { invoiceId: inv.id, method: "CASH", amountCents: 5000 }))!;
    const never = async () => { throw new Error("Stripe must not be called for cash"); };
    await expect(refundPayment(owner, { paymentId: p.id, amountCents: 6000, expectRefundedCents: 0 }, never)).rejects.toThrow(/Only \$50.00 of this payment is left/);
    await refundPayment(owner, { paymentId: p.id, amountCents: 2000, expectRefundedCents: 0, reason: "missed the back steps" }, never);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 2000, status: "PARTIALLY_REFUNDED" });
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "AWAITING_PAYMENT", amountPaidCents: 3000, paidAt: null });
    // The same form submitted twice: the second one sees the payment has moved and does nothing.
    await expect(refundPayment(owner, { paymentId: p.id, amountCents: 2000, expectRefundedCents: 0 }, never)).rejects.toThrow(/This payment changed/);
    await refundPayment(owner, { paymentId: p.id, amountCents: 3000, expectRefundedCents: 2000 }, never);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 5000, status: "REFUNDED" });
    await expect(refundPayment(owner, { paymentId: p.id, amountCents: 100, expectRefundedCents: 5000 }, never)).rejects.toThrow(/already fully refunded/);

    const events = await db.activityEvent.findMany({ where: { entityId: inv.id, type: "payment.refunded" }, orderBy: { at: "asc" } });
    expect(events.map((e) => e.data)).toEqual([{ amountCents: 2000, method: "CASH", via: "manual", reason: "missed the back steps" }, { amountCents: 3000, method: "CASH", via: "manual" }]);
    const mails = await db.emailMessage.findMany({ where: { template: "payment.refund", entityId: p.id }, orderBy: { createdAt: "asc" } });
    expect(mails.map((m) => [m.to, m.props])).toEqual([[client.email, { paymentId: p.id, amountCents: 2000 }], [client.email, { paymentId: p.id, amountCents: 3000 }]]);
    expect((await renderMessage(mails[0])).text).toContain("$20");
    // Nothing is held any more, so the invoice can be voided.
    await voidInvoice(owner, inv.id, "refunded in full");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("VOID");
  });

  it("card: goes through Stripe with an idempotency key; a Stripe failure writes nothing; the webhook neither doubles it nor misses a dashboard refund", async () => {
    const { owner, bid, invoice } = await setup(tag());
    const inv = await invoice(80);
    const pi = `pi_test_${tag()}`;
    const p = (await recordPayment({ id: null, businessId: bid }, { invoiceId: inv.id, method: "CARD", amountCents: 8000, stripePaymentIntentId: pi, stripeCheckoutSessionId: "cs_test_1", tipCents: 800 }))!;
    expect(p.tipCents).toBe(800);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "PAID", amountPaidCents: 8000 }); // the tip is not invoice money

    await expect(refundPayment(owner, { paymentId: p.id, amountCents: 2500, expectRefundedCents: 0 }, async () => { throw new Error("card_declined"); })).rejects.toThrow(/Stripe couldn't refund this: card_declined/);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 0, status: "SUCCEEDED" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");

    const calls: StripeRefund[] = [];
    await refundPayment(owner, { paymentId: p.id, amountCents: 2500, expectRefundedCents: 0 }, async (r) => { calls.push(r); return { id: "re_1" }; });
    expect(calls).toEqual([{ paymentIntent: pi, amountCents: 2500, idempotencyKey: `refund:${p.id}:0:2500`, metadata: { paymentId: p.id, invoiceId: inv.id, businessId: bid } }]);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 2500, status: "PARTIALLY_REFUNDED" });
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "AWAITING_PAYMENT", amountPaidCents: 5500 });

    // charge.refunded for the refund we just made (Stripe's running total = ours): nothing changes, replayed or not.
    expect(await syncStripeRefund(pi, 2500)).toBe(0);
    expect(await syncStripeRefund(pi, 2500)).toBe(0);
    // A further $10 refunded in the Stripe dashboard: picked up once. It comes off the $8 tip first (that is how a tip
    // is refunded), and only the other $2 off the invoice money.
    expect(await syncStripeRefund(pi, 3500)).toBe(1);
    expect(await syncStripeRefund(pi, 3500)).toBe(0);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 2700, tipRefundedCents: 800 });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaidCents).toBe(5300);
    // The whole charge refunded in the dashboard, tip included: the payment can't go past its own amount.
    expect(await syncStripeRefund(pi, 8800)).toBe(1);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 8000, status: "REFUNDED" });
    expect(await db.activityEvent.count({ where: { entityId: inv.id, type: "payment.refunded" } })).toBe(4); // ours, the tip, the $2, the rest
    expect(await db.emailMessage.count({ where: { template: "payment.refund", entityId: p.id } })).toBe(3);
    expect(await syncStripeRefund("pi_nobody_has_this", 500)).toBe(0);
  });

  it("the webhook arriving while our refund is still talking to Stripe waits for it, then has nothing to add", async () => {
    const { owner, bid, invoice } = await setup(tag());
    const inv = await invoice(60);
    const pi = `pi_test_${tag()}`;
    const p = (await recordPayment({ id: null, businessId: bid }, { invoiceId: inv.id, method: "CARD", amountCents: 6000, stripePaymentIntentId: pi }))!;
    let hook: Promise<number> | undefined;
    await refundPayment(owner, { paymentId: p.id, amountCents: 1500, expectRefundedCents: 0 }, async () => {
      hook = syncStripeRefund(pi, 1500); // Stripe fires charge.refunded before our transaction commits
      await new Promise((r) => setTimeout(r, 300));
      return { id: "re_2" };
    });
    expect(await hook).toBe(0);
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ refundedCents: 1500 });
    expect(await db.activityEvent.count({ where: { entityId: inv.id, type: "payment.refunded" } })).toBe(1);
  });
});

describe("pdfs", () => {
  it("invoice and statement PDFs come from real rows; the invoice email carries its PDF", async () => {
    const { owner, bid, client, invoice } = await setup(tag());
    const inv = await invoice(45);
    await recordPayment(owner, { invoiceId: inv.id, method: "CASH", amountCents: 2000 });
    const pdf = await invoicePdf(inv.id, bid);
    expect(pdf?.filename).toBe(`etc-invoice-${inv.number}.pdf`);
    expect(isPdf(pdf?.bytes)).toBe(true);
    expect(await invoicePdf(inv.id, "another-business")).toBeNull();
    expect(isPdf((await statementPdf(client.id, bid, { range: "lifetime" }))?.bytes)).toBe(true);
    expect(isPdf((await statementPdf(client.id, bid, { range: "zero" }))?.bytes)).toBe(true);
    const files = await attachmentsFor({ template: "invoice.sent", props: { invoiceId: inv.id }, businessId: bid, to: client.email });
    expect(files.map((f) => f.filename)).toEqual([`etc-invoice-${inv.number}.pdf`]);
    const st = await attachmentsFor({ template: "client.statement", props: { clientId: client.id, range: "lifetime" }, businessId: bid, to: client.email });
    expect(st).toHaveLength(1);
    expect((await renderMessage({ template: "client.statement", props: { clientId: client.id, range: "lifetime" }, businessId: bid, to: client.email })).text).toContain("$25");
    expect(await attachmentsFor({ template: "payment.receipt", props: {}, businessId: bid, to: client.email })).toEqual([]);

    const number = await nextNumber(db, bid, "QUOTE");
    const quote = await db.quote.create({ data: {
      businessId: bid, number, clientId: client.id, title: "Fence repair", message: "Thanks for asking!", subtotalCents: 20000, totalCents: 20000, depositType: "PERCENT", depositValue: 25,
      lineItems: { create: [{ name: "Fence repair", description: "Replace two posts", quantity: 2, unitPriceCents: 10000, totalCents: 20000 }, { name: "Stain", unitPriceCents: 5000, totalCents: 5000, isOptional: true, isSelected: false, sortOrder: 1 }] },
    } });
    const qp = await quotePdf(quote.id, bid);
    expect(qp?.filename).toBe(`etc-quote-${number}.pdf`);
    expect(isPdf(qp?.bytes)).toBe(true);
    expect((await attachmentsFor({ template: "quote.sent", props: { quoteId: quote.id }, businessId: bid, to: client.email })).map((f) => f.filename)).toEqual([`etc-quote-${number}.pdf`]);
  });
});
