// Visit state machine. Stored state; TODAY/LATE/UNSCHEDULED are computed (see status/job.ts).
import type { VisitState } from "@/generated/prisma/client";

const NEXT: Record<VisitState, VisitState[]> = {
  SCHEDULED: ["EN_ROUTE", "IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED"],
  EN_ROUTE: ["IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED", "SCHEDULED"],
  IN_PROGRESS: ["COMPLETED", "SKIPPED", "SCHEDULED"],
  COMPLETED: ["SCHEDULED"], // reopen: only allowed while none of its charges are invoiced (checked by the caller)
  SKIPPED: ["SCHEDULED"],
  CANCELLED: ["SCHEDULED"],
};

export class TransitionError extends Error {}

export function canTransition(from: VisitState, to: VisitState) {
  return NEXT[from].includes(to);
}

export function assertTransition(from: VisitState, to: VisitState) {
  if (!canTransition(from, to)) throw new TransitionError(`Can't go from ${from.toLowerCase()} to ${to.toLowerCase()}`);
}
