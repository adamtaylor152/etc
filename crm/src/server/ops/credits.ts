// Account credits added by hand (goodwill) or left over from an overpayment. createDraft already takes every unused
// ClientCredit off the client's next invoice as a negative line (and void gives it back), so these only add and remove rows.
import type { PaymentMethod } from "@/generated/prisma/client";
import { splitOverpayment } from "../billing/adjustments";
import { db } from "../db";
import { kickOutbox } from "../email/outbox";
import { money } from "../money";
import { logActivity } from "../records";
import { TransitionError } from "../status/visit";
import { recordPayment } from "./invoices";

type Owner = { id: string; businessId: string };
export const MAX_CREDIT_CENTS = 1_000_000;

/** `reason` is what the client reads on the invoice line that uses the credit. */
export async function addCredit(user: Owner, input: { clientId: string; amountCents: number; reason: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_CREDIT_CENTS) throw new TransitionError("Enter a credit amount");
  const reason = input.reason.trim().slice(0, 120) || "Account credit";
  return db.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, businessId: user.businessId } });
    if (!client) throw new TransitionError("Client not found");
    const credit = await tx.clientCredit.create({ data: { businessId: user.businessId, clientId: client.id, amountCents: input.amountCents, reason } });
    await logActivity(tx, { businessId: user.businessId, type: "payment.credit_added", entityType: "Client", entityId: client.id, actorType: "USER", actorUserId: user.id, clientId: client.id, data: { amountCents: input.amountCents, reason } });
    return credit;
  });
}

/** Remove a credit nobody has used yet. Referral rewards are tied to a referral and stay. */
export async function removeCredit(user: Owner, creditId: string) {
  await db.$transaction(async (tx) => {
    const c = await tx.clientCredit.findFirst({ where: { id: creditId, businessId: user.businessId } });
    if (!c) throw new TransitionError("That credit is gone already");
    if (c.referralId) throw new TransitionError("Referral credits can't be removed here");
    // Checked again in the delete, so a credit an invoice picked up a moment ago is never removed from under it.
    const res = await tx.clientCredit.deleteMany({ where: { id: c.id, appliedToInvoiceId: null } });
    if (res.count !== 1) throw new TransitionError("That credit was already used on an invoice");
    await logActivity(tx, { businessId: user.businessId, type: "payment.credit_removed", entityType: "Client", entityId: c.clientId, actorType: "USER", actorUserId: user.id, clientId: c.clientId, data: { amountCents: c.amountCents, reason: c.reason } });
  });
}

/**
 * Record a manual payment that may be more than the invoice owes. The invoice gets what it is owed; with `keepExtra`
 * the rest becomes account credit linked to the payment (so the payment row stays "money toward this invoice" and the
 * books never count the extra twice). Without it, an overpayment is refused.
 */
export async function recordPaymentKeepingExtra(user: Owner, input: { invoiceId: string; method: PaymentMethod; amountCents: number; reference?: string; note?: string; keepExtra: boolean }) {
  const result = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: input.invoiceId, businessId: user.businessId } });
    const { appliedCents, creditCents } = splitOverpayment(inv.totalCents - inv.amountPaidCents, input.amountCents);
    if (appliedCents <= 0) throw new TransitionError("This invoice has nothing owing. Add the money as account credit on the client instead.");
    if (creditCents > 0 && !input.keepExtra) throw new TransitionError(`That's ${money(creditCents)} more than this invoice owes. Tick “keep the extra as account credit” to record it anyway.`);
    const p = await recordPayment(user, { invoiceId: inv.id, method: input.method, amountCents: appliedCents, reference: input.reference, note: input.note }, tx);
    if (p && creditCents > 0) {
      const reason = `Credit from overpayment on invoice #${inv.number}`;
      await tx.clientCredit.create({ data: { businessId: user.businessId, clientId: inv.clientId, amountCents: creditCents, reason, paymentId: p.id } });
      await logActivity(tx, { businessId: user.businessId, type: "payment.credit_added", entityType: "Client", entityId: inv.clientId, actorType: "USER", actorUserId: user.id, clientId: inv.clientId, data: { amountCents: creditCents, reason } });
    }
    return { payment: p, creditCents };
  });
  kickOutbox();
  return result;
}
