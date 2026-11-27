"use server";
// Calendar drag/drop, assignments, and task create/edit/complete/delete.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { fromLocalInput } from "@/server/dates";
import { db } from "@/server/db";
import { createTask, deleteTask, moveTask, REPEATS, setTaskDone, updateTask, type Repeat, type TaskInput } from "@/server/ops/tasks";
import { rescheduleVisitTimed, setVisitAssignees } from "@/server/ops/visits";
import { TransitionError } from "@/server/status/visit";

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
  else {
    await db.task.findFirstOrThrow({ where: { id, businessId: user.businessId } });
    const ok = await db.user.findMany({ where: { id: { in: ids }, businessId: user.businessId }, select: { id: true } });
    await db.$transaction([db.taskAssignee.deleteMany({ where: { taskId: id } }), db.taskAssignee.createMany({ data: ok.map((u) => ({ taskId: id, userId: u.id })) })]);
  }
  revalidatePath("/schedule");
  revalidatePath("/");
  const back = str(f, "back");
  if (back.startsWith("/") && !back.startsWith("//")) redirect(back);
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
const safe = (p: string, d: string) => (p.startsWith("/") && !p.startsWith("//") ? p : d);

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
