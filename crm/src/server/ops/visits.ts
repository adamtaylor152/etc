// Visit operations: the field flow (on my way -> arrived -> done / skip), scheduling and reopening.
import { assertChecklistDone } from "./checklists";
import { assertSigned } from "./signatures";
import type { SkipReason, VisitState } from "@/generated/prisma/client";
import { chargesForVisit } from "../billing/charges";
import { dueDate } from "../billing/invoice";
import { todayLocal, toDbDate } from "../dates";
import { invoiceUnbilled } from "./invoices";
import { db, type Tx } from "../db";
import { enqueue, enqueueSms, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity } from "../records";
import { getSettings } from "../settings";
import { assertTransition, TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };
export type TransitionExtra = {
  skipReason?: SkipReason; skipNote?: string; depthCm?: number | null; iceMeltApplied?: boolean | null;
  lat?: number | null; lng?: number | null;
};

async function iceMeltPrice(tx: Tx, businessId: string) {
  const s = await tx.service.findUnique({ where: { businessId_key: { businessId, key: "ice_melt" } } });
  return s?.unitPriceCents ?? 500;
}

export async function transitionVisit(user: Actor, visitId: string, to: VisitState, extra: TransitionExtra = {}) {
  const updated = await transitionTx(user, visitId, to, extra);
  kickOutbox();
  return updated;
}

function transitionTx(user: Actor, visitId: string, to: VisitState, extra: TransitionExtra) {
  return db.$transaction(async (tx) => {
    const v = await tx.visit.findFirstOrThrow({
      where: { id: visitId, businessId: user.businessId },
      include: { job: { include: { lineItems: true } }, charges: true },
    });
    assertTransition(v.state, to);
    const now = new Date();

    if (to === "SCHEDULED" && v.charges.some((c) => c.invoiceLineItemId)) throw new TransitionError("Already invoiced: void the invoice line first");
    // Any un-invoiced charges are rebuilt from scratch, so completing twice never double-bills.
    if (to === "SCHEDULED" || to === "COMPLETED") await tx.visitCharge.deleteMany({ where: { visitId, invoiceLineItemId: null } });

    const data: Parameters<typeof tx.visit.update>[0]["data"] = { state: to };
    if (to === "EN_ROUTE") data.enRouteAt = now;
    if (to === "IN_PROGRESS") data.arrivedAt = now;
    if (to === "COMPLETED") await assertChecklistDone(tx, user.businessId, visitId);
    if (to === "COMPLETED") await assertSigned(user.businessId, visitId, v.job.requireSignature);
    if (to === "COMPLETED") Object.assign(data, {
      completedAt: now, completedById: user.id, completedLat: extra.lat ?? null, completedLng: extra.lng ?? null,
      depthCm: extra.depthCm ?? v.depthCm, iceMeltApplied: extra.iceMeltApplied ?? v.iceMeltApplied,
      ...(v.scheduledDate ? {} : { scheduledDate: toDbDate(now.toISOString().slice(0, 10)) }),
    });
    if (to === "SKIPPED") Object.assign(data, { skippedAt: now, skipReason: extra.skipReason ?? "OTHER", skipNote: extra.skipNote || null });
    if (to === "SCHEDULED") Object.assign(data, { completedAt: null, skippedAt: null, skipReason: null, skipNote: null, enRouteAt: null, arrivedAt: null });
    const updated = await tx.visit.update({ where: { id: visitId }, data });

    if (to === "COMPLETED") {
      const job = { ...v.job, lineItems: v.job.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity) })) };
      const lines = chargesForVisit(job, { pushNumber: v.pushNumber, iceMeltApplied: updated.iceMeltApplied }, await iceMeltPrice(tx, user.businessId));
      if (lines.length) await tx.visitCharge.createMany({ data: lines.map((l) => ({ ...l, businessId: user.businessId, visitId })) });
      // Billed per visit (one-off jobs): invoice it now so the "all done" email can carry a pay link.
      if (lines.length && v.job.invoiceSchedule === "AFTER_EACH_VISIT") {
        const inv = await invoiceUnbilled(user, { clientId: v.job.clientId, visitId }, tx);
        if ((await getSettings(tx, user.businessId)).autoSendVisitInvoices) {
          const today = todayLocal();
          await tx.invoice.update({ where: { id: inv.id }, data: { status: "AWAITING_PAYMENT", issuedOn: toDbDate(today), dueOn: toDbDate(dueDate(today, inv.paymentTerms)), sentAt: new Date() } });
        }
      }
      // "All done" email with before/after photos. Waits 5 minutes so photos taken right after tapping Done make it in;
      // the dedupe key means reopening and completing again never sends it twice.
      const settings = await getSettings(tx, user.businessId);
      const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
      if (settings.visitDoneEmail && client.email && !client.emailBouncedAt) {
        await enqueue(tx, {
          businessId: user.businessId, template: "visit.done", to: client.email, replyTo: env.helpEmail, priority: 5, props: { visitId },
          dedupeKey: `visit:${visitId}:done`, sendAfter: new Date(Date.now() + 5 * 60_000), clientId: client.id, entityType: "Visit", entityId: visitId,
        });
      }
    }
    if ((to === "EN_ROUTE" || to === "COMPLETED") && (await getSettings(tx, user.businessId)).smsUpdates) {
      const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
      await enqueueSms(tx, {
        businessId: user.businessId, client, props: { visitId }, entityType: "Visit", entityId: visitId,
        ...(to === "EN_ROUTE"
          ? { template: "sms.on_my_way" as const, dedupeKey: `visit:${visitId}:sms-omw` }
          : { template: "sms.visit_done" as const, dedupeKey: `visit:${visitId}:sms-done`, sendAfter: new Date(Date.now() + 5 * 60_000) }),
      });
    }
    if (to === "EN_ROUTE" && (await getSettings(tx, user.businessId)).onMyWayEmail) {
      const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
      if (client.email && !client.emailBouncedAt) {
        await enqueue(tx, {
          businessId: user.businessId, template: "visit.on_my_way", to: client.email, replyTo: env.helpEmail, priority: 3, props: { visitId },
          dedupeKey: `visit:${visitId}:omw`, clientId: client.id, entityType: "Visit", entityId: visitId,
        });
      }
    }
    await logActivity(tx, {
      businessId: user.businessId, type: `visit.${to.toLowerCase()}`, entityType: "Visit", entityId: visitId,
      actorType: "USER", actorUserId: user.id, clientId: v.job.clientId, jobId: v.jobId, snowEventId: v.snowEventId ?? undefined,
      data: extra.skipReason ? { reason: extra.skipReason, note: extra.skipNote ?? null } : {},
    });
    return updated;
  });
}

