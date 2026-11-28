// Time tracking, expenses, and job profit (Jobber's job costing).
import { db } from "../db";
import { saveAny } from "../media";
import { TransitionError } from "../status/visit";
import { addDays, localDayStart, toDbDate } from "../dates";
import { clockPlan, type ClockAction } from "../status/clock";

type Actor = { id: string; businessId: string };
export const EXPENSE_CATEGORIES = ["Materials", "Ice melt / salt", "Fuel", "Dump fees", "Equipment", "Subcontractor", "Other"];

const minutesBetween = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / 60_000));

/** Run a clock action for one person (rule: status/clock.ts). Their user row is locked so two taps can't leave two entries running. */
async function clock(user: Actor, action: ClockAction, visit?: { id: string; jobId: string }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const now = new Date();
    // Two days back is plenty to follow back-to-back timers to the general entry they paused.
    const entries = await tx.timeEntry.findMany({ where: { businessId: user.businessId, userId: user.id, OR: [{ endedAt: null }, { startedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) } }] } });
    const plan = clockPlan(entries, action);
    if (plan.error) throw new TransitionError(plan.error);
    for (const t of plan.stop) await tx.timeEntry.update({ where: { id: t.id }, data: { endedAt: now, minutes: minutesBetween(t.startedAt, now) } });
    if (plan.start) await tx.timeEntry.create({ data: { businessId: user.businessId, userId: user.id, startedAt: now, ...(plan.start === "visit" && visit ? { visitId: visit.id, jobId: visit.jobId } : {}) } });
    return plan.stop.length;
  });
}

/** Start a timer on a visit; whatever this person has running (another visit, or the day clock) stops first. */
export async function startTimer(user: Actor, visitId: string) {
  const v = await db.visit.findFirst({ where: { id: visitId, businessId: user.businessId } });
  if (!v) throw new TransitionError("That visit is gone");
  return clock(user, "visitStart", v);
}
/** Stop the visit timer; the day clock picks up again if the timer had paused it. */
export const stopTimer = (user: Actor) => clock(user, "visitStop");
/** The day clock: general time, not tied to a visit. */
export const clockIn = (user: Actor) => clock(user, "clockIn");
export const clockOut = (user: Actor) => clock(user, "clockOut");

/** Owner stops someone's forgotten clock so the entry can be corrected. */
export async function stopEntry(user: Actor, id: string) {
  const t = await db.timeEntry.findFirst({ where: { id, businessId: user.businessId, endedAt: null } });
  if (!t) return;
  const now = new Date();
  await db.timeEntry.update({ where: { id }, data: { endedAt: now, minutes: minutesBetween(t.startedAt, now) } });
}

export async function addTime(user: Actor, input: { userId: string; jobId?: string; visitId?: string; date: string; minutes: number; note?: string }) {
  if (!(input.minutes > 0) || input.minutes > 24 * 60) throw new TransitionError("Enter the time worked (up to 24 hours)");
  const who = await db.user.findFirst({ where: { id: input.userId, businessId: user.businessId } });
  if (!who) throw new TransitionError("Pick someone on the team");
  let jobId = input.jobId;
  if (input.visitId) jobId = (await db.visit.findFirstOrThrow({ where: { id: input.visitId, businessId: user.businessId } })).jobId;
  else if (jobId) await db.job.findFirstOrThrow({ where: { id: jobId, businessId: user.businessId } });
  const start = new Date(`${input.date}T15:00:00Z`); // ~9am Calgary; only the day matters for manual entries
  return db.timeEntry.create({ data: { businessId: user.businessId, userId: who.id, jobId, visitId: input.visitId, startedAt: start, endedAt: new Date(start.getTime() + input.minutes * 60_000), minutes: Math.round(input.minutes), note: input.note?.slice(0, 500) || null } });
}

/** Approved time is locked for everyone until an owner un-approves it. */
async function assertUnlocked(user: Actor, id: string) {
  if (await db.timeEntry.findFirst({ where: { id, businessId: user.businessId, approvedAt: { not: null } }, select: { id: true } })) throw new TransitionError("That time is approved. Un-approve it to change it.");
}

export async function updateTime(user: Actor, id: string, minutes: number, note?: string) {
  if (!(minutes > 0) || minutes > 24 * 60) throw new TransitionError("Enter the time worked (up to 24 hours)");
  await assertUnlocked(user, id);
  await db.timeEntry.updateMany({ where: { id, businessId: user.businessId, endedAt: { not: null }, approvedAt: null }, data: { minutes: Math.round(minutes), note: note?.slice(0, 500) || null } });
}

export async function deleteTime(user: Actor, id: string) {
  await assertUnlocked(user, id);
  await db.timeEntry.deleteMany({ where: { id, businessId: user.businessId, approvedAt: null } });
}

