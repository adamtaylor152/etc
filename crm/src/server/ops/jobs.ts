// Job operations from the back office: new one-off jobs, every-snowfall plans, pause/close.
import { todayLocal, toDbDate } from "../dates";
import { db } from "../db";
import { logActivity, nextNumber } from "../records";
import { seasonFor } from "../booking/create";

type Actor = { id: string; businessId: string };
export type LineInput = { name: string; unitPriceCents: number; quantity: number };

export async function createOneOffJob(user: Actor, input: {
  clientId: string; propertyId: string; title: string; instructions?: string; lines: LineInput[]; date: string | null;
  billingType: "PER_VISIT" | "FIXED_PRICE";
}) {
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const lines = input.lines.map((l, i) => ({ ...l, totalCents: Math.round(l.quantity * l.unitPriceCents), sortOrder: i, perVisit: input.billingType === "PER_VISIT" }));
    const job = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        kind: "ONE_OFF", title: input.title, instructions: input.instructions || null, billingType: input.billingType,
        invoiceSchedule: input.billingType === "PER_VISIT" ? "AFTER_EACH_VISIT" : "ON_COMPLETION",
        totalCents: input.billingType === "FIXED_PRICE" ? lines.reduce((a, l) => a + l.totalCents, 0) : null,
        lineItems: { create: lines },
        visits: { create: [{ businessId: user.businessId, propertyId: prop.id, scheduledDate: input.date ? toDbDate(input.date) : null, routeSort: prop.routeSort }] },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "job.created", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: job.id });
    return job;
  });
}

export async function createSnowPlan(user: Actor, input: { clientId: string; propertyId: string; triggerCm: number | null; pricePerPushCents: number; iceMelt: boolean }) {
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const season = await seasonFor(tx, user.businessId, todayLocal());
    const existing = await tx.job.findFirst({ where: { propertyId: prop.id, seasonId: season.id, kind: "SNOW_PLAN", closedAt: null } });
    if (existing) return existing;
    const job = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        seasonId: season.id, kind: "SNOW_PLAN", title: "Every snowfall", billingType: "PER_VISIT", invoiceSchedule: "PER_SNOW_EVENT",
        snowBillingMode: "PER_PUSH", triggerCm: input.triggerCm, pricePerPushCents: input.pricePerPushCents, iceMelt: input.iceMelt,
        lineItems: { create: [{ name: "Snow shovelling, every snowfall (per push)", unitPriceCents: input.pricePerPushCents, totalCents: input.pricePerPushCents }] },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "plan.created", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: job.id });
    return job;
  });
}

export async function updatePlan(user: Actor, jobId: string, input: { triggerCm: number | null; pricePerPushCents: number; iceMelt: boolean }) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "SNOW_PLAN" } });
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: job.id }, data: input });
    await logActivity(tx, { businessId: user.businessId, type: "plan.updated", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId: job.id, data: input });
  });
}

export async function setPlanPaused(user: Actor, jobId: string, paused: boolean) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "SNOW_PLAN" } });
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: job.id }, data: { planPausedAt: paused ? new Date() : null } });
    await logActivity(tx, { businessId: user.businessId, type: paused ? "plan.paused" : "plan.resumed", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId: job.id });
  });
}

export async function setJobClosed(user: Actor, jobId: string, closed: boolean, reason?: string) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId } });
  await db.$transaction(async (tx) => {
    if (closed) {
      // Closing a job cancels whatever was still planned.
      await tx.visit.updateMany({ where: { jobId, state: { in: ["SCHEDULED", "EN_ROUTE"] } }, data: { state: "CANCELLED" } });
    }
    await tx.job.update({ where: { id: jobId }, data: closed ? { closedAt: new Date(), closeReason: reason || null } : { closedAt: null, closeReason: null } });
    await logActivity(tx, { businessId: user.businessId, type: closed ? "job.closed" : "job.reopened", entityType: "Job", entityId: jobId, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId });
  });
}
