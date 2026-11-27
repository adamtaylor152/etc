import type { RequestStatus, SnowEventStatus } from "@/generated/prisma/client";
import { JOB_STATUS_LABEL, VISIT_STATUS_LABEL, type JobStatus, type VisitStatus } from "@/server/status/job";
import { Badge, type Tone } from "./ui";

const JOB_TONE: Record<JobStatus, Tone> = {
  ARCHIVED: "gray", LATE: "red", TODAY: "navy", REQUIRES_INVOICING: "amber", UPCOMING: "blue",
  ON_PLAN: "green", PAUSED: "gray", UNSCHEDULED: "amber", ACTION_REQUIRED: "amber",
};
const VISIT_TONE: Record<VisitStatus, Tone> = {
  COMPLETED: "green", SKIPPED: "gray", CANCELLED: "gray", IN_PROGRESS: "navy", EN_ROUTE: "navy",
  UNSCHEDULED: "amber", LATE: "red", TODAY: "navy", UPCOMING: "blue",
};
const REQUEST: Record<RequestStatus, [string, Tone]> = {
  NEW: ["New", "blue"], ASSESSMENT_SCHEDULED: ["Assessment booked", "amber"], CONVERTED: ["Converted", "green"], ARCHIVED: ["Archived", "gray"],
};

export const JobBadge = ({ s }: { s: JobStatus }) => <Badge tone={JOB_TONE[s]}>{JOB_STATUS_LABEL[s]}</Badge>;
export const VisitBadge = ({ s }: { s: VisitStatus }) => <Badge tone={VISIT_TONE[s]}>{VISIT_STATUS_LABEL[s]}</Badge>;
export const RequestBadge = ({ s }: { s: RequestStatus }) => <Badge tone={REQUEST[s][1]}>{REQUEST[s][0]}</Badge>;

export const STORM: Record<SnowEventStatus, [string, Tone]> = {
  FORECAST: ["Forecast", "blue"], ACTIVE: ["Active", "navy"], COMPLETED: ["Finished", "green"], CANCELLED: ["Cancelled", "gray"],
};
