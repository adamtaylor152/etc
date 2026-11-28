// Visit operations: the field flow (on my way -> arrived -> done / skip), scheduling and reopening.
import { assertChecklistDone } from "./checklists";
import { assertSigned } from "./signatures";
import type { SkipReason, VisitState } from "@/generated/prisma/client";
import { chargesForVisit, extrasOffered } from "../billing/charges";
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
    // Any un-invoiced charges are rebuilt from scratch, so completing twice never double-bills (and a cancelled visit bills nothing).
    if (v.state === "CANCELLED" && v.job.closedAt) throw new TransitionError("This job is closed: reopen the job first");
    if (to === "SCHEDULED" || to === "COMPLETED" || to === "CANCELLED") await tx.visitCharge.deleteMany({ where: { visitId, invoiceLineItemId: null } });

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
      // Read after the update above: it holds the visit's row lock, so an extra the client is adding right now is either in or refused.
      const extras = await tx.visitExtra.findMany({ where: { visitId }, orderBy: { createdAt: "asc" } });
      const lines = chargesForVisit(job, { pushNumber: v.pushNumber, iceMeltApplied: updated.iceMeltApplied }, await iceMeltPrice(tx, user.businessId), extras);
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

// ---------- one-off extras from the client hub ----------
/** Fixed-price add-on services: what a client may add to a visit. */
export const addOnServices = (businessId: string) =>
  db.service.findMany({ where: { businessId, active: true, isAddon: true, pricingMode: "FIXED", unitPriceCents: { not: null } }, orderBy: { sortOrder: "asc" } });

/** The client adds an add-on to one of their own visits that hasn't started. Charged when the visit is completed (chargesForVisit). */
export async function addVisitExtra(client: { id: string; businessId: string }, visitId: string, serviceId: string) {
  return db.$transaction(async (tx) => {
    const service = (await addOnServices(client.businessId)).find((s) => s.id === serviceId);
    // Locks the visit row, so this can't slip in while the visit is being completed (see transitionTx).
    const locked = await tx.visit.updateMany({ where: { id: visitId, businessId: client.businessId, state: "SCHEDULED", job: { clientId: client.id, closedAt: null, sizeHoldAt: null } }, data: { state: "SCHEDULED" } });
    if (!service || locked.count !== 1) throw new TransitionError("That can't be added to this visit any more");
    const v = await tx.visit.findUniqueOrThrow({ where: { id: visitId }, include: { job: { include: { lineItems: true } }, extras: true } });
    if (!extrasOffered([service], v.job, v.extras).length) throw new TransitionError("That's already part of this visit");
    await tx.visitExtra.create({ data: { businessId: client.businessId, visitId, serviceKey: service.key, name: service.name, unitPriceCents: service.unitPriceCents!, addedByClientId: client.id } });
    await logActivity(tx, { businessId: client.businessId, type: "visit.extra_added", entityType: "Visit", entityId: visitId, actorType: "CLIENT", actorClientId: client.id, clientId: client.id, jobId: v.jobId, data: { name: service.name, cents: service.unitPriceCents } });
    return { visit: v, name: service.name, cents: service.unitPriceCents! };
  });
}

/** The client takes one back, while the visit still hasn't started. */
export async function removeVisitExtra(client: { id: string; businessId: string }, extraId: string) {
  return db.$transaction(async (tx) => {
    const e = await tx.visitExtra.findFirst({ where: { id: extraId, visit: { businessId: client.businessId, state: "SCHEDULED", job: { clientId: client.id } } }, include: { visit: true } });
    if (!e || (await tx.visit.updateMany({ where: { id: e.visitId, state: "SCHEDULED" }, data: { state: "SCHEDULED" } })).count !== 1) throw new TransitionError("That visit has already started");
    await tx.visitExtra.delete({ where: { id: e.id } });
    await logActivity(tx, { businessId: client.businessId, type: "visit.extra_removed", entityType: "Visit", entityId: e.visitId, actorType: "CLIENT", actorClientId: client.id, clientId: client.id, jobId: e.visit.jobId, data: { name: e.name } });
    return e;
  });
}

export async function scheduleVisit(user: Actor, visitId: string, date: string | null) {
  await scheduleTx(user, visitId, date);
  kickOutbox();
}

async function scheduleTx(user: Actor, visitId: string, date: string | null, notify = true) {
  const v = await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId }, include: { job: true } });
  await db.$transaction(async (tx) => {
    const moved = (v.scheduledDate?.toISOString().slice(0, 10) ?? null) !== date;
    // A new day voids the client's confirmation / reschedule request for the old one.
    await tx.visit.update({ where: { id: visitId }, data: { scheduledDate: date ? toDbDate(date) : null, ...(v.recurrenceDate ? { detachedFromRecurrence: true } : {}), ...(moved ? { confirmedAt: null, rescheduleRequest: null, rescheduleRequestedAt: null } : {}) } });
    const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
    if (notify && date && v.job.kind !== "SNOW_PLAN" && (await getSettings(tx, user.businessId)).visitReminders && !client.emailBouncedAt) {
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
export async function rescheduleVisitTimed(user: Actor, visitId: string, m: { date: string | null; startAt?: Date | null; endAt?: Date | null }, opts: { notify?: boolean } = {}) {
  await scheduleTx(user, visitId, m.date, opts.notify ?? true);
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