export async function scheduleVisit(user: Actor, visitId: string, date: string | null) {
  await scheduleTx(user, visitId, date);
  kickOutbox();
}

async function scheduleTx(user: Actor, visitId: string, date: string | null) {
  const v = await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId }, include: { job: true } });
  await db.$transaction(async (tx) => {
    await tx.visit.update({ where: { id: visitId }, data: { scheduledDate: date ? toDbDate(date) : null, ...(v.recurrenceDate ? { detachedFromRecurrence: true } : {}) } });
    const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
    if (date && v.job.kind !== "SNOW_PLAN" && (await getSettings(tx, user.businessId)).visitReminders && !client.emailBouncedAt) {
      await enqueue(tx, {
        businessId: user.businessId, template: "visit.scheduled", to: client.email, replyTo: env.helpEmail, priority: 4, props: { visitId },
        dedupeKey: `visit:${visitId}:scheduled:${date}`, clientId: client.id, entityType: "Visit", entityId: visitId,
      });
    }
    await logActivity(tx, { businessId: user.businessId, type: "visit.scheduled_for", entityType: "Visit", entityId: visitId, actorType: "USER", actorUserId: user.id, clientId: v.job.clientId, jobId: v.jobId, data: { date } });
  });
}

export async function addVisit(user: Actor, jobId: string, date: string | null) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId } });
  const prop = await db.property.findUniqueOrThrow({ where: { id: job.propertyId } });
  return db.visit.create({
    data: { businessId: user.businessId, jobId, propertyId: job.propertyId, scheduledDate: date ? toDbDate(date) : null, source: "MANUAL", routeSort: prop.routeSort },
  });
}

export async function deleteVisit(user: Actor, visitId: string) {
  const v = await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId }, include: { charges: true } });
  if (v.state === "COMPLETED" || v.charges.length) throw new TransitionError("Completed visits can't be deleted; reopen it first");
  await db.visit.delete({ where: { id: visitId } });
}

/** Calendar drag with times (week/day view): date + optional start/end; no time = anytime that day. */
export async function rescheduleVisitTimed(user: Actor, visitId: string, m: { date: string | null; startAt?: Date | null; endAt?: Date | null }) {
  await scheduleTx(user, visitId, m.date);
  await db.visit.update({ where: { id: visitId }, data: { startAt: m.startAt ?? null, endAt: m.endAt ?? null, anytime: !m.startAt } });
  kickOutbox();
}

/** Who's on a visit. */
export async function setVisitAssignees(user: Actor, visitId: string, userIds: string[]) {
  await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId } });
  const ok = await db.user.findMany({ where: { id: { in: userIds }, businessId: user.businessId }, select: { id: true } });
  await db.$transaction([
    db.visitAssignee.deleteMany({ where: { visitId } }),
    db.visitAssignee.createMany({ data: ok.map((u) => ({ visitId, userId: u.id })) }),
  ]);
}
