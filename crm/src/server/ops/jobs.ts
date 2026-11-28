// Job operations from the back office: new one-off jobs, every-snowfall plans, pause/close.
import { defaultChecklistFor } from "./checklists";
import { Prisma, type SnowBillingMode } from "@/generated/prisma/client";
import { maxInstalments, planBillingLocked, seasonalTermsError } from "../billing/instalments";
import { addDays, dateOnly, todayLocal, toDbDate } from "../dates";
import { recurrenceDates, toRRule, type Repeat } from "../recurrence";
import { db } from "../db";
import { logActivity, nextNumber } from "../records";
import { seasonFor } from "../booking/create";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };
export type LineInput = { name: string; unitPriceCents: number; quantity: number };

/** How a snow plan is billed. The seasonal fields only matter for SEASONAL. */
export type PlanBilling = { mode: SnowBillingMode; seasonalPriceCents?: number | null; instalments?: number | null; firstDueOn?: string | null; addonsIncluded?: boolean };

/** Job columns for a billing mode. Seasonal terms must fit the season; the first payment defaults to today (or the season's first day). */
function billingColumns(b: PlanBilling, season: { startsOn: Date; endsOn: Date }) {
  if (b.mode !== "SEASONAL") return { snowBillingMode: b.mode, seasonalPriceCents: null, seasonalInstalments: null, seasonalFirstDueOn: null, addonsIncluded: false };
  const today = todayLocal(), starts = dateOnly(season.startsOn)!;
  const firstDueOn = b.firstDueOn || (starts > today ? starts : today);
  const count = b.instalments ?? 1;
  const err = seasonalTermsError({ priceCents: b.seasonalPriceCents ?? null, count, firstDueOn, seasonEndsOn: dateOnly(season.endsOn)! });
  if (err) throw new TransitionError(err);
  return { snowBillingMode: b.mode, seasonalPriceCents: b.seasonalPriceCents!, seasonalInstalments: count, seasonalFirstDueOn: toDbDate(firstDueOn), addonsIncluded: !!b.addonsIncluded };
}

/** What has already been billed under a plan's current terms (see planBillingLocked). */
export const planBillingUse = async (jobId: string) => ({
  visitCharges: await db.visitCharge.count({ where: { visit: { jobId } } }),
  instalmentInvoices: await db.invoice.count({ where: { instalmentKey: { startsWith: `${jobId}:` } } }),
});

export async function createOneOffJob(user: Actor, input: {
  clientId: string; propertyId: string; title: string; instructions?: string; lines: LineInput[]; date: string | null;
  billingType: "PER_VISIT" | "FIXED_PRICE";
  /** Jobber-style extras: a time on the first visit, more visit dates, who's going, and the request it came from. */
  startAt?: Date | null; endAt?: Date | null; moreDates?: string[]; assigneeIds?: string[]; requestId?: string | null;
  checklistTemplateId?: string | null;
}) {
  const checklistTemplateId = input.checklistTemplateId === undefined ? await defaultChecklistFor(user.businessId, input.lines.map((l) => l.name)) : input.checklistTemplateId;
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const lines = input.lines.map((l, i) => ({ ...l, totalCents: Math.round(l.quantity * l.unitPriceCents), sortOrder: i, perVisit: input.billingType === "PER_VISIT" }));
    const job = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        kind: "ONE_OFF", title: input.title, instructions: input.instructions || null, billingType: input.billingType,
        invoiceSchedule: input.billingType === "PER_VISIT" ? "AFTER_EACH_VISIT" : "ON_COMPLETION",
        totalCents: input.billingType === "FIXED_PRICE" ? lines.reduce((a, l) => a + l.totalCents, 0) : null,
        lineItems: { create: lines }, requestId: input.requestId || null, checklistTemplateId,
      },
    });
    const assignees = { create: (input.assigneeIds ?? []).map((userId) => ({ userId })) };
    const dates = [input.date, ...(input.moreDates ?? []).filter((d) => d && d !== input.date)].slice(0, 20);
    for (const [i, d] of dates.entries()) {
      await tx.visit.create({
        data: {
          businessId: user.businessId, jobId: job.id, propertyId: prop.id, scheduledDate: d ? toDbDate(d) : null, routeSort: prop.routeSort,
          ...(i === 0 && input.startAt ? { startAt: input.startAt, endAt: input.endAt ?? null, anytime: false } : {}), assignees,
        },
      });
    }
    if (input.requestId) await tx.request.updateMany({ where: { id: input.requestId, businessId: user.businessId }, data: { status: "CONVERTED", convertedAt: new Date() } });
    await logActivity(tx, { businessId: user.businessId, type: "job.created", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: job.id });
    return job;
  });
}

