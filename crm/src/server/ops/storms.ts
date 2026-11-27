// Storm operations (Aspire-style snow events). "Start storm" creates a visit for every every-snowfall plan
// whose trigger the storm meets. Everything here is safe to re-run: visits are unique per (job, storm, push).
import type { Prisma, SnowEvent } from "@/generated/prisma/client";
import { enqueue, enqueueSms } from "../email/outbox";
import { env } from "../env";
import { forecast } from "../forecast";
import { getSettings } from "../settings";
import { prettyDate, todayLocal, toDbDate } from "../dates";
import { db, type Tx } from "../db";
import { logActivity, nextNumber } from "../records";
import { plansTriggered } from "../snow/select";
import { seasonFor } from "../booking/create";
import { TransitionError } from "../status/visit";
import { invoiceUnbilled } from "./invoices";

type Actor = { id: string; businessId: string };

/** Create visits for push `push` of this storm. Returns how many new visits were created. */
async function generate(tx: Tx, ev: SnowEvent & { season: { defaultTriggerCm: number } }, cm: number, push: number, day: string) {
  const plans = await tx.job.findMany({
    where: { businessId: ev.businessId, kind: "SNOW_PLAN", seasonId: ev.seasonId, closedAt: null, planPausedAt: null },
    include: { property: { select: { routeSort: true } } },
  });
  const hit = plansTriggered(plans, cm, ev.season.defaultTriggerCm);
  const res = await tx.visit.createMany({
    skipDuplicates: true,
    data: hit.map((p) => ({
      businessId: ev.businessId, jobId: p.id, propertyId: p.propertyId, snowEventId: ev.id, pushNumber: push,
      scheduledDate: toDbDate(day), anytime: true, source: "SNOW_EVENT" as const, routeSort: p.property.routeSort,
      iceMeltApplied: p.iceMelt || null,
    })),
  });
  if (push === 1) {
    // One-time shovelling bookings waiting for snow ("as soon as possible", or dated on/before today) ride along.
    await tx.visit.updateMany({
      where: {
        businessId: ev.businessId, snowEventId: null, state: "SCHEDULED",
        job: { kind: "ONE_OFF", closedAt: null, title: { startsWith: "Snow" } },
        OR: [{ scheduledDate: null }, { scheduledDate: { lte: toDbDate(day) } }],
      },
      data: { snowEventId: ev.id, scheduledDate: toDbDate(day) },
    });
  }
  return res.count;
}

const load = (tx: Tx, user: Actor, id: string) =>
  tx.snowEvent.findFirstOrThrow({ where: { id, businessId: user.businessId }, include: { season: true } });

