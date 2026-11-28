// Visit operations: the field flow (on my way -> arrived -> done / skip), scheduling and reopening.
import { assertChecklistDone } from "./checklists";
import { assertSigned } from "./signatures";
import { Prisma, type SkipReason, type VisitState } from "@/generated/prisma/client";
import { extrasOffered, STORM_CHARGE, type OverrideLine } from "../billing/charges";
import { visitLinesLock } from "../status/job";
import { dateOnly, todayLocal, toDbDate } from "../dates";
import { invoiceUnbilled, issueInvoice } from "./invoices";
import { rebuildCharges, rebuildStormCharges } from "./visit-charges";
import { db } from "../db";
import { enqueue, enqueueSms, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { logActivity } from "../records";
import { getSettings } from "../settings";
import { assertTransition, skipNotice, TransitionError } from "../status/visit";
import { alertAssigned, withAssignAlert, type Assigned } from "./assign-alerts";
import { returnVisitPrice } from "../snow/tiers";

type Actor = { id: string; businessId: string };
export type TransitionExtra = {
  skipReason?: SkipReason; skipNote?: string; depthCm?: number | null; iceMeltApplied?: boolean | null;
  lat?: number | null; lng?: number | null; iceMeltBags?: number | null;
};

export async function transitionVisit(user: Actor, visitId: string, to: VisitState, extra: TransitionExtra = {}) {
  const updated = await transitionTx(user, visitId, to, extra);
  kickOutbox();
  return updated;
}

function transitionTx(user: Actor, visitId: string, to: VisitState, extra: TransitionExtra) {
  return db.$transaction(async (tx) => {
    const v = await tx.visit.findFirstOrThrow({
      where: { id: visitId, businessId: user.businessId },
      include: { job: { include: { lineItems: true } }, charges: true, snowEvent: { select: { measuredCm: true } } },
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
      // How much went down, when someone said. Never without ice melt; the charge is flat either way.
      iceMeltBags: (extra.iceMeltApplied ?? v.iceMeltApplied) === false ? null : extra.iceMeltBags ?? v.iceMeltBags,
      ...(v.scheduledDate ? {} : { scheduledDate: toDbDate(now.toISOString().slice(0, 10)) }),
    });
    if (to === "SKIPPED") Object.assign(data, { skippedAt: now, skipReason: extra.skipReason ?? "OTHER", skipNote: extra.skipNote || null });
    if (to === "SCHEDULED") Object.assign(data, { completedAt: null, skippedAt: null, skipReason: null, skipNote: null, enRouteAt: null, arrivedAt: null, iceMeltBags: null });
    const updated = await tx.visit.update({ where: { id: visitId }, data });
    // This push carried the once-per-storm charge and is no longer done: the charge moves to another completed push.
    if ((to === "SCHEDULED" || to === "CANCELLED") && v.snowEventId && v.charges.some((c) => !c.invoiceLineItemId && c.name.startsWith(STORM_CHARGE))) await rebuildStormCharges(tx, v.snowEventId, v.jobId);

    if (to === "COMPLETED") {
      const lines = (await rebuildCharges(tx, visitId)) ?? [];
      // Billed per visit (one-off jobs): invoice it now so the "all done" email can carry a pay link.
      if (lines.length && v.job.invoiceSchedule === "AFTER_EACH_VISIT") {
        const inv = await invoiceUnbilled(user, { clientId: v.job.clientId, visitId }, tx);
        if ((await getSettings(tx, user.businessId)).autoSendVisitInvoices) await issueInvoice(tx, inv.id); // same rules as Send: settles a zero balance, stamps auto-pay
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
    // Skipped for a reason the client can fix (their choice of reasons, off by default): tell them what happened and what to do,
    // by the same channels and rules as "all done" (text if they opted in and text updates are on; email unless it bounced).
    // Held 3 minutes so a mis-tap can be undone: reopening the visit removes whatever hasn't gone yet.
    const skipKeys = [`visit:${visitId}:skipped`, `visit:${visitId}:sms-skipped`];
    if (to === "SCHEDULED") await tx.emailMessage.deleteMany({ where: { businessId: user.businessId, dedupeKey: { in: skipKeys }, status: "QUEUED" } });
    if (to === "SKIPPED") {
      const settings = await getSettings(tx, user.businessId);
      if (settings.skipNotice && skipNotice(updated.skipReason, settings.skipNoticeReasons)) {
        const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
        const m = { businessId: user.businessId, props: { visitId }, sendAfter: new Date(Date.now() + 3 * 60_000), entityType: "Visit", entityId: visitId };
        if (client.email && !client.emailBouncedAt) await enqueue(tx, { ...m, template: "visit.skipped", to: client.email, replyTo: env.helpEmail, priority: 4, dedupeKey: skipKeys[0], clientId: client.id });
        if (settings.smsUpdates) await enqueueSms(tx, { ...m, template: "sms.visit_skipped", client, dedupeKey: skipKeys[1] });
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
    const e = await tx.visitExtra.findFirst({ where: { id: extraId, addedByClientId: client.id, visit: { businessId: client.businessId, state: "SCHEDULED", job: { clientId: client.id } } }, include: { visit: true } }); // only what they added themselves, never an extra the owner put on
    if (!e || (await tx.visit.updateMany({ where: { id: e.visitId, state: "SCHEDULED" }, data: { state: "SCHEDULED" } })).count !== 1) throw new TransitionError("That visit has already started");
    await tx.visitExtra.delete({ where: { id: e.id } });
    await logActivity(tx, { businessId: client.businessId, type: "visit.extra_removed", entityType: "Visit", entityId: e.visitId, actorType: "CLIENT", actorClientId: client.id, clientId: client.id, jobId: e.visit.jobId, data: { name: e.name } });
    return e;
  });
}

/** What an assignment alert watches on a visit that is still to be done (ops/assign-alerts.ts). */
const visitSnap = (user: Actor, visitId: string) => async (): Promise<Assigned | null> => {
  const v = await db.visit.findFirst({ where: { id: visitId, businessId: user.businessId, state: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] } }, select: { scheduledDate: true, startAt: true, anytime: true, assignees: { select: { userId: true } } } });
  return v && { date: dateOnly(v.scheduledDate), at: v.anytime ? null : v.startAt?.getTime() ?? null, userIds: v.assignees.map((a) => a.userId) };
};

export async function scheduleVisit(user: Actor, visitId: string, date: string | null) {
  await withAssignAlert(user, visitSnap(user, visitId), () => scheduleTx(user, visitId, date));
  kickOutbox();
}

async function scheduleTx(user: Actor, visitId: string, date: string | null, notify = true) {
  const v = await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId }, include: { job: true } });
  let emailed = false;
  await db.$transaction(async (tx) => {
    const moved = (v.scheduledDate?.toISOString().slice(0, 10) ?? null) !== date;
    // A new day voids the client's confirmation / reschedule request for the old one.
    await tx.visit.update({ where: { id: visitId }, data: { scheduledDate: date ? toDbDate(date) : null, ...(v.recurrenceDate ? { detachedFromRecurrence: true } : {}), ...(moved ? { confirmedAt: null, rescheduleRequest: null, rescheduleRequestedAt: null } : {}) } });
    const client = await tx.client.findUniqueOrThrow({ where: { id: v.job.clientId } });
    if (notify && date && v.job.kind !== "SNOW_PLAN" && (await getSettings(tx, user.businessId)).visitReminders && !client.emailBouncedAt) {
      const dedupeKey = `visit:${visitId}:scheduled:${date}`;
      // Reported back so the calendar can say whether this move told the client (a repeat for the same day queues nothing).
      const already = await tx.emailMessage.findUnique({ where: { businessId_dedupeKey: { businessId: user.businessId, dedupeKey } }, select: { id: true } });
      const queued = await enqueue(tx, {
        businessId: user.businessId, template: "visit.scheduled", to: client.email, replyTo: env.helpEmail, priority: 4, props: { visitId },
        dedupeKey, clientId: client.id, entityType: "Visit", entityId: visitId,
      });
      emailed = !already && !!queued;
    }
    await logActivity(tx, { businessId: user.businessId, type: "visit.scheduled_for", entityType: "Visit", entityId: visitId, actorType: "USER", actorUserId: user.id, clientId: v.job.clientId, jobId: v.jobId, data: { date } });
  });
  return emailed;
}

