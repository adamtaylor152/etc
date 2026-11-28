// How long a stop really takes: actual minutes on site per visit, and what a property "usually" takes (computed on
// read from its last few timed visits, no stored column). Feeds route ETAs, the runner and the visit page.
import { db } from "../db";

export const USUAL_NEEDS = 3;  // fewer timed visits than this says nothing about "usually"
export const USUAL_LAST = 10;  // the rolling window
export const MAX_ON_SITE = 240;       // longer than this is a forgotten "Done", not a stop: left out of the average

/** Minutes on site: Arrived to Done when both were tapped, else the visit's timers (the longest one person ran). Pure, unit-tested. */
export function onSiteMinutes(v: { arrivedAt: Date | null; completedAt: Date | null }, timers: { userId: string; minutes: number | null }[] = []): number | null {
  if (v.arrivedAt && v.completedAt && v.completedAt > v.arrivedAt) return Math.max(1, Math.round((v.completedAt.getTime() - v.arrivedAt.getTime()) / 60_000));
  const by = new Map<string, number>();
  for (const t of timers) by.set(t.userId, (by.get(t.userId) ?? 0) + (t.minutes ?? 0));
  return Math.max(0, ...by.values()) || null;
}

/** The average of the most recent timed visits (newest first), or null when there aren't enough yet. Pure, unit-tested. */
export function usualMinutes(newestFirst: number[]): number | null {
  const m = newestFirst.filter((x) => x <= MAX_ON_SITE).slice(0, USUAL_LAST);
  return m.length >= USUAL_NEEDS ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null;
}

/** Snow and yard work at one address take very different times, so each has its own "usually". */
export const isSnowVisit = (v: { snowEventId: string | null; job: { kind: string } }) => !!v.snowEventId || v.job.kind === "SNOW_PLAN";
export const usualKey = (propertyId: string, snow: boolean) => `${propertyId}:${snow ? "snow" : "other"}`;

/** Usual minutes per property (usualKey -> minutes); properties without enough timed visits are simply absent.
 *  ponytail: reads every completed visit of these properties; give Property a stored average if a route gets slow. */
export async function usualByProperty(businessId: string, propertyIds: string[]) {
  const out = new Map<string, number>();
  const ids = [...new Set(propertyIds)];
  if (!ids.length) return out;
  const done = await db.visit.findMany({
    where: { businessId, propertyId: { in: ids }, state: "COMPLETED", completedAt: { not: null }, isReturn: false }, orderBy: { completedAt: "desc" }, // a return visit is a quick touch-up, not a usual stop
    select: { id: true, propertyId: true, arrivedAt: true, completedAt: true, snowEventId: true, job: { select: { kind: true } } },
  });
  const untimed = done.filter((v) => !v.arrivedAt).map((v) => v.id);
  const timers = untimed.length ? await db.timeEntry.findMany({ where: { businessId, visitId: { in: untimed }, endedAt: { not: null } }, select: { visitId: true, userId: true, minutes: true } }) : [];
  const by = new Map<string, number[]>();
  for (const v of done) {
    const min = onSiteMinutes(v, timers.filter((t) => t.visitId === v.id));
    if (min != null) by.set(usualKey(v.propertyId, isSnowVisit(v)), [...(by.get(usualKey(v.propertyId, isSnowVisit(v))) ?? []), min]);
  }
  for (const [k, mins] of by) { const u = usualMinutes(mins); if (u != null) out.set(k, u); }
  return out;
}
