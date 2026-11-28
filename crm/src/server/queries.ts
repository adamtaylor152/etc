// Read models for the back office.
import type { Prisma, VisitState } from "@/generated/prisma/client";
import type { InvoiceView } from "./billing/invoice";
import { dateOnly, toDbDate, todayLocal } from "./dates";
import { db } from "./db";
import { computeJobStatus, type JobStatus } from "./status/job";

const client = { select: { id: true, firstName: true, lastName: true, companyName: true } } as const;
const jobInclude = {
  client,
  property: { select: { id: true, formatted: true, communityCode: true, community: { select: { name: true } } } },
  visits: { select: { state: true, scheduledDate: true, charges: { where: { invoiceLineItemId: null }, select: { id: true } } } },
  _count: { select: { invoices: { where: { status: { not: "VOID" } } } } },
} satisfies Prisma.JobInclude;

export type JobRow = Prisma.JobGetPayload<{ include: typeof jobInclude }> & { status: JobStatus };

/** Jobs with their computed status. Computed in JS: fine for a page of jobs or one client's; lists go through jobStatuses first. */
export async function jobsWithStatus(where: Prisma.JobWhereInput, today = todayLocal()): Promise<JobRow[]> {
  const jobs = await db.job.findMany({ where, include: jobInclude, orderBy: { number: "desc" } });
  return jobs.map((j) => ({
    ...j,
    status: computeJobStatus(
      { ...j, hasInvoice: j._count.invoices > 0, unbilledCharges: j.visits.reduce((n, v) => n + v.charges.length, 0) },
      j.visits.map((v) => ({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) })),
      today,
    ),
  }));
}

/**
 * Every matching job with its status and sort keys, without the heavy columns: the jobs list filters, sorts and counts
 * on these, then loads only the page it shows with jobsWithStatus. Closed jobs are ARCHIVED whatever their visits say,
 * so their visits are never read: what's loaded grows with open work, not with history.
 */
export async function jobStatuses(where: Prisma.JobWhereInput, today = todayLocal()) {
  const [open, closed] = await Promise.all([
    db.job.findMany({
      where: { AND: [where, { closedAt: null }] }, orderBy: { number: "desc" },
      select: { id: true, number: true, kind: true, closedAt: true, planPausedAt: true, asNeeded: true, billingType: true, client, visits: jobInclude.visits, _count: jobInclude._count },
    }),
    db.job.findMany({ where: { AND: [where, { closedAt: { not: null } }] }, orderBy: { number: "desc" }, select: { id: true, number: true, kind: true, client } }),
  ]);
  return [
    ...open.map((j) => {
      const visits = j.visits.map((v) => ({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }));
      const status = computeJobStatus({ ...j, hasInvoice: j._count.invoices > 0, unbilledCharges: j.visits.reduce((n, v) => n + v.charges.length, 0) }, visits, today);
      return { id: j.id, number: j.number, kind: j.kind, client: j.client, visits, status };
    }),
    ...closed.map((j) => ({ ...j, visits: [] as { state: VisitState; scheduledDate: string | null }[], status: "ARCHIVED" as JobStatus })),
  ].sort((a, b) => b.number - a.number);
}

// ---- list search and sort, in the database ----
/** A search box's words: each one must match something. */
export const words = (q: string | undefined) => (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
export const textHas = (w: string) => ({ contains: w, mode: "insensitive" as const });
/** For raw ILIKE: the word as a contains pattern, wildcards escaped. */
export const like = (w: string) => `%${w.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
export const nameHas = (w: string): Prisma.ClientWhereInput => ({ OR: [{ firstName: textHas(w) }, { lastName: textHas(w) }, { companyName: textHas(w) }] });
/** "#12" or "12" as a record number. */
export const numberIs = (w: string) => (/^#?\d{1,9}$/.test(w) ? [{ number: Number(w.replace("#", "")) }] : []);
/** Sort by the client's name: first, then last (a company sorts by its contact's name). */
export const byClient = (dir: "asc" | "desc") => [{ client: { firstName: dir } }, { client: { lastName: dir } }];

/** invoiceView() as a database filter, so lists filter and count PAST_DUE / PARTIAL without loading every invoice. */
export function invoiceViewWhere(view: InvoiceView, today = todayLocal()): Prisma.InvoiceWhereInput {
  if (view !== "AWAITING_PAYMENT" && view !== "PAST_DUE" && view !== "PARTIAL") return { status: view };
  const day = toDbDate(today);
  if (view === "PAST_DUE") return { status: "AWAITING_PAYMENT", dueOn: { lt: day } };
  const partial: Prisma.InvoiceWhereInput = { amountPaidCents: { gt: 0, lt: db.invoice.fields.totalCents } };
  return { status: "AWAITING_PAYMENT", OR: [{ dueOn: null }, { dueOn: { gte: day } }], AND: [view === "PARTIAL" ? partial : { NOT: partial }] };
}

/** Rows for these ids, in that order: a page picked by a sort the database can't do. */
export function inOrder<T extends { id: string }>(ids: string[], rows: T[]) {
  const m = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => m.get(id) ?? []);
}

export const clientName = (c: { firstName: string; lastName: string; companyName?: string | null }) =>
  c.companyName || `${c.firstName} ${c.lastName}`.trim();
