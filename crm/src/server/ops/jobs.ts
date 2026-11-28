// Job operations from the back office: new one-off jobs, every-snowfall plans, pause/close.
import { alertAssigned } from "./assign-alerts";
import { WALK_PREFIX } from "../billing/charges";
import { defaultChecklistFor } from "./checklists";
import { Prisma, type SnowBillingMode } from "@/generated/prisma/client";
import { maxInstalments, planBillingLocked, seasonalTermsError } from "../billing/instalments";
import { recurringBillingError, type RecurringBilling } from "../billing/periods";
import { addDays, dateOnly, fromLocalInput, todayLocal, toDbDate } from "../dates";
import { lastRecurrenceDate, outsidePause, recurrenceDates, toRRule, type Repeat } from "../recurrence";
import { db, type Tx } from "../db";
import { logActivity, nextNumber } from "../records";
import { seasonFor } from "../booking/create";
import { currentCharge, setWalkLine, snowPrices } from "./drive-size";
import { jobEditLocks } from "../status/job";
import { TransitionError } from "../status/visit";
import { getSettings } from "../settings";
import { parseTiers, type DepthTier } from "../snow/tiers";

type Actor = { id: string; businessId: string };
export type LineInput = { name: string; description?: string; unitPriceCents: number; quantity: number };

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
          businessId: user.businessId, jobId: job.id, propertyId: prop.id, scheduledDate: d ? toDbDate(d) : null,
          ...(i === 0 && input.startAt ? { startAt: input.startAt, endAt: input.endAt ?? null, anytime: false } : {}), assignees,
        },
      });
    }
    await alertAssigned(tx, user.businessId, user.id, input.assigneeIds ?? [], dates.find((d) => d)); // first visit day only
    if (input.requestId) await tx.request.updateMany({ where: { id: input.requestId, businessId: user.businessId }, data: { status: "CONVERTED", convertedAt: new Date() } });
    await logActivity(tx, { businessId: user.businessId, type: "job.created", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: job.id });
    return job;
  });
}

export async function createSnowPlan(user: Actor, input: { clientId: string; propertyId: string; triggerCm: number | null; pricePerPushCents: number; iceMelt: boolean; billing?: PlanBilling; depthTiers?: DepthTier[] }) {
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  return db.$transaction(async (tx) => {
    const season = await seasonFor(tx, user.businessId, todayLocal());
    const existing = await tx.job.findFirst({ where: { propertyId: prop.id, seasonId: season.id, kind: "SNOW_PLAN", closedAt: null } });
    if (existing) return existing;
    const tiers = input.depthTiers ?? (await getSettings(tx, user.businessId)).depthTiers; // not given = the business's usual tiers
    const job = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        seasonId: season.id, kind: "SNOW_PLAN", title: "Every snowfall", billingType: "PER_VISIT", invoiceSchedule: "PER_SNOW_EVENT",
        ...(tiers.length ? { depthTiers: tiers } : {}),
        ...billingColumns(input.billing ?? { mode: "PER_PUSH" }, season), triggerCm: input.triggerCm, pricePerPushCents: input.pricePerPushCents, iceMelt: input.iceMelt,
        lineItems: { create: [{ name: "Snow shovelling, every snowfall (per push)", unitPriceCents: input.pricePerPushCents, totalCents: input.pricePerPushCents }] },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "plan.created", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: job.id });
    return job;
  });
}

/** Change a plan. The owner (a user) may change anything; a client (from their hub) only the add-ons of their own open plan
 *  that isn't waiting on a price OK. Nothing already charged moves: ice melt and extra sidewalk are read when a visit is completed.
 *  billing omitted = leave the billing mode alone. Changing mode, season price or instalment plan is refused once the plan is locked. */
