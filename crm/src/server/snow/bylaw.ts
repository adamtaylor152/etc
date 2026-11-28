// Calgary's Street Bylaw: sidewalks must be cleared within 24 hours of the snow stopping.
// The storm records when the snow stopped; this works out the deadline and who is at risk. Pure, unit-tested.
export const BYLAW_HOURS = 24;

type V = { state: string; completedAt: Date | null };

export function bylawStatus(snowEndedAt: Date | null, visits: V[], now: Date = new Date()) {
  if (!snowEndedAt) return null;
  const deadline = new Date(snowEndedAt.getTime() + BYLAW_HOURS * 3_600_000);
  const open = visits.filter((v) => ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state)).length;
  const done = visits.filter((v) => v.state === "COMPLETED");
  const late = done.filter((v) => v.completedAt && v.completedAt > deadline).length;
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;
  // ok: nothing left to clear. soon: under 6 hours with stops left. over: past the deadline with stops left.
  const level = open === 0 ? "ok" : hoursLeft <= 0 ? "over" : hoursLeft <= 6 ? "soon" : "running";
  return { deadline, open, onTime: done.length - late, late, hoursLeft, level: level as "ok" | "over" | "soon" | "running" };
}
