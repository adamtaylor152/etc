"use server";
// Calendar drag/drop, assignments, and task create/edit/complete/delete.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { addDays, fromLocalInput } from "@/server/dates";
import { db } from "@/server/db";
import { createTask, deleteTask, moveTask, REPEATS, setTaskDone, updateTask, type Repeat, type TaskInput } from "@/server/ops/tasks";
import { moveVisit, rescheduleVisitTimed, setVisitAssignees } from "@/server/ops/visits";
import { TransitionError } from "@/server/status/visit";
import { conflicts } from "@/server/availability";
import { loadAvailability } from "@/server/schedule-data";
import { safePath } from "@/server/safe-path";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** FullCalendar gives "2026-12-01" (all-day) or an ISO datetime. */
function parseSlot(start: string, end: string | null, allDay: boolean) {
  const date = start.slice(0, 10);
  day.parse(date);
  if (allDay) return { date, startAt: null, endAt: null, allDay: true };
  const s = new Date(start), e = end ? new Date(end) : new Date(s.getTime() + 3_600_000);
  if (Number.isNaN(s.getTime())) throw new Error("bad time");
  // The calendar works in Calgary time; the date part of the instant in Calgary is what we store.
  const local = s.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  return { date: local, startAt: s, endAt: e, allDay: false };
}

export async function calendarMove(kind: "visit" | "task" | "event", id: string, start: string, end: string | null, allDay: boolean) {
  const user = await requireOwner();
  const slot = parseSlot(start, end, allDay);
  if (kind === "visit") await rescheduleVisitTimed(user, id, slot);
  else await moveTask(user, id, slot);
  revalidatePath("/schedule");
  if (!slot.date) return [];
  const av = await loadAvailability(user.businessId, slot.date, slot.date);
  const me = av.busy.find((b) => b.id === id);
  return me ? conflicts(me, av.busy, av.people, av.timeOff) : [];
}

export async function calendarUnschedule(kind: "visit" | "task" | "event", id: string) {
  const user = await requireOwner();
  if (kind === "visit") await rescheduleVisitTimed(user, id, { date: null });
  else await moveTask(user, id, { date: null, allDay: true });
  revalidatePath("/schedule");
}

export async function assignPeople(f: FormData) {
  const user = await requireOwner();
  const kind = str(f, "kind"), id = str(f, "id");
  const ids = f.getAll("userId").map(String);
  if (kind === "visit") await setVisitAssignees(user, id, ids);
  else await moveTask(user, id, null, ids);
  revalidatePath("/schedule");
  revalidatePath("/");
  const back = str(f, "back");
  if (safePath(back, "")) redirect(back);
}

function taskInput(f: FormData): TaskInput {
  const allDay = f.get("allDay") === "on" || !str(f, "startTime");
  const date = str(f, "date") || null;
  if (date) day.parse(date);
  const at = (t: string) => (date && t ? fromLocalInput(`${date}T${t}`) : null);
  const repeat = (Object.keys(REPEATS) as Repeat[]).find((r) => r === str(f, "repeat")) ?? null;
  return {
    kind: str(f, "kind") === "EVENT" ? "EVENT" : "TASK", title: str(f, "title"), instructions: str(f, "instructions"),
    clientId: str(f, "clientId") || undefined, jobId: str(f, "jobId") || undefined, date, allDay,
    startAt: allDay ? null : at(str(f, "startTime")), endAt: allDay ? null : at(str(f, "endTime")) ?? at(str(f, "startTime")),
    repeat, until: str(f, "until") || null, assigneeIds: f.getAll("userId").map(String),
  };
}