export async function updatePlan(by: Actor | { businessId: string; clientId: string }, jobId: string,
                                 input: { triggerCm?: number | null; pricePerPushCents?: number; iceMelt?: boolean; extraWalk?: boolean; billing?: PlanBilling; depthTiers?: DepthTier[] }) {
  const client = "clientId" in by ? by.clientId : null;
  const job = await db.job.findFirstOrThrow({
    where: { id: jobId, businessId: by.businessId, kind: "SNOW_PLAN", ...(client ? { clientId: client, closedAt: null, sizeHoldAt: null } : {}) },
    include: { lineItems: true, season: true },
  });
  if (client && job.snowBillingMode === "SEASONAL") throw new TransitionError("Add-ons on a season-price plan are set by the office"); // nothing is charged per visit
  const { billing, extraWalk, depthTiers, ...rest } = input;
  // Tiers are the office's to set; like the price, a change applies to visits completed from now on.
  let cols: Prisma.JobUncheckedUpdateInput = depthTiers && !client ? { depthTiers: depthTiers.length ? depthTiers : Prisma.DbNull } : {};
  if (billing && !client) {
    if (!job.season) throw new TransitionError("This plan has no season");
    const next = billingColumns({ ...billing, firstDueOn: billing.firstDueOn || dateOnly(job.seasonalFirstDueOn) }, job.season);
    const changed = next.snowBillingMode !== (job.snowBillingMode ?? "PER_PUSH") || next.seasonalPriceCents !== job.seasonalPriceCents
      || next.seasonalInstalments !== job.seasonalInstalments || dateOnly(next.seasonalFirstDueOn) !== dateOnly(job.seasonalFirstDueOn);
    if (changed && planBillingLocked(await planBillingUse(job.id))) throw new TransitionError("This plan already has charges or instalment invoices, so its billing can't change. End it and start a new plan instead.");
    // A flat season price replaces any per-push price the client was still being asked to OK.
    cols = { ...cols, ...(!changed ? { addonsIncluded: next.addonsIncluded } : next.snowBillingMode === "SEASONAL" ? { ...next, sizeHoldAt: null, pendingPrice: Prisma.DbNull } : next) };
  }
  const walkChanged = extraWalk != null && extraWalk !== currentCharge(job.lineItems).walk > 0;
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: job.id }, data: { ...rest, ...cols } });
    if (walkChanged) {
      await setWalkLine(tx, job.id, extraWalk ? (await snowPrices(tx, by.businessId)).walk : 0);
      await tx.property.update({ where: { id: job.propertyId }, data: { extraWalk } }); // what the size check and the next booking start from
    }
    await logActivity(tx, {
      businessId: by.businessId, type: "plan.updated", entityType: "Job", entityId: job.id, clientId: job.clientId, jobId: job.id, data: { ...rest, ...(extraWalk != null ? { extraWalk } : {}), ...(billing ?? {}), ...(depthTiers && !client ? { depthTiers } : {}) },
      ...(client ? { actorType: "CLIENT" as const, actorClientId: client } : { actorType: "USER" as const, actorUserId: (by as Actor).id }),
    });
  });
  return job;
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

/** Facts for `jobEditLocks`. Voiding an invoice unlinks its charges, so only live invoices count. */
export async function jobEditFacts(tx: Tx | typeof db, job: { id: string; businessId: string }) {
  const [invoices, charges] = await Promise.all([
    tx.invoice.count({ where: { businessId: job.businessId, status: { not: "VOID" }, OR: [{ jobId: job.id }, { lineItems: { some: { OR: [{ jobId: job.id }, { visit: { jobId: job.id } }] } } }] } }),
    tx.visitCharge.count({ where: { visit: { jobId: job.id } } }),
  ]);
  return { invoiced: invoices > 0, hasCharges: charges > 0 };
}

/** Edit a job after creation. Title and instructions always; property, line items and billing type only where
 *  `jobEditLocks` allows. Existing charges and invoices are never touched: new prices apply to visits done from now on. */