export async function addVisit(user: Actor, jobId: string, date: string | null) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId } });
  return db.visit.create({
    data: { businessId: user.businessId, jobId, propertyId: job.propertyId, scheduledDate: date ? toDbDate(date) : null, source: "MANUAL" },
  });
}

/**
 * The city plough came back and buried the driveway end: one more visit to the same property on the same storm, on
 * today's route with the same people. Billable = the return price as it stands now (kept on the visit, charged once
 * when it's done); otherwise included. Safe to replay: while a return visit is still open, asking again returns it.
 * `scope` limits which visits the caller may act on (crew: visitScope).
 */
export async function addReturnVisit(user: Actor, visitId: string, billable: boolean, scope: Prisma.VisitWhereInput = {}) {
  const made = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Visit" WHERE id = ${visitId} FOR UPDATE`; // two taps (or an offline replay) make one visit
    const v = await tx.visit.findFirst({ where: { id: visitId, businessId: user.businessId, ...scope }, include: { job: { include: { lineItems: true } }, assignees: true } });
    if (!v) throw new TransitionError("Visit not found");
    if (v.state !== "COMPLETED" || !v.snowEventId) throw new TransitionError("A return visit follows a completed storm visit");
    if (v.job.closedAt) throw new TransitionError("This job is closed");
    const open = await tx.visit.findFirst({ where: { jobId: v.jobId, snowEventId: v.snowEventId, isReturn: true, state: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] } } });
    if (open) return open;
    // The plan's clearing price before depth tiers and add-ons (a one-time booking: its per-visit lines).
    const base = v.job.kind === "SNOW_PLAN" ? v.job.pricePerPushCents ?? 3000 : v.job.lineItems.filter((l) => l.perVisit).reduce((a, l) => a + l.totalCents, 0);
    const today = todayLocal();
    const ret = await tx.visit.create({
      data: {
        businessId: user.businessId, jobId: v.jobId, propertyId: v.propertyId, snowEventId: v.snowEventId, scheduledDate: toDbDate(today), anytime: true, source: "MANUAL",
        isReturn: true, returnPriceCents: billable ? returnVisitPrice(base, (await getSettings(tx, user.businessId)).returnVisitPct) || null : null,
        assignees: { create: v.assignees.map((a) => ({ userId: a.userId })) },
      },
    });
    await alertAssigned(tx, user.businessId, user.id, v.assignees.map((a) => a.userId), today);
    await logActivity(tx, { businessId: user.businessId, type: "visit.return_added", entityType: "Visit", entityId: ret.id, actorType: "USER", actorUserId: user.id, clientId: v.job.clientId, jobId: v.jobId, snowEventId: v.snowEventId, data: { billable, from: visitId } });
    return ret;
  });
  kickOutbox();
  return made;
}

