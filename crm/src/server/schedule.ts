// Everything on the calendar: visits, tasks, events and request assessments, coloured by person (or by type).
import { addDays, dateOnly, todayLocal, toDbDate } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";

export type Person = { id: string; name: string; color: string };
export type CalItem = {
  id: string; kind: "visit" | "task" | "event" | "assessment"; title: string; sub: string; start: string; end?: string; allDay: boolean;
  color: string; done: boolean; late: boolean; editable: boolean; href: string; people: Person[]; snow?: boolean;
};
// Jobber's object colours, used when nobody is assigned.
export const KIND_COLOR = { visit: "#2f7a3b", task: "#173f5e", event: "#b8991f", assessment: "#b36109" } as const;

export const personName = (u: { name: string | null; email: string }) => u.name || u.email.split("@")[0];
const people = (list: { user: { id: string; name: string | null; email: string; color: string } }[]) => list.map(({ user: u }) => ({ id: u.id, name: personName(u), color: u.color }));

export async function team(businessId: string): Promise<Person[]> {
  const users = await db.user.findMany({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } });
  return users.map((u) => ({ id: u.id, name: personName(u), color: u.color }));
}

export async function calendarItems(businessId: string, from = addDays(todayLocal(), -62), to = addDays(todayLocal(), 120)) {
  const today = todayLocal();
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [visits, tasks, requests] = await Promise.all([
    db.visit.findMany({
      where: { businessId, state: { not: "CANCELLED" }, job: { closedAt: null }, OR: [{ scheduledDate: null, state: "SCHEDULED" }, { scheduledDate: range }] },
      include: { job: { include: { client: true } }, property: true, assignees: { include: { user: true } } },
    }),
    db.task.findMany({ where: { businessId, OR: [{ date: null, completedAt: null }, { date: range }] }, include: { assignees: { include: { user: true } } } }),
    db.request.findMany({ where: { businessId, assessmentAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) }, status: { not: "ARCHIVED" } }, include: { client: true, property: true } }),
  ]);
  const clientIds = [...new Set(tasks.map((t) => t.clientId).filter((x): x is string => !!x))];
  const clients = new Map((clientIds.length ? await db.client.findMany({ where: { id: { in: clientIds } } }) : []).map((c) => [c.id, clientName(c)]));
  const items: CalItem[] = [];
  const unscheduled: CalItem[] = [];
  for (const v of visits) {
    const p = people(v.assignees);
    const d = dateOnly(v.scheduledDate);
    const done = v.state === "COMPLETED" || v.state === "SKIPPED";
    const it: CalItem = {
      id: v.id, kind: "visit", title: `${clientName(v.job.client)} · ${v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title}`, sub: v.property.formatted.split(",")[0],
      start: v.startAt && !v.anytime ? v.startAt.toISOString() : d ?? "", end: v.endAt && !v.anytime ? v.endAt.toISOString() : undefined, allDay: v.anytime || !v.startAt,
      color: p[0]?.color ?? KIND_COLOR.visit, done, late: !!d && d < today && v.state === "SCHEDULED", editable: v.state === "SCHEDULED" && !v.snowEventId,
      href: `/visits/${v.id}`, people: p, snow: !!v.snowEventId,
    };
    (d ? items : unscheduled).push(it);
  }
  for (const t of tasks) {
    const p = people(t.assignees);
    const d = dateOnly(t.date);
    const it: CalItem = {
      id: t.id, kind: t.kind === "EVENT" ? "event" : "task", title: t.title, sub: t.clientId ? clients.get(t.clientId) ?? "" : t.kind === "EVENT" ? "Event" : "Task",
      start: !t.allDay && t.startAt ? t.startAt.toISOString() : d ?? "", end: !t.allDay && t.endAt ? t.endAt.toISOString() : undefined, allDay: t.allDay || !t.startAt,
      color: p[0]?.color ?? KIND_COLOR[t.kind === "EVENT" ? "event" : "task"], done: !!t.completedAt, late: !!d && d < today && !t.completedAt, editable: true,
      href: `/tasks/${t.id}`, people: p,
    };
    (d ? items : unscheduled).push(it);
  }
  for (const r of requests) {
    items.push({
      id: r.id, kind: "assessment", title: `Assessment · ${clientName(r.client)}`, sub: r.property?.formatted.split(",")[0] ?? "", start: r.assessmentAt!.toISOString(),
      allDay: false, color: KIND_COLOR.assessment, done: r.status === "CONVERTED", late: false, editable: false, href: `/requests/${r.id}`, people: [],
    });
  }
  return { items, unscheduled };
}