export async function updateJob(user: Actor, jobId: string, input: {
  title: string; instructions?: string; propertyId?: string; lines?: LineInput[]; billingType?: "PER_VISIT" | "FIXED_PRICE";
}) {
  await db.$transaction(async (tx) => {
    const job = await tx.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
    const locks = jobEditLocks({ ...job, ...(await jobEditFacts(tx, job)) });
    const changed: string[] = [];
    const data: Parameters<typeof tx.job.update>[0]["data"] = {};
    if (input.title !== job.title) { data.title = input.title; changed.push("title"); }
    if ((input.instructions || null) !== job.instructions) { data.instructions = input.instructions || null; changed.push("instructions"); }

    if (input.propertyId && input.propertyId !== job.propertyId) {
      if (locks.property) throw new TransitionError(locks.property);
      const prop = await tx.property.findFirst({ where: { id: input.propertyId, clientId: job.clientId, businessId: user.businessId } });
      if (!prop) throw new TransitionError("Pick one of this client's properties");
      data.property = { connect: { id: prop.id } };
      // Visits still to do follow the job; done, skipped, cancelled or already-arrived ones stay where they happened.
      await tx.visit.updateMany({ where: { jobId, state: { in: ["SCHEDULED", "EN_ROUTE"] } }, data: { propertyId: prop.id, routeSort: null } }); // a today-only order belonged to the old address
      changed.push("property");
    }

    const billingType = input.billingType ?? job.billingType;
    if (billingType !== job.billingType) {
      if (locks.billing) throw new TransitionError(locks.billing);
      Object.assign(data, { billingType, invoiceSchedule: billingType === "PER_VISIT" ? "AFTER_EACH_VISIT" : "ON_COMPLETION" });
      changed.push("billing");
    }
    const current: LineInput[] = job.lineItems.map((l) => ({ name: l.name, description: l.description ?? undefined, quantity: Number(l.quantity), unitPriceCents: l.unitPriceCents }));
    const key = (ls: LineInput[]) => JSON.stringify(ls.map((l) => [l.name, l.description || "", l.quantity, l.unitPriceCents]));
    const linesChanged = !!input.lines && key(input.lines) !== key(current);
    if (linesChanged) {
      if (locks.lines) throw new TransitionError(locks.lines);
      if (!input.lines!.length) throw new TransitionError("Add at least one line item");
      changed.push("lines");
    }
    if (linesChanged || billingType !== job.billingType) {
      // Same shape as createOneOffJob: every line follows the billing type, and a fixed price is the sum of its lines.
      const rows = (linesChanged ? input.lines! : current).map((l, i) => ({
        jobId, name: l.name, description: l.description || null, quantity: l.quantity, unitPriceCents: l.unitPriceCents,
        totalCents: Math.round(l.quantity * l.unitPriceCents), sortOrder: i, perVisit: billingType === "PER_VISIT",
      }));
      await tx.jobLineItem.deleteMany({ where: { jobId } });
      await tx.jobLineItem.createMany({ data: rows });
      data.totalCents = billingType === "FIXED_PRICE" ? rows.reduce((a, l) => a + l.totalCents, 0) : null;
    }
    if (!changed.length) return;
    await tx.job.update({ where: { id: jobId }, data });
    await logActivity(tx, { businessId: user.businessId, type: "job.updated", entityType: "Job", entityId: jobId, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId, data: { changed } });
  });
}

// ---------- recurring jobs ----------
const HORIZON_DAYS = 90;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minuteOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** When and who for every generated visit ("HH:MM", Calgary time). No start time = any time that day. */
export type VisitDefaults = { startTime?: string | null; endTime?: string | null; assigneeIds?: string[] };

async function defaultColumns(user: Actor, d: VisitDefaults) {
  const start = d.startTime && HM.test(d.startTime) ? minuteOf(d.startTime) : null;
  const end = start != null && d.endTime && HM.test(d.endTime) ? minuteOf(d.endTime) : null;
  const people = d.assigneeIds?.length ? await db.user.findMany({ where: { id: { in: d.assigneeIds }, businessId: user.businessId }, select: { id: true } }) : [];
  return { anytime: start == null, defaultStartMinute: start, defaultDurationMin: start != null && end != null && end > start ? end - start : null, defaultAssigneeIds: people.map((p) => p.id) };
}

const scheduleColumns = (repeat: Repeat | null) => {
  const rrule = repeat ? toRRule(repeat) : null, last = rrule ? lastRecurrenceDate(rrule) : null;
  // recurrenceEndsOn = the last visit day of a rule that ends (on a date or after N visits): fixed-price billing stops with it.
  return { rrule, asNeeded: !repeat, recurrenceStartsOn: repeat ? toDbDate(repeat.startsOn) : null, recurrenceEndsOn: last ? toDbDate(last) : null };
};