const fail = (path: string, e: unknown) => {
  if (e instanceof TransitionError || e instanceof z.ZodError) redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(e instanceof z.ZodError ? "Check the date and times" : e.message)}`);
  throw e;
};
const safe = (p: string, d: string) => safePath(p, d);

export async function taskSave(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id");
  const back = safe(str(f, "back"), "/tasks");
  try {
    if (id) await updateTask(user, id, taskInput(f), str(f, "scope") === "future" ? "future" : "one");
    else await createTask(user, taskInput(f));
  } catch (e) { fail(id ? `/tasks/${id}` : "/tasks/new", e); }
  revalidatePath("/", "layout");
  redirect(back);
}

export async function taskDone(f: FormData) {
  const user = await requireOwner();
  await setTaskDone(user, str(f, "id"), str(f, "done") === "1");
  revalidatePath("/", "layout");
}

export async function taskDelete(f: FormData) {
  const user = await requireOwner();
  await deleteTask(user, str(f, "id"), str(f, "scope") === "future" ? "future" : "one");
  revalidatePath("/", "layout");
  redirect(safe(str(f, "back"), "/tasks"));
}

const hhmm = (d: Date | null) => (d ? d.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : null);

/** Team view drag: set the person (replaces assignees; null = unassigned) and the day, keeping the time of day. */
export async function teamMove(kind: "visit" | "task" | "event", id: string, userId: string | null, date: string) {
  const user = await requireOwner();
  day.parse(date);
  const ids = userId ? [userId] : [];
  if (kind === "visit") {
    const v = await db.visit.findFirstOrThrow({ where: { id, businessId: user.businessId } });
    const t = hhmm(v.anytime ? null : v.startAt), e = hhmm(v.anytime ? null : v.endAt);
    await moveVisit(user, id, { date, startAt: t ? fromLocalInput(`${date}T${t}`) : null, endAt: e ? fromLocalInput(`${date}T${e}`) : null }, ids);
  } else {
    const t0 = await db.task.findFirstOrThrow({ where: { id, businessId: user.businessId } });
    const t = hhmm(t0.allDay ? null : t0.startAt), e = hhmm(t0.allDay ? null : t0.endAt);
    await moveTask(user, id, { date, allDay: !t, startAt: t ? fromLocalInput(`${date}T${t}`) : null, endAt: e ? fromLocalInput(`${date}T${e}`) : null }, ids);
  }
  revalidatePath("/schedule", "layout");
  const av = await loadAvailability(user.businessId, date, date);
  const me = av.busy.find((b) => b.id === id);
  return me ? conflicts(me, av.busy, av.people, av.timeOff) : [];
}

/** Find a time -> Book: set the date + time and the person. */
export async function bookSlot(f: FormData) {
  const user = await requireOwner();
  const date = day.parse(str(f, "date"));
  const start = Number(str(f, "start")), dur = Number(str(f, "duration")) || 60;
  const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const id = str(f, "visitId");
  await moveVisit(user, id, { date, startAt: fromLocalInput(`${date}T${t(start)}`), endAt: fromLocalInput(`${date}T${t(start + dur)}`) }, [str(f, "userId")]);
  revalidatePath("/schedule", "layout");
  redirect(`/visits/${id}`);
}

/** Bulk: move selected visits/tasks to a date or shift them by days, and/or reassign; optionally email clients. */
export async function bulkSchedule(f: FormData) {
  const user = await requireOwner();
  const items = f.getAll("item").map(String).map((x) => x.split(":") as ["visit" | "task", string]);
  const moveTo = str(f, "moveTo"), shift = Number(str(f, "shift")) || 0, assign = str(f, "assign"), notify = f.get("notify") === "on";
  const target = (d: string) => (moveTo && /^\d{4}-\d{2}-\d{2}$/.test(moveTo) ? moveTo : shift ? addDays(d, shift) : d);
  const who = assign === "keep" ? null : assign === "none" ? [] : [assign]; // null = leave people as they are
  let n = 0;
  for (const [kind, id] of items) {
    if (kind === "visit") {
      const v = await db.visit.findFirst({ where: { id, businessId: user.businessId, state: "SCHEDULED", snowEventId: null } });
      if (!v || !v.scheduledDate) continue;
      const from = v.scheduledDate.toISOString().slice(0, 10), date = target(from);
      const t = hhmm(v.anytime ? null : v.startAt), e = hhmm(v.anytime ? null : v.endAt);
      await moveVisit(user, id, date !== from ? { date, startAt: t ? fromLocalInput(`${date}T${t}`) : null, endAt: e ? fromLocalInput(`${date}T${e}`) : null } : null, who, { notify });
    } else {
      const t0 = await db.task.findFirst({ where: { id, businessId: user.businessId } });
      if (!t0 || !t0.date) continue;
      const from = t0.date.toISOString().slice(0, 10), date = target(from);
      const t = hhmm(t0.allDay ? null : t0.startAt), e = hhmm(t0.allDay ? null : t0.endAt);
      await moveTask(user, id, date !== from ? { date, allDay: !t, startAt: t ? fromLocalInput(`${date}T${t}`) : null, endAt: e ? fromLocalInput(`${date}T${e}`) : null } : null, who);
    }
    n++;
  }
  revalidatePath("/schedule", "layout");
  const back = str(f, "back");
  redirect(`${back.startsWith("/schedule/bulk") ? back : "/schedule/bulk"}&done=${n}`.replace("bulk&", "bulk?"));
}
