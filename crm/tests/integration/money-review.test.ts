// The independent money review's findings, pinned against a real database: credit and deposit remainders are kept,
// a quote's discount reaches the invoice, a fully covered invoice is paid, overpayments become credit, and a tip
// refunded in Stripe does not re-open the invoice.
import { describe, expect, it } from "vitest";
import { saveClient } from "@/server/clients";
import { businessId, db } from "@/server/db";
import { createCustomInvoice, markSent, recordPayment, voidInvoice } from "@/server/ops/invoices";
import { approveQuote, convertQuote, createQuote, sendQuote, updateQuote } from "@/server/ops/quotes";
import { syncStripeRefund } from "@/server/ops/refunds";
import { removeVisitExtra } from "@/server/ops/visits";
import { todayLocal, toDbDate } from "@/server/dates";
import { invoiceFixedJob } from "@/server/ops/invoices";

const tag = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const bid = await businessId();
  const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
  const t = tag();
  const clientId = await saveClient(owner, {
    firstName: "Money", lastName: `Review${t}`, emails: [{ address: `money-${t}@example.test`, label: "Main" }], phones: [], tags: [], contacts: [],
    followUpQuotes: false, followUpInvoices: false, visitReminders: false, marketingOptOut: true, smsOptIn: false, doNotService: false, property: { formatted: `${t} Review Rd SW, Calgary` },
  });
  const invoice = (dollars: number) => createCustomInvoice(owner, { clientId, subject: "review", lines: [{ name: "Work", quantity: 1, unitPriceCents: dollars * 100 }] });
  const credits = () => db.clientCredit.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
  return { bid, owner, clientId, invoice, credits };
}

describe("money review", () => {
  it("a credit bigger than the invoice keeps its remainder, and void gives the used part back", async () => {
    const { bid, owner, clientId, invoice, credits } = await setup();
    await db.clientCredit.create({ data: { businessId: bid, clientId, amountCents: 10000, reason: "Goodwill" } });
    const a = await invoice(30);
    expect(a.totalCents).toBe(0);
    expect((await credits()).map((c) => [c.amountCents, c.appliedToInvoiceId === a.id])).toEqual([[3000, true], [7000, false]]);
    // Issued with nothing owing: it is paid, not "awaiting payment" forever.
    await markSent(owner, a.id);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PAID");
    const b = await invoice(50);
    expect(b.totalCents).toBe(0);
    expect((await credits()).filter((c) => !c.appliedToInvoiceId).map((c) => c.amountCents)).toEqual([2000]);
    await voidInvoice(owner, b.id, "test");
    expect((await credits()).filter((c) => !c.appliedToInvoiceId).map((c) => c.amountCents).sort((x, y) => x - y)).toEqual([2000, 5000]);
  }, 30_000);

  it("an overpayment on an automatic path becomes account credit, not a negative balance", async () => {
    const { bid, invoice, credits } = await setup();
    const inv = await invoice(100);
    const p = (await recordPayment({ id: null, businessId: bid }, { invoiceId: inv.id, method: "ETRANSFER", amountCents: 15000, reference: "auto" }))!;
    expect(p.amountCents).toBe(10000);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "PAID", amountPaidCents: 10000 });
    expect((await credits()).map((c) => [c.amountCents, c.paymentId])).toEqual([[5000, p.id]]);
  }, 30_000);

  it("a quote's discount comes off the job's first invoice, once", async () => {
    const { owner, clientId } = await setup();
    const line = { name: "Clean-up", quantity: 1, unitPriceCents: 100000, isOptional: false, isSelected: true };
    const q = await createQuote(owner, { clientId, title: "Discount check", lines: [line] });
    await updateQuote(owner, q.id, { title: "Discount check", validUntil: null, discount: { type: "FIXED", value: 10000 }, lines: [line] });
    await sendQuote(owner, q.id);
    await approveQuote(q.id, { name: "Tester", selected: [], ip: null });
    const job = await convertQuote(owner, q.id, { date: null, billingType: "FIXED_PRICE" });
    expect(job).toMatchObject({ totalCents: 90000, discountCents: 10000 });
    const inv = await invoiceFixedJob(owner, job.id);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ discountCents: 10000, totalCents: 90000 });
  }, 30_000);

  it("a tip refunded in Stripe leaves the invoice paid", async () => {
    const { bid, invoice } = await setup();
    const inv = await invoice(100);
    const pi = `pi_review_${tag()}`;
    await recordPayment({ id: null, businessId: bid }, { invoiceId: inv.id, method: "CARD", amountCents: 10000, stripePaymentIntentId: pi, tipCents: 1000 });
    await syncStripeRefund(pi, 1000);
    expect(await db.payment.findFirstOrThrow({ where: { stripePaymentIntentId: pi } })).toMatchObject({ refundedCents: 0, tipRefundedCents: 1000 });
    expect(await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: "PAID", amountPaidCents: 10000 });
  }, 30_000);
  it("a client can take off only the extras they added", async () => {
    const { bid, clientId } = await setup();
    const property = await db.property.findFirstOrThrow({ where: { clientId } });
    const number = ((await db.job.aggregate({ where: { businessId: bid }, _max: { number: true } }))._max.number ?? 0) + 1000;
    const job = await db.job.create({ data: { businessId: bid, number, clientId, propertyId: property.id, kind: "ONE_OFF", title: "Extras" } });
    const visit = await db.visit.create({ data: { businessId: bid, jobId: job.id, propertyId: property.id, scheduledDate: toDbDate(todayLocal()) } });
    const extra = (addedByClientId: string | null) => db.visitExtra.create({ data: { businessId: bid, visitId: visit.id, serviceKey: addedByClientId ? "ice_melt" : "salt", name: "Extra", unitPriceCents: 500, addedByClientId } });
    const [theirs, owners] = [await extra(clientId), await extra(null)];
    await expect(removeVisitExtra({ id: clientId, businessId: bid }, owners.id)).rejects.toThrow();
    await removeVisitExtra({ id: clientId, businessId: bid }, theirs.id);
    expect((await db.visitExtra.findMany({ where: { visitId: visit.id } })).map((e) => e.id)).toEqual([owners.id]);
  }, 30_000);
});