/** Future visits of the series nobody has touched: safe to drop and rebuild. */
const untouched = (jobId: string) => ({
  jobId, source: "RECURRENCE" as const, state: "SCHEDULED" as const, detachedFromRecurrence: false, lineOverrides: { equals: Prisma.DbNull },
  scheduledDate: { gte: toDbDate(todayLocal()) }, charges: { none: {} }, attachments: { none: {} },
});

/** Create concrete visits for the next 90 days, with the job's time and people. Safe to re-run (unique on job + recurrenceDate). */
export async function generateRecurringVisits(businessId: string, jobId?: string) {
  const today = todayLocal();
  const jobs = await db.job.findMany({
    where: { businessId, kind: "RECURRING", closedAt: null, asNeeded: false, rrule: { not: null }, ...(jobId ? { id: jobId } : {}) },
  });
  let created = 0;
  for (const j of jobs) {
    const dates = outsidePause(recurrenceDates(j.rrule!, today, addDays(today, HORIZON_DAYS)), dateOnly(j.pausedFrom), dateOnly(j.pausedUntil));
    if (!dates.length) continue;
    const start = j.anytime ? null : j.defaultStartMinute;
    const made = await db.visit.createManyAndReturn({
      skipDuplicates: true, select: { id: true },
      data: dates.map((d) => ({
        businessId, jobId: j.id, propertyId: j.propertyId, scheduledDate: toDbDate(d), recurrenceDate: toDbDate(d), source: "RECURRENCE" as const,
        ...(start == null ? { anytime: true } : { anytime: false, startAt: fromLocalInput(`${d}T${clock(start)}`), endAt: j.defaultDurationMin ? fromLocalInput(`${d}T${clock(start + j.defaultDurationMin)}`) : null }),
      })),
    });
    if (made.length && j.defaultAssigneeIds.length) {
      // Someone taken off the team since simply isn't on the new visits.
      const people = await db.user.findMany({ where: { id: { in: j.defaultAssigneeIds }, businessId, active: true }, select: { id: true } });
      await db.visitAssignee.createMany({ skipDuplicates: true, data: made.flatMap((v) => people.map((p) => ({ visitId: v.id, userId: p.id }))) });
    }
    created += made.length;
  }
  return created;
}

export async function createRecurringJob(user: Actor, input: {
  clientId: string; propertyId: string; title: string; instructions?: string; lines: LineInput[]; repeat: Repeat | null;
  /** Parity with one-off jobs: time and people for each visit, the checklist (undefined = automatic), and how it's billed. */
  defaults?: VisitDefaults; checklistTemplateId?: string | null; billing?: RecurringBilling;
}) {
  const billing = input.billing ?? { method: "PER_VISIT", when: "MONTHLY" };
  const err = recurringBillingError(billing);
  if (err) throw new TransitionError(err);
  if (!input.lines.length) throw new TransitionError("Add at least one line item");
  const checklistTemplateId = input.checklistTemplateId === undefined ? await defaultChecklistFor(user.businessId, input.lines.map((l) => l.name)) : input.checklistTemplateId;
  const prop = await db.property.findFirstOrThrow({ where: { id: input.propertyId, clientId: input.clientId, businessId: user.businessId } });
  const defaults = await defaultColumns(user, input.defaults ?? {});
  const job = await db.$transaction(async (tx) => {
    const fixed = billing.method === "FIXED_PRICE";
    const lines = input.lines.map((l, i) => ({ ...l, totalCents: Math.round(l.quantity * l.unitPriceCents), sortOrder: i, perVisit: !fixed }));
    const j = await tx.job.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "JOB"), clientId: input.clientId, propertyId: prop.id,
        kind: "RECURRING", title: input.title, instructions: input.instructions || null, checklistTemplateId,
        // Fixed price = the lines' total, billed once a month whatever the visit count (invoiceRecurringPeriods).
        billingType: billing.method, invoiceSchedule: billing.when, invoiceDay: billing.when === "MONTHLY" ? billing.invoiceDay ?? null : null,
        totalCents: fixed ? lines.reduce((a, l) => a + l.totalCents, 0) : null,
        ...scheduleColumns(input.repeat), ...defaults, lineItems: { create: lines },
      },
    });
    await logActivity(tx, { businessId: user.businessId, type: "job.created", entityType: "Job", entityId: j.id, actorType: "USER", actorUserId: user.id, clientId: input.clientId, jobId: j.id });
    return j;
  });
  await generateRecurringVisits(user.businessId, job.id);
  const first = await db.visit.findFirst({ where: { jobId: job.id, scheduledDate: { not: null } }, orderBy: { scheduledDate: "asc" } });
  await alertAssigned(db, user.businessId, user.id, defaults.defaultAssigneeIds, dateOnly(first?.scheduledDate)); // first visit day only
  return job;
}

