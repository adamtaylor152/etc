// Route runner data: one person's stops for a day in route order, plus route splitting between people.
import { dateOnly, toDbDate } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";
import { routeVisits } from "./routing";

export type RunStop = {
  visitId: string; client: string; phone: string | null; address: string; lat: number | null; lng: number | null;
  access: string | null; gate: string | null; pets: string | null; hazards: string | null; job: string; snow: boolean; iceMelt: boolean;
  state: string; time: string | null; people: string[]; communityName: string | null;
};

export async function runStops(businessId: string, date: string, userId: string | "all") {
  // Same order as the route planner (service-area community order, then standing routeSort).
  const { visits } = await routeVisits(businessId, {
    scheduledDate: toDbDate(date), state: { not: "CANCELLED" },
    ...(userId === "all" ? {} : { OR: [{ assignees: { some: { userId } } }, { assignees: { none: {} } }] }),
  });
  const who = await db.visitAssignee.findMany({ where: { visitId: { in: visits.map((v) => v.id) } }, include: { user: { select: { name: true, email: true } } } });
  return visits.map((v): RunStop => ({
    visitId: v.id, client: clientName(v.job.client), phone: v.job.client.phone, address: v.property.formatted.replace(/, Calgary.*$/, ""),
    lat: v.property.lat, lng: v.property.lng, access: v.property.accessNotes, gate: v.property.gateCode, pets: v.property.petNotes, hazards: v.property.hazards,
    job: v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title, snow: v.job.kind === "SNOW_PLAN" || !!v.snowEventId, iceMelt: !!v.job.iceMelt,
    state: v.state, time: v.startAt && !v.anytime ? v.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }) : null,
    people: who.filter((a) => a.visitId === v.id).map((a) => a.user.name || a.user.email.split("@")[0]), communityName: v.property.community?.name ?? null,
  }));
}

/**
 * Split stops (already in route order) between people: keep each community together where possible and balance counts.
 * Pure, unit-tested. Returns userId per visitId.
 */
export function splitRoute(stops: { id: string; community: string | null }[], people: string[]) {
  if (!people.length) return new Map<string, string>();
  const groups: { community: string | null; ids: string[] }[] = [];
  for (const s of stops) {
    const g = groups.at(-1);
    if (g && g.community === s.community) g.ids.push(s.id);
    else groups.push({ community: s.community, ids: [s.id] });
  }
  const target = Math.ceil(stops.length / people.length);
  const out = new Map<string, string>();
  let p = 0, count = 0;
  for (const g of groups) {
    // Move to the next person when this group would push us well past the fair share.
    if (count > 0 && count + g.ids.length > target + Math.floor(target / 3) && p < people.length - 1) { p++; count = 0; }
    for (const id of g.ids) {
      out.set(id, people[p]);
      count++;
      if (count >= target && p < people.length - 1 && g.ids.length > target) { p++; count = 0; } // a huge community gets split
    }
  }
  return out;
}

/** Today's progress per person (done / total), for Home and the storm page. */
export async function dayProgress(businessId: string, date: string) {
  const visits = await db.visit.findMany({ where: { businessId, scheduledDate: toDbDate(date), state: { not: "CANCELLED" } }, select: { state: true, assignees: { select: { userId: true } } } });
  const users = await db.user.findMany({ where: { businessId, active: true }, select: { id: true, name: true, email: true, color: true } });
  const rows = users.map((u) => {
    const mine = visits.filter((v) => v.assignees.some((a) => a.userId === u.id));
    return { id: u.id, name: u.name || u.email.split("@")[0], color: u.color, done: mine.filter((v) => v.state === "COMPLETED" || v.state === "SKIPPED").length, total: mine.length };
  }).filter((r) => r.total > 0);
  const un = visits.filter((v) => !v.assignees.length);
  if (un.length) rows.push({ id: "none", name: "Unassigned", color: "#94a3b8", done: un.filter((v) => v.state === "COMPLETED" || v.state === "SKIPPED").length, total: un.length });
  return rows;
}

export const dayOf = (d: Date | null) => dateOnly(d);