/** How much ice melt went down on a visit (bags; decimals fine). Reporting only: the charge stays flat per visit. */
export async function setIceMeltBags(user: Actor, visitId: string, bags: number | null) {
  const { count } = await db.visit.updateMany({ where: { id: visitId, businessId: user.businessId, state: "COMPLETED", iceMeltApplied: true }, data: { iceMeltBags: bags } });
  if (!count) throw new TransitionError("Ice melt wasn't put down on this visit");
}

/** Price this one visit differently from its job (extra work this time); null or no lines = back to the job's lines.
 *  Only while the visit is still to do (visitLinesLock): the charges are then made from these lines when it's done,
 *  exactly as they would be from the job's, so it bills once; once invoiced it can't change. */
export async function setVisitLines(user: Actor, visitId: string, lines: OverrideLine[] | null) {
  await db.$transaction(async (tx) => {
    const v = await tx.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId }, include: { job: true, charges: true } });
    const lock = visitLinesLock({ state: v.state, invoiced: v.charges.some((c) => c.invoiceLineItemId), kind: v.job.kind, billingType: v.job.billingType, closedAt: v.job.closedAt });
    if (lock) throw new TransitionError(lock);
    const next = lines?.length ? lines.map((l) => ({ name: l.name, ...(l.description ? { description: l.description } : {}), quantity: l.quantity, unitPriceCents: l.unitPriceCents })) : null;
    await tx.visit.update({ where: { id: visitId }, data: { lineOverrides: next ?? Prisma.DbNull } });
    await logActivity(tx, { businessId: user.businessId, type: "visit.lines_changed", entityType: "Visit", entityId: visitId, actorType: "USER", actorUserId: user.id, clientId: v.job.clientId, jobId: v.jobId, data: { lines: next } });
  });
}

export async function deleteVisit(user: Actor, visitId: string) {
  const v = await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId }, include: { charges: true } });
  if (v.state === "COMPLETED" || v.charges.length) throw new TransitionError("Completed visits can't be deleted; reopen it first");
  await db.visit.delete({ where: { id: visitId } });
}

/** Calendar drag with times (week/day view): date + optional start/end; no time = anytime that day. */
export const rescheduleVisitTimed = (user: Actor, visitId: string, m: VisitSlot, opts: { notify?: boolean } = {}) => moveVisit(user, visitId, m, null, opts);

/** Who's on a visit. */
export const setVisitAssignees = (user: Actor, visitId: string, userIds: string[]) => moveVisit(user, visitId, null, userIds);

type VisitSlot = { date: string | null; startAt?: Date | null; endAt?: Date | null };
/**
 * Reschedule and/or reassign a visit as ONE change (null = leave that part alone), so whoever is on it afterwards
 * gets a single assignment alert. Every reschedule and every assignee change goes through here.
 */
export async function moveVisit(user: Actor, visitId: string, when: VisitSlot | null, userIds: string[] | null, opts: { notify?: boolean } = {}) {
  const emailed = await withAssignAlert(user, visitSnap(user, visitId), async () => {
    let emailed = false;
    if (when) {
      emailed = await scheduleTx(user, visitId, when.date, opts.notify ?? true);
      await db.visit.update({ where: { id: visitId }, data: { startAt: when.startAt ?? null, endAt: when.endAt ?? null, anytime: !when.startAt } });
    }
    if (userIds) {
      await db.visit.findFirstOrThrow({ where: { id: visitId, businessId: user.businessId } });
      const ok = await db.user.findMany({ where: { id: { in: userIds }, businessId: user.businessId }, select: { id: true } });
      await db.$transaction([
        db.visitAssignee.deleteMany({ where: { visitId } }),
        db.visitAssignee.createMany({ data: ok.map((u) => ({ visitId, userId: u.id })) }),
      ]);
    }
    return emailed;
  });
  kickOutbox();
  /** How the client was told about the new time by this change, if they were. */
  return { notified: emailed ? ("email" as const) : null };
}