export async function createSnowPlan(user: Actor, input: { clientId: string; propertyId: string; triggerCm: number | null; pricePerPushCents: number; iceMelt: boolean; billing?: PlanBilling }) {
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const season = await seasonFor(tx, user.businessId, todayLocal());
    const existing = await tx.job.findFirst({ where: { propertyId: prop.id, seasonId: season.id, kind: "SNOW_PLAN", closedAt: null } });
    if (existing) return existing;
    const job = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        seasonId: season.id, kind: "SNOW_PLAN", title: "Every snowfall", billingType: "PER_VISIT", invoiceSchedule: "PER_SNOW_EVENT",
        ...billingColumns(input.billing ?? { mode: "PER_PUSH" }, season), triggerCm: input.triggerCm, pricePerPushCents: input.pricePerPushCents, iceMelt: input.iceMelt,
        lineItems: { create: [{ name: "Snow shovelling, every snowfall (per push)", unitPriceCents: input.pricePerPushCents, totalCents: input.pricePerPushCents }] },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "plan.created", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: job.id });
    return job;
  });
}

/** billing omitted = leave the billing mode alone. Changing mode, season price or instalment plan is refused once the plan is locked. */
export async function updatePlan(user: Actor, jobId: string, input: { triggerCm: number | null; pricePerPushCents: number; iceMelt: boolean; billing?: PlanBilling }) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "SNOW_PLAN" }, include: { season: true } });
  const { billing, ...rest } = input;
  let cols: Prisma.JobUncheckedUpdateInput = {};
  if (billing) {
    if (!job.season) throw new TransitionError("This plan has no season");
    const next = billingColumns({ ...billing, firstDueOn: billing.firstDueOn || dateOnly(job.seasonalFirstDueOn) }, job.season);
    const changed = next.snowBillingMode !== (job.snowBillingMode ?? "PER_PUSH") || next.seasonalPriceCents !== job.seasonalPriceCents
      || next.seasonalInstalments !== job.seasonalInstalments || dateOnly(next.seasonalFirstDueOn) !== dateOnly(job.seasonalFirstDueOn);
    if (changed && planBillingLocked(await planBillingUse(job.id))) throw new TransitionError("This plan already has charges or instalment invoices, so its billing can't change. End it and start a new plan instead.");
    // A flat season price replaces any per-push price the client was still being asked to OK.
    cols = !changed ? { addonsIncluded: next.addonsIncluded } : next.snowBillingMode === "SEASONAL" ? { ...next, sizeHoldAt: null, pendingPrice: Prisma.DbNull } : next;
  }
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: job.id }, data: { ...rest, ...cols } });
    await logActivity(tx, { businessId: user.businessId, type: "plan.updated", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId: job.id, data: { ...rest, ...(billing ?? {}) } });
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

// ---------- recurring jobs ----------
const HORIZON_DAYS = 90;

/** Create concrete visits for the next 90 days. Safe to re-run (unique on job + recurrenceDate). */
export async function generateRecurringVisits(businessId: string, jobId?: string) {
  const today = todayLocal();
  const jobs = await db.job.findMany({
    where: { businessId, kind: "RECURRING", closedAt: null, asNeeded: false, rrule: { not: null }, ...(jobId ? { id: jobId } : {}) },
    include: { property: { select: { routeSort: true } } },
  });
  let created = 0;
  for (const j of jobs) {
    const dates = recurrenceDates(j.rrule!, today, addDays(today, HORIZON_DAYS));
    if (!dates.length) continue;
    const res = await db.visit.createMany({
      skipDuplicates: true,
      data: dates.map((d) => ({
        businessId, jobId: j.id, propertyId: j.propertyId, scheduledDate: toDbDate(d), recurrenceDate: toDbDate(d),
        source: "RECURRENCE" as const, anytime: true, routeSort: j.property.routeSort,
      })),
    });
    created += res.count;
  }
  return created;
}

export async function createRecurringJob(user: Actor, input: {
  clientId: string; propertyId: string; title: string; instructions?: string; lines: LineInput[]; repeat: Repeat | null;
}) {
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  const job = await db.$transaction(async (tx) => {
    const lines = input.lines.map((l, i) => ({ ...l, totalCents: Math.round(l.quantity * l.unitPriceCents), sortOrder: i, perVisit: true }));
    const j = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        kind: "RECURRING", title: input.title, instructions: input.instructions || null, billingType: "PER_VISIT", invoiceSchedule: "MONTHLY",
        rrule: input.repeat ? toRRule(input.repeat) : null, asNeeded: !input.repeat,
        recurrenceStartsOn: input.repeat ? toDbDate(input.repeat.startsOn) : null, recurrenceEndsOn: input.repeat?.endsOn ? toDbDate(input.repeat.endsOn) : null,
        lineItems: { create: lines },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "job.created", entityType: "Job", entityId: j.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: j.id });
    return j;
  });
  await generateRecurringVisits(user.businessId, job.id);
  return job;
}

