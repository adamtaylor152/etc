// Loads people (with working hours), time off and booked items for availability checks, the Team view and Find a time.
import { type Busy, localParts, type TimeOffRow, type WorkHours } from "./availability";
import { dateOnly, toDbDate } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";
import { personName } from "./schedule";

export type TeamPerson = { id: string; name: string; color: string; hours: WorkHours };

export async function loadAvailability(businessId: string, from: string, to: string) {
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [users, offs, visits, tasks] = await Promise.all([
    db.user.findMany({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } }),
    db.timeOff.findMany({ where: { businessId, endDate: { gte: toDbDate(from) }, startDate: { lte: toDbDate(to) } } }),
    db.visit.findMany({ where: { businessId, scheduledDate: range, state: { notIn: ["CANCELLED", "SKIPPED"] } }, include: { assignees: true, property: true, job: { include: { client: true } } } }),
    db.task.findMany({ where: { businessId, date: range }, include: { assignees: true } }),
  ]);
  const people: TeamPerson[] = users.map((u) => ({ id: u.id, name: personName(u), color: u.color, hours: (u.workHours ?? {}) as WorkHours }));
  const timeOff: TimeOffRow[] = offs.map((t) => ({ userId: t.userId, startDate: dateOnly(t.startDate)!, endDate: dateOnly(t.endDate)!, reason: t.reason }));
  const mins = (d: Date | null) => (d ? localParts(d).min : null);
  const busy: Busy[] = [
    ...visits.map((v) => ({
      id: v.id, userIds: v.assignees.map((a) => a.userId), date: dateOnly(v.scheduledDate)!, start: v.anytime ? null : mins(v.startAt), end: v.anytime ? null : mins(v.endAt),
      label: `${clientName(v.job.client)}${v.job.kind === "SNOW_PLAN" ? " (snow)" : ` · ${v.job.title}`}`, lat: v.property.lat, lng: v.property.lng,
    })),
    ...tasks.map((t) => ({ id: t.id, userIds: t.assignees.map((a) => a.userId), date: dateOnly(t.date)!, start: t.allDay ? null : mins(t.startAt), end: t.allDay ? null : mins(t.endAt), label: t.title })),
  ];
  return { people, timeOff, busy, visits };
}
