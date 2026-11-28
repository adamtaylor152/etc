// The sales pipeline is a view over requests and quotes, not a record of its own: each one sits in the column its
// status puts it in, and moves when the normal actions happen (send, approve, decline...). Pure, unit-tested.
import type { QuoteStatus, RequestStatus } from "@/generated/prisma/client";

export const STAGES = [
  ["new", "New requests"], ["assessment", "Assessment booked"], ["quoting", "Quote in draft"], ["sent", "Awaiting response"],
  ["changes", "Changes requested"], ["won", "Won"], ["lost", "Lost"],
] as const;
export type Stage = (typeof STAGES)[number][0];

const QUOTE_STAGE: Record<QuoteStatus, Stage> = {
  DRAFT: "quoting", AWAITING_RESPONSE: "sent", CHANGES_REQUESTED: "changes", APPROVED: "won", CONVERTED: "won", DECLINED: "lost", ARCHIVED: "lost",
};
export const quoteStage = (status: QuoteStatus): Stage => QUOTE_STAGE[status];

/** A request shows as its own card only until it has a quote or a job (then that card stands for it); null = no card. */
export function requestStage(r: { status: RequestStatus; quotes: number; jobs: number }): Stage | null {
  if (r.status === "ARCHIVED") return r.jobs ? null : "lost";
  if (r.quotes) return null;
  if (r.jobs || r.status === "CONVERTED") return "won"; // booked straight to a job (e.g. online snow shovelling)
  return r.status === "ASSESSMENT_SCHEDULED" ? "assessment" : "new";
}

/** "today", "3d", "5w": how long a card has sat where it is. */
export function age(since: Date, now = new Date()) {
  const d = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
  return d < 1 ? "today" : d < 14 ? `${d}d` : d < 70 ? `${Math.floor(d / 7)}w` : `${Math.floor(d / 30)}mo`;
}
