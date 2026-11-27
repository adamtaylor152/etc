// Read models for the back office.
import type { Prisma } from "@/generated/prisma/client";
import { dateOnly, todayLocal } from "./dates";
import { db } from "./db";
import { computeJobStatus, type JobStatus } from "./status/job";

const jobInclude = {
  client: { select: { id: true, firstName: true, lastName: true, companyName: true } },
  property: { select: { id: true, formatted: true, communityCode: true, community: { select: { name: true } } } },
  visits: { select: { state: true, scheduledDate: true, charges: { where: { invoiceLineItemId: null }, select: { id: true } } } },
  _count: { select: { invoices: { where: { status: { not: "VOID" } } } } },
} satisfies Prisma.JobInclude;

export type JobRow = Prisma.JobGetPayload<{ include: typeof jobInclude }> & { status: JobStatus };

/** Jobs with their computed status. ponytail: computed in JS over all matching jobs; a SQL view when it's thousands. */
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

export const clientName = (c: { firstName: string; lastName: string; companyName?: string | null }) =>
  c.companyName || `${c.firstName} ${c.lastName}`.trim();
