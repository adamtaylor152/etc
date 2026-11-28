// Time tracking, expenses, and job profit (Jobber's job costing).
import { db } from "../db";
import { saveAny } from "../media";
import { TransitionError } from "../status/visit";
import { toDbDate } from "../dates";

type Actor = { id: string; businessId: string };
export const EXPENSE_CATEGORIES = ["Materials", "Ice melt / salt", "Fuel", "Dump fees", "Equipment", "Subcontractor", "Other"];

const minutesBetween = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / 60_000));

/** Start a timer on a visit; any timer this person already has running is stopped first (one at a time). */
export async function startTimer(user: Actor, visitId: string) {
  const v = await db.visit.findFirst({ where: { id: visitId, businessId: user.businessId } });
  if (!v) throw new TransitionError("That visit is gone");
  await stopTimer(user);
  return db.timeEntry.create({ data: { businessId: user.businessId, userId: user.id, visitId, jobId: v.jobId, startedAt: new Date() } });
}

export async function stopTimer(user: Actor) {
  const running = await db.timeEntry.findMany({ where: { businessId: user.businessId, userId: user.id, endedAt: null } });
  const now = new Date();
  for (const t of running) await db.timeEntry.update({ where: { id: t.id }, data: { endedAt: now, minutes: minutesBetween(t.startedAt, now) } });
  return running.length;
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

export async function updateTime(user: Actor, id: string, minutes: number, note?: string) {
  if (!(minutes > 0) || minutes > 24 * 60) throw new TransitionError("Enter the time worked (up to 24 hours)");
  await db.timeEntry.updateMany({ where: { id, businessId: user.businessId, endedAt: { not: null } }, data: { minutes: Math.round(minutes), note: note?.slice(0, 500) || null } });
}

export async function deleteTime(user: Actor, id: string) {
  await db.timeEntry.deleteMany({ where: { id, businessId: user.businessId } });
}

export async function addExpense(user: Actor, input: { jobId?: string; date: string; category: string; description: string; amountCents: number; gstCents?: number; vendor?: string; receipt?: { bytes: Buffer; contentType: string; filename?: string } }) {
  if (!input.description.trim()) throw new TransitionError("Describe the expense");
  if (!(input.amountCents > 0)) throw new TransitionError("Enter the amount");
  const extra = expenseExtras(input);
  const job = input.jobId ? await db.job.findFirst({ where: { id: input.jobId, businessId: user.businessId } }) : null;
  if (input.jobId && !job) throw new TransitionError("That job is gone");
  const att = input.receipt ? await saveAny(user.businessId, input.receipt, { kind: "DOCUMENT", uploadedByType: "USER", uploadedById: user.id, jobId: job?.id, clientId: job?.clientId }) : null;
  return db.expense.create({
    data: { businessId: user.businessId, jobId: job?.id, userId: user.id, date: toDbDate(input.date), category: input.category.slice(0, 40) || "Other", description: input.description.trim().slice(0, 300), amountCents: input.amountCents, ...extra, attachmentId: att?.id },
  });
}

/** Vendor and the GST part of an expense. The GST can't be more than what was paid. */
function expenseExtras(i: { amountCents: number; gstCents?: number; vendor?: string }) {
  const gstCents = Math.round(i.gstCents ?? 0);
  if (!(gstCents >= 0) || gstCents > i.amountCents) throw new TransitionError("The GST can't be more than the amount");
  return { gstCents, vendor: i.vendor?.trim().slice(0, 80) || null };
}

/** Fix a typo: everything but the receipt and the job it belongs to. */
export async function updateExpense(user: Actor, id: string, input: { date: string; category: string; description: string; amountCents: number; gstCents?: number; vendor?: string }) {
  if (!input.description.trim()) throw new TransitionError("Describe the expense");
  if (!(input.amountCents > 0)) throw new TransitionError("Enter the amount");
  await db.expense.updateMany({
    where: { id, businessId: user.businessId },
    data: { date: toDbDate(input.date), category: input.category.slice(0, 40) || "Other", description: input.description.trim().slice(0, 300), amountCents: input.amountCents, ...expenseExtras(input) },
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