/** Change the schedule: future visits nobody touched are replaced; done, moved, re-priced or detached visits stay.
 *  defaults omitted = the job keeps its time and people (the rebuilt visits get them again). */
export async function updateRecurrence(user: Actor, jobId: string, repeat: Repeat | null, defaults?: VisitDefaults) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "RECURRING" } });
  const cols = defaults ? await defaultColumns(user, defaults) : {};
  await db.$transaction(async (tx) => {
    await tx.visit.deleteMany({ where: untouched(jobId) });
    await tx.job.update({ where: { id: jobId }, data: { ...scheduleColumns(repeat), ...cols } });
    await logActivity(tx, { businessId: user.businessId, type: "job.schedule_changed", entityType: "Job", entityId: jobId, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId });
  });
  await generateRecurringVisits(user.businessId, jobId);
}

/** Pause a recurring job between two days (inclusive): untouched visits in the range go and none are generated there.
 *  Both null = resume (the visits come back). Snow plans pause with a plain on/off switch instead (setPlanPaused). */
export async function setRecurringPause(user: Actor, jobId: string, from: string | null, until: string | null) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "RECURRING" } });
  if (!from !== !until) throw new TransitionError("Pick both the first and the last day of the pause");
  if (from && until && until < from) throw new TransitionError("The pause has to end on or after the day it starts");
  await db.$transaction(async (tx) => {
    const today = todayLocal();
    if (from && until) await tx.visit.deleteMany({ where: { ...untouched(jobId), scheduledDate: { gte: toDbDate(from > today ? from : today), lte: toDbDate(until) } } });
    await tx.job.update({ where: { id: jobId }, data: { pausedFrom: from ? toDbDate(from) : null, pausedUntil: until ? toDbDate(until) : null } });
    await logActivity(tx, { businessId: user.businessId, type: from ? "job.paused" : "job.resumed", entityType: "Job", entityId: jobId, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId, data: { from, until } });
  });
  await generateRecurringVisits(user.businessId, jobId);
}

/** When a recurring job is invoiced. The method (per visit / fixed per month) is set when the job is made (jobEditLocks). */
export async function setRecurringInvoicing(user: Actor, jobId: string, when: RecurringBilling["when"], invoiceDay: number | null) {
  const job = await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId, kind: "RECURRING" } });
  const err = recurringBillingError({ method: job.billingType, when, invoiceDay });
  if (err) throw new TransitionError(err);
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { invoiceSchedule: when, invoiceDay: when === "MONTHLY" ? invoiceDay : null } });
    await logActivity(tx, { businessId: user.businessId, type: "job.invoicing_changed", entityType: "Job", entityId: jobId, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId, data: { when, invoiceDay } });
  });
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
  const last = await db.job.findFirst({ where: { businessId, clientId, kind: "SNOW_PLAN" }, orderBy: { createdAt: "desc" }, include: { lineItems: true } });
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
        ...(parseTiers(last.depthTiers).length ? { depthTiers: parseTiers(last.depthTiers) } : {}), // same depth tiers as last season
        lineItems: { create: [
          { name: "Snow shovelling, every snowfall (per push)", unitPriceCents: last.pricePerPushCents ?? 3000, totalCents: last.pricePerPushCents ?? 3000 },
          ...last.lineItems.filter((l) => l.name.startsWith(WALK_PREFIX)).map((l) => ({ name: l.name, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, perVisit: true, sortOrder: 2 })), // the extra sidewalk carries over
        ] },
      },
    });
    await logActivity(tx, { businessId, type: "plan.renewed", entityType: "Job", entityId: job.id, actorType: actor.clientId ? "CLIENT" : "USER", actorUserId: actor.userId, actorClientId: actor.clientId, clientId, jobId: job.id, data: { season: season.name } });
    return job;
  });
}
