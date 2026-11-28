// Job and visit status are COMPUTED (Jobber-style), never stored: they fall out of visit dates/states,
// unbilled charges and whether the job is closed. Pure functions; `today` is Calgary's YYYY-MM-DD.
import type { JobKind, VisitState } from "@/generated/prisma/client";

export type VisitLike = { state: VisitState; scheduledDate: string | null };
export type JobLike = {
  kind: JobKind; closedAt: Date | null; planPausedAt: Date | null; asNeeded: boolean;
  billingType: "FIXED_PRICE" | "PER_VISIT"; hasInvoice: boolean; unbilledCharges: number;
};

export type VisitStatus = "COMPLETED" | "SKIPPED" | "CANCELLED" | "IN_PROGRESS" | "EN_ROUTE" | "UNSCHEDULED" | "LATE" | "TODAY" | "UPCOMING";
export type JobStatus = "ARCHIVED" | "LATE" | "TODAY" | "REQUIRES_INVOICING" | "UPCOMING" | "ON_PLAN" | "PAUSED" | "UNSCHEDULED" | "ACTION_REQUIRED";

const OPEN: VisitState[] = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"];
export const isOpen = (v: VisitLike) => OPEN.includes(v.state);

export function visitStatus(v: VisitLike, today: string): VisitStatus {
  if (!isOpen(v)) return v.state as "COMPLETED" | "SKIPPED" | "CANCELLED";
  if (v.state !== "SCHEDULED") return v.state as "IN_PROGRESS" | "EN_ROUTE";
  if (!v.scheduledDate) return "UNSCHEDULED";
  if (v.scheduledDate < today) return "LATE";
  if (v.scheduledDate === today) return "TODAY";
  return "UPCOMING";
}

/** First match wins, in this priority order. */
export function computeJobStatus(job: JobLike, visits: VisitLike[], today: string): JobStatus {
  if (job.closedAt) return "ARCHIVED";
  const st = visits.map((v) => visitStatus(v, today));
  if (st.includes("LATE")) return "LATE";
  if (st.some((s) => s === "TODAY" || s === "EN_ROUTE" || s === "IN_PROGRESS")) return "TODAY";
  const allDone = visits.length > 0 && visits.every((v) => !isOpen(v));
  if (job.unbilledCharges > 0 || (job.billingType === "FIXED_PRICE" && job.kind !== "RECURRING" && allDone && !job.hasInvoice)) return "REQUIRES_INVOICING";
  if (st.includes("UPCOMING")) return "UPCOMING";
  if (job.kind === "SNOW_PLAN") return job.planPausedAt ? "PAUSED" : "ON_PLAN";
  if (st.includes("UNSCHEDULED") || (!visits.length && !job.asNeeded)) return "UNSCHEDULED";
  return "ACTION_REQUIRED";
}

/** What can still be edited on a job (null = editable, otherwise why not). Charges are copied from the line items when a
 *  visit is done, so editing lines only prices visits done from now on; the locks cover the cases where it would not. */
export type JobEditFacts = {
  kind: JobKind; closedAt: Date | null; sizeHoldAt: Date | null; billingType: "FIXED_PRICE" | "PER_VISIT";
  invoiced: boolean; // a non-void invoice bills this job (its fixed price, or any of its visits)
  hasCharges: boolean; // a done visit already has per-visit charges
};
export function jobEditLocks(j: JobEditFacts) {
  const lines = j.kind === "SNOW_PLAN" ? "A snow plan is priced per push: change it on the plan card"
    : j.closedAt ? "This job is closed: reopen it to change what it bills"
    : j.sizeHoldAt ? "Waiting on the client to OK a new driveway price"
    // A recurring fixed price is billed month by month: a new price applies to the months not invoiced yet.
    : j.billingType === "FIXED_PRICE" && j.invoiced && j.kind !== "RECURRING" ? "The fixed price is already invoiced: void the invoice to change it"
    : null;
  const billing = lines ?? (j.kind !== "ONE_OFF" ? "Only one-off jobs can switch billing" // (a recurring job's invoice day can still change)
    : j.invoiced || j.hasCharges ? "Visits are already charged or invoiced, so the billing type is locked"
    : null);
  const property = j.kind === "SNOW_PLAN" ? "A snow plan is priced for its driveway: end it and start a plan at the other address"
    : j.closedAt ? "This job is closed: reopen it to move it"
    : null;
  return { lines, billing, property };
}

/** Can this one visit be priced differently from its job (Visit.lineOverrides)? null = yes, otherwise why not. */
export function visitLinesLock(v: { state: VisitState; invoiced: boolean; kind: JobKind; billingType: "FIXED_PRICE" | "PER_VISIT"; closedAt: Date | null }) {
  return v.kind === "SNOW_PLAN" ? "Snow plan visits are priced by the plan"
    : v.billingType === "FIXED_PRICE" ? "This job is a fixed price, so its visits aren't charged one by one"
    : v.closedAt ? "This job is closed"
    : v.invoiced ? "This visit is already invoiced: void the invoice to change it"
    : !OPEN.includes(v.state) ? "Reopen the visit to change what it charges"
    : null;
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  ARCHIVED: "Archived", LATE: "Late", TODAY: "Today", REQUIRES_INVOICING: "Requires invoicing", UPCOMING: "Upcoming",
  ON_PLAN: "Waiting for snow", PAUSED: "Paused", UNSCHEDULED: "Unscheduled", ACTION_REQUIRED: "Action required",
};
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  COMPLETED: "Done", SKIPPED: "Skipped", CANCELLED: "Cancelled", IN_PROGRESS: "On site", EN_ROUTE: "On the way",
  UNSCHEDULED: "Unscheduled", LATE: "Late", TODAY: "Today", UPCOMING: "Upcoming",
};
