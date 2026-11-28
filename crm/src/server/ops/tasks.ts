// Tasks and calendar events (Jobber's "basic tasks"): optional client/job, date + time or all day, repeat, assignees.
import { addDays, dateOnly } from "../dates";
import { db } from "../db";
import { TransitionError } from "../status/visit";
import { toDbDate } from "../dates";
import { alertAssigned, withAssignAlert, type Assigned } from "./assign-alerts";

type Actor = { id: string; businessId: string };
export const REPEATS = { DAILY: "Every day", WEEKLY: "Every week", BIWEEKLY: "Every 2 weeks", MONTHLY: "Every month" } as const;
export type Repeat = keyof typeof REPEATS;

/** Dates for a repeating task from start through `until` (max 1 year, max 120 items). Pure, unit-tested. */
export function seriesDates(start: string, repeat: Repeat | null, until?: string | null): string[] {
  if (!repeat) return [start];
  const end = until && until > start ? until : addDays(start, 364);
  const cap = addDays(start, 365);
  const out: string[] = [];
  for (let i = 0, d = start; d <= end && d <= cap && out.length < 120; i++) {
    out.push(d);
    if (repeat === "DAILY") d = addDays(start, i + 1);
    else if (repeat === "WEEKLY") d = addDays(start, (i + 1) * 7);
    else if (repeat === "BIWEEKLY") d = addDays(start, (i + 1) * 14);
    else {
      const [y, m, day] = start.split("-").map(Number);
      const t = new Date(Date.UTC(y, m - 1 + i + 1, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      d = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
    }
  }
  return out;
}

export type TaskInput = {
  kind: "TASK" | "EVENT"; title: string; instructions?: string; clientId?: string; jobId?: string; propertyId?: string;
  date?: string | null; startAt?: Date | null; endAt?: Date | null; allDay: boolean; repeat?: Repeat | null; until?: string | null; assigneeIds: string[];
};

async function checkLinks(user: Actor, t: TaskInput) {
  if (t.clientId && !(await db.client.findFirst({ where: { id: t.clientId, businessId: user.businessId } }))) throw new TransitionError("That client is gone");
  if (t.jobId) {
    const j = await db.job.findFirst({ where: { id: t.jobId, businessId: user.businessId } });
    if (!j) throw new TransitionError("That job is gone");
    t.clientId ??= j.clientId;
    t.propertyId ??= j.propertyId;
  }
  const ok = await db.user.count({ where: { id: { in: t.assigneeIds }, businessId: user.businessId } });
  if (ok !== t.assigneeIds.length) throw new TransitionError("Pick people from your team");
}

/** What an assignment alert watches on an open task (ops/assign-alerts.ts). */
const taskSnap = (user: Actor, id: string) => async (): Promise<Assigned | null> => {
  const t = await db.task.findFirst({ where: { id, businessId: user.businessId, completedAt: null }, select: { date: true, startAt: true, allDay: true, assignees: { select: { userId: true } } } });
  return t && { date: dateOnly(t.date), at: t.allDay ? null : t.startAt?.getTime() ?? null, userIds: t.assignees.map((a) => a.userId) };
};

const shift = (d: Date | null | undefined, days: number) => (d ? new Date(d.getTime() + days * 86_400_000) : null);

export async function createTask(user: Actor, t: TaskInput) {
  if (!t.title.trim()) throw new TransitionError("Give the task a title");
  await checkLinks(user, t);
  const dates = t.date ? seriesDates(t.date, t.repeat ?? null, t.until) : [null];
  const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
  const first = t.date;
  const created = [];
  for (const d of dates) {
    const offset = d && first ? (Date.parse(d) - Date.parse(first)) / 86_400_000 : 0;
    created.push(await db.task.create({
      data: {
        businessId: user.businessId, kind: t.kind, title: t.title.trim().slice(0, 140), instructions: t.instructions?.trim().slice(0, 4000) || null,
        clientId: t.clientId || null, jobId: t.jobId || null, propertyId: t.propertyId || null,
        date: d ? toDbDate(d) : null, allDay: t.allDay, startAt: t.allDay ? null : shift(t.startAt, offset), endAt: t.allDay ? null : shift(t.endAt, offset),
        repeat: t.repeat ?? null, seriesId, createdById: user.id, assignees: { create: t.assigneeIds.map((userId) => ({ userId })) },
      },
    }));
  }
  await alertAssigned(db, user.businessId, user.id, t.assigneeIds, t.date); // a series alerts for its first day only
  return created[0];
}

export async function updateTask(user: Actor, id: string, t: TaskInput, scope: "one" | "future" = "one") {
  const cur = await db.task.findFirst({ where: { id, businessId: user.businessId } });
  if (!cur) throw new TransitionError("That task is gone");
  await checkLinks(user, t);
  const ids = scope === "future" && cur.seriesId
    ? (await db.task.findMany({ where: { seriesId: cur.seriesId, OR: [{ date: { gte: cur.date ?? undefined } }, { id }] }, select: { id: true } })).map((x) => x.id) : [id];
  await withAssignAlert(user, taskSnap(user, id), () => db.$transaction([
    db.task.updateMany({ where: { id: { in: ids } }, data: { kind: t.kind, title: t.title.trim().slice(0, 140), instructions: t.instructions?.trim().slice(0, 4000) || null, clientId: t.clientId || null, jobId: t.jobId || null, allDay: t.allDay } }),
    // Date/time only change on the one being edited (a series keeps its own dates).
    db.task.update({ where: { id }, data: { date: t.date ? toDbDate(t.date) : null, startAt: t.allDay ? null : t.startAt ?? null, endAt: t.allDay ? null : t.endAt ?? null } }),
    db.taskAssignee.deleteMany({ where: { taskId: { in: ids } } }),
    db.taskAssignee.createMany({ data: ids.flatMap((taskId) => t.assigneeIds.map((userId) => ({ taskId, userId }))) }),
  ]));
}

export async function setTaskDone(user: Actor, id: string, done: boolean) {
  await db.task.updateMany({ where: { id, businessId: user.businessId }, data: { completedAt: done ? new Date() : null } });
}

export async function deleteTask(user: Actor, id: string, scope: "one" | "future" = "one") {
  const cur = await db.task.findFirst({ where: { id, businessId: user.businessId } });
  if (!cur) return null;
  if (scope === "future" && cur.seriesId) await db.task.deleteMany({ where: { seriesId: cur.seriesId, OR: [{ date: { gte: cur.date ?? undefined } }, { id }] } });
  else await db.task.delete({ where: { id } });
  return cur;
}

/**
 * Move a task on the calendar (drag) and/or set who's on it, as ONE change (null = leave that part alone), so whoever
 * is on it afterwards gets a single assignment alert.
 */
export async function moveTask(user: Actor, id: string, m: { date: string | null; startAt?: Date | null; endAt?: Date | null; allDay: boolean } | null, userIds: string[] | null = null) {
  await withAssignAlert(user, taskSnap(user, id), async () => {
    if (m) await db.task.updateMany({ where: { id, businessId: user.businessId }, data: { date: m.date ? toDbDate(m.date) : null, allDay: m.allDay, startAt: m.allDay ? null : m.startAt ?? null, endAt: m.allDay ? null : m.endAt ?? null } });
    if (userIds) {
      await db.task.findFirstOrThrow({ where: { id, businessId: user.businessId } });
      const ok = await db.user.findMany({ where: { id: { in: userIds }, businessId: user.businessId }, select: { id: true } });
      await db.$transaction([db.taskAssignee.deleteMany({ where: { taskId: id } }), db.taskAssignee.createMany({ data: ok.map((u) => ({ taskId: id, userId: u.id })) })]);
    }
  });
}
