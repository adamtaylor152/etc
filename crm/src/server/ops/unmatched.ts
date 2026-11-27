// The unmatched-payments queue: money that came in without an obvious invoice. Owners apply it (optionally split
// across invoices, receipt per invoice) or dismiss it. Applying is idempotent per allocation via the remaining balance.
import type { PaymentMethod } from "@/generated/prisma/client";
import { validateAllocations, type Allocation } from "../billing/unmatched";
import { db } from "../db";
import { kickOutbox } from "../email/outbox";
import { logActivity } from "../records";
import { TransitionError } from "../status/visit";
import { recordPayment } from "./invoices";

type Actor = { id: string; businessId: string };

/** Queue a payment. Same provider reference twice = one entry. */
export async function queueUnmatched(businessId: string, p: { source: string; method?: PaymentMethod; amountCents: number; sender: string | null; message: string | null; providerRef: string | null }) {
  if (p.providerRef) {
    const existing = await db.unmatchedPayment.findUnique({ where: { businessId_providerRef: { businessId, providerRef: p.providerRef } } });
    if (existing) return existing;
  }
  return db.unmatchedPayment.create({ data: { businessId, source: p.source, method: p.method ?? "ETRANSFER", amountCents: p.amountCents, sender: p.sender, message: p.message?.slice(0, 500), providerRef: p.providerRef } });
}

export async function remainingCents(id: string) {
  const u = await db.unmatchedPayment.findUniqueOrThrow({ where: { id }, include: { payments: { select: { amountCents: true } } } });
  return { u, remaining: u.amountCents - u.payments.reduce((a, p) => a + p.amountCents, 0) };
}

export async function applyUnmatched(user: Actor, id: string, allocations: Allocation[]) {
  await db.$transaction(async (tx) => {
    // Lock the row so two owners can't apply the same money at once.
    await tx.$queryRaw`SELECT id FROM "UnmatchedPayment" WHERE id = ${id} FOR UPDATE`;
    const u = await tx.unmatchedPayment.findFirstOrThrow({ where: { id, businessId: user.businessId }, include: { payments: { select: { amountCents: true } } } });
    if (u.status !== "OPEN") throw new TransitionError("This payment was already handled");
    const remaining = u.amountCents - u.payments.reduce((a, p) => a + p.amountCents, 0);
    const invoices = await tx.invoice.findMany({ where: { businessId: user.businessId, id: { in: allocations.map((a) => a.invoiceId) }, status: { in: ["DRAFT", "AWAITING_PAYMENT"] } } });
    let rows: Allocation[];
    try {
      rows = validateAllocations(remaining, allocations, new Map(invoices.map((i) => [i.id, i.totalCents - i.amountPaidCents])));
    } catch (e) {
      throw new TransitionError((e as Error).message);
    }
    for (const r of rows) {
      await recordPayment(user, {
        invoiceId: r.invoiceId, method: u.method, amountCents: r.amountCents, unmatchedPaymentId: u.id, receivedAt: u.receivedAt,
        reference: u.providerRef ? `Interac ${u.providerRef}${rows.length > 1 ? " (split)" : ""}` : "Matched by hand",
        note: [u.sender, u.message].filter(Boolean).join(" · ").slice(0, 300),
      }, tx);
    }
    const left = remaining - rows.reduce((a, r) => a + r.amountCents, 0);
    if (left === 0) await tx.unmatchedPayment.update({ where: { id }, data: { status: "APPLIED", resolvedAt: new Date(), resolvedById: user.id } });
    await logActivity(tx, { businessId: user.businessId, type: "payment.matched", entityType: "UnmatchedPayment", entityId: id, actorType: "USER", actorUserId: user.id, data: { invoices: rows.length, leftCents: left } });
  });
  kickOutbox();
}

export async function dismissUnmatched(user: Actor, id: string, reason: string) {
  const u = await db.unmatchedPayment.findFirstOrThrow({ where: { id, businessId: user.businessId } });
  if (u.status !== "OPEN") return;
  await db.unmatchedPayment.update({ where: { id }, data: { status: "DISMISSED", dismissedReason: reason || "Not for an invoice", resolvedAt: new Date(), resolvedById: user.id } });
}
