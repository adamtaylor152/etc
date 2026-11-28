// Route runner data: one person's stops for a day in route order, plus route splitting between people.
import { dateOnly, toDbDate } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";
import { routeVisits } from "./routing";

export type RunStop = {
  visitId: string; client: string; phone: string | null; address: string; lat: number | null; lng: number | null;
  access: string | null; gate: string | null; pets: string | null; hazards: string | null; job: string; snow: boolean; iceMelt: boolean;
  state: string; time: string | null; people: string[]; communityName: string | null;
  sizeNote: string | null; // snow stop whose driveway size nobody has checked yet
};

/** Crew work their own stops plus ones nobody is assigned to; owners work any. Spread into a visit `where`. */
export const visitScope = (u: { id: string; role: string }) =>
  u.role === "OWNER" ? {} : { OR: [{ assignees: { some: { userId: u.id } } }, { assignees: { none: {} } }] };

export async function runStops(businessId: string, date: string, userId: string | "all") {
  // Same order as the route planner (community order, do-first stops, then the day's or the standing routeSort).
  const { visits } = await routeVisits(businessId, {
    scheduledDate: toDbDate(date), state: { not: "CANCELLED" },
    ...(userId === "all" ? {} : visitScope({ id: userId, role: "CREW" })),
  });
  const who = await db.visitAssignee.findMany({ where: { visitId: { in: visits.map((v) => v.id) } }, include: { user: { select: { name: true, email: true } } } });
  return visits.map((v): RunStop => ({
    visitId: v.id, client: clientName(v.job.client), phone: v.job.client.phone, address: v.property.formatted.replace(/, Calgary.*$/, ""),
    lat: v.property.lat, lng: v.property.lng, access: v.property.accessNotes, gate: v.property.gateCode, pets: v.property.petNotes, hazards: v.property.hazards,
    job: v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title, snow: v.job.kind === "SNOW_PLAN" || !!v.snowEventId, iceMelt: !!v.job.iceMelt,
    state: v.state, time: v.startAt && !v.anytime ? v.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }) : null,
    people: who.filter((a) => a.visitId === v.id).map((a) => a.user.name || a.user.email.split("@")[0]), communityName: v.property.community?.name ?? null,
    sizeNote: sizeNote(v.job.kind === "SNOW_PLAN" || !!v.snowEventId, v.property),
  }));
}

/** One person's assigned work for a day as plain lines ("when · what · where"), for assignment alerts. Never prices. */
export async function dayLines(businessId: string, userId: string, date: string) {
  const mine = { businessId, assignees: { some: { userId } } };
  const [visits, tasks] = await Promise.all([
    db.visit.findMany({ where: { ...mine, scheduledDate: toDbDate(date), state: { notIn: ["CANCELLED", "SKIPPED"] } }, include: { job: { select: { kind: true, title: true } }, property: { select: { formatted: true } } }, orderBy: [{ startAt: "asc" }, { routeSort: "asc" }] }),
    db.task.findMany({ where: { ...mine, date: toDbDate(date), completedAt: null }, orderBy: { startAt: "asc" } }),
  ]);
  const props = new Map((await db.property.findMany({ where: { businessId, id: { in: tasks.map((t) => t.propertyId).filter((x): x is string => !!x) } }, select: { id: true, formatted: true } })).map((p) => [p.id, p.formatted]));
  const when = (d: Date | null, timed: boolean) => (d && timed ? d.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }) : "Any time");
  const street = (a: string | undefined) => (a ? ` · ${a.split(",")[0]}` : "");
  return {
    stops: visits.map((v) => `${when(v.startAt, !v.anytime)} · ${v.job.kind === "SNOW_PLAN" || v.snowEventId ? "Snow" : v.job.title}${street(v.property.formatted)}`),
    tasks: tasks.map((t) => `${when(t.startAt, !t.allDay)} · ${t.title}${street(t.propertyId ? props.get(t.propertyId) : undefined)}`),
  };
}
export const dayCount = (d: { stops: string[]; tasks: string[] }) =>
  [d.stops.length && `${d.stops.length} stop${d.stops.length === 1 ? "" : "s"}`, d.tasks.length && `${d.tasks.length} task${d.tasks.length === 1 ? "" : "s"}`].filter(Boolean).join(", ") || "nothing";

/** Crew warning for a snow stop whose size hasn't been checked on the satellite view. */
export function sizeNote(snow: boolean, p: { sizeCheckedAt: Date | null; driveSize: string | null }) {
  if (!snow || p.sizeCheckedAt) return null;
  const booked = p.driveSize === "LARGE" ? "large" : "standard (1–2 car)";
  return `Size not checked yet: booked as ${booked}. Much bigger? Don't start; skip it and tell the office.`;
}

/**
 * Split stops (already in route order) between people: keep each community together where possible and balance the
 * load. A stop's `weight` is its estimated minutes (drive there + time on site); without weights every stop counts 1.
 * Pure, unit-tested. Returns userId per visitId.
 */
export function splitRoute(stops: { id: string; community: string | null; weight?: number }[], people: string[]) {
  if (!people.length) return new Map<string, string>();
  const groups: { community: string | null; stops: typeof stops; weight: number }[] = [];
  for (const s of stops) {
    const g = groups.at(-1);
    if (g && g.community === s.community) { g.stops.push(s); g.weight += s.weight ?? 1; }
    else groups.push({ community: s.community, stops: [s], weight: s.weight ?? 1 });
  }
  const target = Math.ceil(groups.reduce((a, g) => a + g.weight, 0) / people.length);
  const out = new Map<string, string>();
  let p = 0, load = 0;
  for (const g of groups) {
    // Move to the next person when this group would push us well past the fair share.
    if (load > 0 && load + g.weight > target + Math.floor(target / 3) && p < people.length - 1) { p++; load = 0; }
    for (const s of g.stops) {
      out.set(s.id, people[p]);
      load += s.weight ?? 1;
      if (load >= target && p < people.length - 1 && g.weight > target) { p++; load = 0; } // a huge community gets split
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
