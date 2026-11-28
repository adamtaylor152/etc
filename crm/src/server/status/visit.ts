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

/**
 * The one short name for each skip reason, used wherever the office or crew reads or picks one (visit page, route
 * runner, activity feed, settings). The client-facing sentences are in skipNotice below.
 */
export const SKIP_LABEL = {
  ALREADY_CLEARED: "Already cleared", BLOCKED_BY_CAR: "Car in the way", NO_ACCESS: "Couldn't get in", BELOW_TRIGGER: "Below the trigger depth",
  CLIENT_CANCELLED: "Client cancelled", WEATHER: "Weather", OTHER: "Other",
} as const;
export type SkipReason = keyof typeof SKIP_LABEL;

/** The short label for a stored skip reason; anything unknown (old data, free text) is shown as it is. */
export function skipLabel(reason: string): string {
  return (SKIP_LABEL as Record<string, string>)[reason] ?? reason;
}

/**
 * What to tell a client whose visit was skipped, or null when the reason isn't theirs to fix or isn't switched on.
 * Only reasons the client can act on (or would otherwise wonder about) have wording: "already cleared", "below trigger",
 * "client cancelled" and "other" never produce a message. Pure, unit-tested.
 */
export function skipNotice(reason: string | null | undefined, on?: readonly string[]) {
  const n = ({
    BLOCKED_BY_CAR: { what: "a vehicle was in the way and we couldn't work around it", next: "Once it's moved, reply to this message and we'll fit you back in as soon as we can." },
    NO_ACCESS: { what: "we couldn't get in (a locked gate or blocked access)", next: "Reply to this message to tell us how to get in and we'll fit you back in as soon as we can." },
    WEATHER: { what: "the weather made it unsafe to do the job", next: "Nothing you need to do: we'll be back as soon as it's safe." },
  } as Record<string, { what: string; next: string }>)[reason ?? ""];
  return n && (!on || on.includes(reason!)) ? n : null;
}

export class TransitionError extends Error {}

export function canTransition(from: VisitState, to: VisitState) {
  return NEXT[from].includes(to);
}

export function assertTransition(from: VisitState, to: VisitState) {
  if (!canTransition(from, to)) throw new TransitionError(`Can't go from ${from.toLowerCase()} to ${to.toLowerCase()}`);
}