export async function createStorm(user: Actor, input: { forecastCm: number | null; day?: string; notes?: string }) {
  const day = input.day || todayLocal();
  return db.$transaction(async (tx) => {
    const season = await seasonFor(tx, user.businessId, day);
    const ev = await tx.snowEvent.create({
      data: {
        businessId: user.businessId, seasonId: season.id, number: await nextNumber(tx, user.businessId, "SNOW_EVENT"),
        name: `${prettyDate(day)} storm`, forecastCm: input.forecastCm, notes: input.notes || null, snowStartedAt: toDbDate(day),
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "storm.created", entityType: "SnowEvent", entityId: ev.id, actorType: "USER", actorUserId: user.id, snowEventId: ev.id });
    return ev;
  });
}

export async function startStorm(user: Actor, id: string, cm: number) {
  const periods = await forecast(); // network: outside the transaction
  return db.$transaction(async (tx) => {
    const ev = await load(tx, user, id);
    if (ev.status !== "FORECAST" && ev.status !== "ACTIVE") throw new TransitionError("This storm is already finished");
    const day = todayLocal();
    await tx.snowEvent.update({ where: { id }, data: { status: "ACTIVE", measuredCm: cm, activatedAt: ev.activatedAt ?? new Date() } });
    const created = await generate(tx, ev, cm, 1, day);
    // Keep what the forecast said, for "you said it would snow" conversations.
    if (periods && !ev.forecastSnapshot) await tx.snowEvent.update({ where: { id }, data: { forecastSnapshot: periods.slice(0, 48) as unknown as Prisma.InputJsonValue } });
    if ((await getSettings(tx, user.businessId)).smsUpdates) {
      const plans = await tx.visit.findMany({ where: { snowEventId: id, pushNumber: 1, job: { kind: "SNOW_PLAN" } }, include: { job: { include: { client: true } } } });
      for (const v of plans) {
        await enqueueSms(tx, { businessId: user.businessId, template: "sms.storm_heads_up", client: v.job.client, props: { visitId: v.id }, dedupeKey: `storm:${id}:sms:${v.job.clientId}`, entityType: "SnowEvent", entityId: id });
      }
    }
    if ((await getSettings(tx, user.businessId)).stormHeadsUp) {
      const visits = await tx.visit.findMany({ where: { snowEventId: id, pushNumber: 1, job: { kind: "SNOW_PLAN" } }, include: { job: { include: { client: true } } } });
      for (const v of visits) {
        if (!v.job.client.email || v.job.client.emailBouncedAt || v.job.client.marketingOptOut) continue;
        await enqueue(tx, {
          businessId: user.businessId, template: "storm.heads_up", to: v.job.client.email, replyTo: env.helpEmail, priority: 7, props: { visitId: v.id },
          dedupeKey: `storm:${id}:headsup:${v.job.clientId}`, clientId: v.job.clientId, entityType: "SnowEvent", entityId: id,
        });
      }
    }
    await logActivity(tx, { businessId: user.businessId, type: "storm.started", entityType: "SnowEvent", entityId: id, actorType: "USER", actorUserId: user.id, snowEventId: id, data: { cm, created } });
    return created;
  });
}

/** Change the depth. Deeper: plans that now qualify get visits. Shallower: visits not yet started are skipped. */
export async function setStormDepth(user: Actor, id: string, cm: number) {
  return db.$transaction(async (tx) => {
    const ev = await load(tx, user, id);
    await tx.snowEvent.update({ where: { id }, data: { measuredCm: cm } });
    if (ev.status !== "ACTIVE") return;
    const day = todayLocal();
    for (let push = 1; push <= ev.pushCount; push++) await generate(tx, ev, cm, push, day);
    const visits = await tx.visit.findMany({ where: { snowEventId: id, state: "SCHEDULED", job: { kind: "SNOW_PLAN" } }, include: { job: true } });
    const keep = new Set(plansTriggered(visits.map((v) => v.job), cm, ev.season.defaultTriggerCm).map((j) => j.id));
    const drop = visits.filter((v) => !keep.has(v.jobId)).map((v) => v.id);
    if (drop.length) await tx.visit.updateMany({ where: { id: { in: drop } }, data: { state: "SKIPPED", skippedAt: new Date(), skipReason: "BELOW_TRIGGER" } });
    // ...and any that were skipped as below-trigger but qualify again come back.
    await tx.visit.updateMany({
      where: { snowEventId: id, state: "SKIPPED", skipReason: "BELOW_TRIGGER", jobId: { in: [...keep] } },
      data: { state: "SCHEDULED", skippedAt: null, skipReason: null },
    });
    await logActivity(tx, { businessId: user.businessId, type: "storm.depth", entityType: "SnowEvent", entityId: id, actorType: "USER", actorUserId: user.id, snowEventId: id, data: { cm } });
  });
}

/** Snow kept falling: another round for every plan that got push 1. */
export async function addPush(user: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const ev = await load(tx, user, id);
    if (ev.status !== "ACTIVE") throw new TransitionError("Start the storm first");
    const push = ev.pushCount + 1;
    await tx.snowEvent.update({ where: { id }, data: { pushCount: push } });
    const created = await generate(tx, ev, ev.measuredCm ?? ev.forecastCm ?? 0, push, todayLocal());
    await logActivity(tx, { businessId: user.businessId, type: "storm.push", entityType: "SnowEvent", entityId: id, actorType: "USER", actorUserId: user.id, snowEventId: id, data: { push, created } });
    return created;
  });
}

export async function finishStorm(user: Actor, id: string) {
  await db.$transaction(async (tx) => {
    const ev = await load(tx, user, id);
    if (ev.status !== "ACTIVE") throw new TransitionError("Only an active storm can be finished");
    await tx.snowEvent.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), snowEndedAt: new Date() } });
    // Plans bill once per storm: one draft invoice per client, reviewed and sent from Billing.
    const clients = await tx.visitCharge.findMany({
      where: { businessId: user.businessId, invoiceLineItemId: null, visit: { snowEventId: id, job: { kind: "SNOW_PLAN", invoiceSchedule: "PER_SNOW_EVENT" } } },
      select: { visit: { select: { job: { select: { clientId: true } } } } },
    });
    for (const clientId of new Set(clients.map((c) => c.visit.job.clientId))) await invoiceUnbilled(user, { clientId, snowEventId: id }, tx);
    await logActivity(tx, { businessId: user.businessId, type: "storm.finished", entityType: "SnowEvent", entityId: id, actorType: "USER", actorUserId: user.id, snowEventId: id });
  });
}

/** Forecast bust: cancel visits nobody has started. Done visits stay done (and billable). */
export async function cancelStorm(user: Actor, id: string) {
  await db.$transaction(async (tx) => {
    const ev = await load(tx, user, id);
    if (ev.status === "COMPLETED") throw new TransitionError("A finished storm can't be cancelled");
    await tx.snowEvent.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.visit.updateMany({ where: { snowEventId: id, state: { in: ["SCHEDULED", "EN_ROUTE"] }, source: "SNOW_EVENT" }, data: { state: "CANCELLED" } });
    // One-time bookings that rode along go back to waiting for snow.
    await tx.visit.updateMany({ where: { snowEventId: id, state: "SCHEDULED", source: { not: "SNOW_EVENT" } }, data: { snowEventId: null, scheduledDate: null } });
    await logActivity(tx, { businessId: user.businessId, type: "storm.cancelled", entityType: "SnowEvent", entityId: id, actorType: "USER", actorUserId: user.id, snowEventId: id });
  });
}