/** Change the schedule: future visits nobody touched are replaced; done, moved or detached visits stay. */
export async function updateRecurrence(user: Actor, jobId: string, repeat: Repeat | null) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "RECURRING" } });
  await db.$transaction(async (tx) => {
    await tx.visit.deleteMany({
      where: { jobId, source: "RECURRENCE", state: "SCHEDULED", detachedFromRecurrence: false, scheduledDate: { gte: toDbDate(todayLocal()) }, charges: { none: {} }, attachments: { none: {} } },
    });
    await tx.job.update({
      where: { id: jobId },
      data: {
        rrule: repeat ? toRRule(repeat) : null, asNeeded: !repeat, recurrenceStartsOn: repeat ? toDbDate(repeat.startsOn) : null,
        recurrenceEndsOn: repeat?.endsOn ? toDbDate(repeat.endsOn) : null,
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "job.schedule_changed", entityType: "Job", entityId: jobId, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId });
  });
  await generateRecurringVisits(user.businessId, jobId);
}

// ---------- plan renewals ----------
/** The season renewals target: the next one if it's been set up, otherwise the current one. */
export async function renewalSeason(businessId: string) {
  const today = toDbDate(todayLocal());
  return (await db.season.findFirst({ where: { businessId, startsOn: { gt: today } }, orderBy: { startsOn: "asc" } }))
    ?? db.season.findFirst({ where: { businessId, startsOn: { lte: today }, endsOn: { gte: today } } });
}

/** Clients who had an every-snowfall plan before but not yet in the target season. */
export async function renewalCandidates(businessId: string, seasonId: string) {
  const had = await db.job.findMany({ where: { businessId, kind: "SNOW_PLAN", seasonId: { not: seasonId } }, select: { clientId: true }, distinct: ["clientId"] });
  const has = new Set((await db.job.findMany({ where: { businessId, kind: "SNOW_PLAN", seasonId, closedAt: null }, select: { clientId: true } })).map((j) => j.clientId));
  return had.map((h) => h.clientId).filter((id) => !has.has(id));
}

/** Copy a client's most recent plan (same address, trigger, price, ice melt) into the target season. */
export async function renewPlan(businessId: string, clientId: string, actor: { userId?: string; clientId?: string }) {
  const season = await renewalSeason(businessId);
  if (!season) throw new Error("No season set up to renew into");
  const last = await db.job.findFirst({ where: { businessId, clientId, kind: "SNOW_PLAN" }, orderBy: { createdAt: "desc" } });
  if (!last) throw new Error("No previous plan");
  return db.$transaction(async (tx) => {
    const existing = await tx.job.findFirst({ where: { propertyId: last.propertyId, seasonId: season.id, kind: "SNOW_PLAN", closedAt: null } });
    if (existing) return existing;
    // A seasonal plan keeps its season price and instalment plan (as many as still fit); the first payment is due when the new season starts.
    const today = todayLocal(), starts = dateOnly(season.startsOn)!, firstDueOn = starts > today ? starts : today;
    const billing = billingColumns({
      mode: last.snowBillingMode ?? "PER_PUSH", seasonalPriceCents: last.seasonalPriceCents, firstDueOn, addonsIncluded: last.addonsIncluded,
      instalments: Math.max(1, Math.min(last.seasonalInstalments ?? 1, maxInstalments(firstDueOn, dateOnly(season.endsOn)!))),
    }, season);
    const job = await tx.job.create({
      data: {
        businessId, number: await nextNumber(tx, businessId, "JOB"), clientId, propertyId: last.propertyId, seasonId: season.id, kind: "SNOW_PLAN",
        title: "Every snowfall", billingType: "PER_VISIT", invoiceSchedule: last.invoiceSchedule, ...billing,
        triggerCm: last.triggerCm, pricePerPushCents: last.pricePerPushCents, iceMelt: last.iceMelt, instructions: last.instructions,
        lineItems: { create: [{ name: "Snow shovelling, every snowfall (per push)", unitPriceCents: last.pricePerPushCents ?? 3000, totalCents: last.pricePerPushCents ?? 3000 }] },
      },
    });
    await logActivity(tx, { businessId, type: "plan.renewed", entityType: "Job", entityId: job.id, actorType: actor.clientId ? "CLIENT" : "USER", actorUserId: actor.userId, actorClientId: actor.clientId, clientId, jobId: job.id, data: { season: season.name } });
    return job;
  });
}
