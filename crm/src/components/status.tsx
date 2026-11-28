import type { QuoteStatus, RequestStatus, SnowEventStatus } from "@/generated/prisma/client";
import { JOB_STATUS_LABEL, VISIT_STATUS_LABEL, type JobStatus, type VisitStatus } from "@/server/status/job";
import { Badge, type Tone } from "./ui";

const JOB_TONE: Record<JobStatus, Tone> = {
  ARCHIVED: "gray", LATE: "red", TODAY: "blue", REQUIRES_INVOICING: "amber", UPCOMING: "blue",
  ON_PLAN: "green", PAUSED: "gray", UNSCHEDULED: "amber", ACTION_REQUIRED: "amber",
};
const VISIT_TONE: Record<VisitStatus, Tone> = {
  COMPLETED: "green", SKIPPED: "gray", CANCELLED: "gray", IN_PROGRESS: "blue", EN_ROUTE: "blue",
  UNSCHEDULED: "amber", LATE: "red", TODAY: "blue", UPCOMING: "blue",
};
const REQUEST: Record<RequestStatus, [string, Tone]> = {
  NEW: ["New", "blue"], ASSESSMENT_SCHEDULED: ["Assessment booked", "amber"], CONVERTED: ["Converted", "green"], ARCHIVED: ["Archived", "gray"],
};

export const JobBadge = ({ s }: { s: JobStatus }) => <Badge tone={JOB_TONE[s]}>{JOB_STATUS_LABEL[s]}</Badge>;
export const VisitBadge = ({ s }: { s: VisitStatus }) => <Badge tone={VISIT_TONE[s]}>{VISIT_STATUS_LABEL[s]}</Badge>;
export const RequestBadge = ({ s }: { s: RequestStatus }) => <Badge tone={REQUEST[s][1]}>{REQUEST[s][0]}</Badge>;

export const STORM: Record<SnowEventStatus, [string, Tone]> = {
  FORECAST: ["Forecast", "blue"], ACTIVE: ["Active", "green"], COMPLETED: ["Finished", "green"], CANCELLED: ["Cancelled", "gray"],
};

import type { InvoiceView } from "@/server/billing/invoice";
const INVOICE: Record<InvoiceView, [string, Tone]> = {
  DRAFT: ["Draft", "gray"], AWAITING_PAYMENT: ["Awaiting payment", "amber"], PARTIAL: ["Partly paid", "amber"], PAST_DUE: ["Past due", "red"],
  PAID: ["Paid", "green"], BAD_DEBT: ["Written off", "gray"], VOID: ["Void", "gray"],
};
export const InvoiceBadge = ({ s }: { s: InvoiceView }) => <Badge tone={INVOICE[s][1]}>{INVOICE[s][0]}</Badge>;
export const INVOICE_LABEL = Object.fromEntries(Object.entries(INVOICE).map(([k, [l]]) => [k, l])) as Record<InvoiceView, string>;

export const QUOTE: Record<QuoteStatus, [string, Tone]> = {
  DRAFT: ["Draft", "gray"], AWAITING_RESPONSE: ["Awaiting response", "amber"], CHANGES_REQUESTED: ["Changes requested", "red"],
  APPROVED: ["Approved", "green"], CONVERTED: ["Converted to job", "green"], ARCHIVED: ["Archived", "gray"], DECLINED: ["Declined", "red"],
};