/** Approve finished entries for Calgary days from..to (no `from` = everything up to `to`), for one person or everyone. */
export async function approveTime(user: Actor, r: { userId?: string; from?: string; to: string }) {
  const res = await db.timeEntry.updateMany({
    where: { businessId: user.businessId, userId: r.userId, endedAt: { not: null }, approvedAt: null, startedAt: { gte: r.from ? localDayStart(r.from) : undefined, lt: localDayStart(addDays(r.to, 1)) } },
    data: { approvedAt: new Date(), approvedById: user.id },
  });
  return res.count;
}

export async function unapproveTime(user: Actor, r: { userId: string; from: string; to: string }) {
  await db.timeEntry.updateMany({
    where: { businessId: user.businessId, userId: r.userId, approvedAt: { not: null }, startedAt: { gte: localDayStart(r.from), lt: localDayStart(addDays(r.to, 1)) } },
    data: { approvedAt: null, approvedById: null },
  });
}

export async function addExpense(user: Actor, input: { jobId?: string; date: string; category: string; description: string; amountCents: number; receipt?: { bytes: Buffer; contentType: string; filename?: string } }) {
  if (!input.description.trim()) throw new TransitionError("Describe the expense");
  if (!(input.amountCents > 0)) throw new TransitionError("Enter the amount");
  const job = input.jobId ? await db.job.findFirst({ where: { id: input.jobId, businessId: user.businessId } }) : null;
  if (input.jobId && !job) throw new TransitionError("That job is gone");
  const att = input.receipt ? await saveAny(user.businessId, input.receipt, { kind: "DOCUMENT", uploadedByType: "USER", uploadedById: user.id, jobId: job?.id, clientId: job?.clientId }) : null;
  return db.expense.create({
    data: { businessId: user.businessId, jobId: job?.id, userId: user.id, date: toDbDate(input.date), category: input.category.slice(0, 40) || "Other", description: input.description.trim().slice(0, 300), amountCents: input.amountCents, attachmentId: att?.id },
  });
}

export async function deleteExpense(user: Actor, id: string) {
  await db.expense.deleteMany({ where: { id, businessId: user.businessId } });
}

/** Revenue minus labour (minutes × the person's hourly cost) minus expenses. Pure, unit-tested. */
export function profitOf(revenueCents: number, time: { minutes: number | null; hourlyCostCents: number }[], expenses: { amountCents: number }[]) {
  const labourCents = Math.round(time.reduce((n, t) => n + ((t.minutes ?? 0) / 60) * t.hourlyCostCents, 0));
  const expenseCents = expenses.reduce((n, e) => n + e.amountCents, 0);
  const profitCents = revenueCents - labourCents - expenseCents;
  return { revenueCents, labourCents, expenseCents, profitCents, marginPct: revenueCents > 0 ? Math.round((profitCents / revenueCents) * 100) : null, minutes: time.reduce((n, t) => n + (t.minutes ?? 0), 0) };
}

/** A job's numbers: invoiced (not void) + work done but not billed yet, or the fixed price if nothing's billed. */
export async function jobProfit(businessId: string, jobId: string) {
  const [job, invoiced, unbilled, time, expenses] = await Promise.all([
    db.job.findFirstOrThrow({ where: { id: jobId, businessId }, include: { lineItems: true, visits: { where: { state: { notIn: ["CANCELLED", "SKIPPED"] } }, select: { id: true } } } }),
    db.invoice.aggregate({ where: { businessId, jobId, status: { notIn: ["VOID", "BAD_DEBT"] } }, _sum: { totalCents: true } }),
    db.visitCharge.aggregate({ where: { businessId, invoiceLineItemId: null, visit: { jobId } }, _sum: { totalCents: true } }),
    db.timeEntry.findMany({ where: { businessId, jobId, endedAt: { not: null } }, include: { user: true }, orderBy: { startedAt: "desc" } }),
    db.expense.findMany({ where: { businessId, jobId }, orderBy: { date: "desc" } }),
  ]);
  const billed = (invoiced._sum.totalCents ?? 0) + (unbilled._sum.totalCents ?? 0);
  // Nothing billed yet: estimate from the job's line items (per visit × visits, or the fixed price), like Jobber does.
  const perVisit = job.lineItems.reduce((n, l) => n + l.totalCents, 0);
  const revenue = billed || (job.billingType === "FIXED_PRICE" ? job.totalCents ?? perVisit : perVisit * Math.max(1, job.visits.length));
  return { ...profitOf(revenue, time.map((t) => ({ minutes: t.minutes, hourlyCostCents: t.user.hourlyCostCents })), expenses), time, expenses };
}

export const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
