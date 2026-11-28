// Online booking times: open start times anyone on the team can take (working hours, time off, their visits/tasks),
// and booking the on-site assessment for a quote request into one of them.
import { fmtMin, freeSlots, toMin, unavailable, weekday, type Busy, type TimeOffRow, type WorkHours } from "../availability";
import { addDays, fromLocalInput, todayLocal, toDbDate } from "../dates";
import { db } from "../db";
import { logActivity } from "../records";
import { loadAvailability } from "../schedule-data";
import { WINDOWS, windowOf, type WindowKey } from "../windows";

export const ASSESS_MIN = 60, LEAD_DAYS = 1, WINDOW_DAYS = 14;
type Av = { people: { id: string; hours: WorkHours }[]; timeOff: TimeOffRow[]; busy: Busy[] };

/** Who can take date/start for durationMin (first free person, in team order), or null. Unassigned timed items block everyone. */
export function whoIsFree(av: Av, date: string, start: number, durationMin = ASSESS_MIN) {
  for (const p of av.people) {
    if (unavailable(p.hours, av.timeOff, p.id, date, start, start + durationMin)) continue;
    const mine = av.busy.filter((b) => b.date === date && (b.userIds.includes(p.id) || !b.userIds.length));
    if (freeSlots(p.hours[String(weekday(date))], mine, durationMin, 1).includes(start)) return p.id;
  }
  return null;
}

/** First person and start time free for an assessment inside a window (30-min steps), or null. */
export function freeInWindow(av: Av, date: string, key: WindowKey) {
  const w = windowOf(key)!;
  for (let t = toMin(w.from); t + ASSESS_MIN <= toMin(w.to); t += 30) {
    const userId = whoIsFree(av, date, t);
    if (userId) return { userId, start: t };
  }
  return null;
}

/** Open hourly start times per day (union across people). Pure. */
export function openTimes(av: Av, from: string, days: number, durationMin = ASSESS_MIN) {
  const out: { date: string; windows: WindowKey[]; times: { start: number; label: string }[] }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const set = new Set<number>();
    for (const p of av.people) {
      if (unavailable(p.hours, av.timeOff, p.id, date, null, null)) continue;
      const mine = av.busy.filter((b) => b.date === date && (b.userIds.includes(p.id) || !b.userIds.length));
      for (const t of freeSlots(p.hours[String(weekday(date))], mine, durationMin, 60)) set.add(t);
    }
    const windows = WINDOWS.filter((w) => freeInWindow(av, date, w.key)).map((w) => w.key);
    if (set.size || windows.length) out.push({ date, windows, times: [...set].sort((a, b) => a - b).map((start) => ({ start, label: fmtMin(start) })) });
  }
  return out;
}

export async function publicTimes(businessId: string) {
  const from = addDays(todayLocal(), LEAD_DAYS);
  return openTimes(await loadAvailability(businessId, from, addDays(from, WINDOW_DAYS)), from, WINDOW_DAYS);
}

/** Validates a requested window ({date, window}) or exact time ({date, start}) against live availability; null if it's gone. */
export async function claimSlot(businessId: string, slot: unknown) {
  const s = slot as { date?: unknown; start?: unknown; window?: unknown } | null;
  if (!s || typeof s.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return null;
  const first = addDays(todayLocal(), LEAD_DAYS);
  if (s.date < first || s.date > addDays(first, WINDOW_DAYS)) return null;
  const av = await loadAvailability(businessId, s.date, s.date);
  const w = windowOf(s.window);
  if (w) {
    const hit = freeInWindow(av, s.date, w.key);
    return hit ? { date: s.date, ...hit, window: w } : null;
  }
  if (typeof s.start !== "number" || !Number.isInteger(s.start)) return null;
  const userId = whoIsFree(av, s.date, s.start);
  return userId ? { date: s.date, start: s.start, userId, window: null } : null;
}

/** What the client is told: "Monday, November 30, Early (6–11 am)" or "... at 10:00 am". */
export function slotText(slot: { date: string; start: number; window: { label: string; hint: string } | null }) {
  const day = new Date(`${slot.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  return slot.window ? `${day}, ${slot.window.label} (${slot.window.hint})` : `${day} at ${fmtMin(slot.start)}`;
}

/** Puts the assessment on the request and on that person's day (as a task, like a hand-made request). */
export async function bookAssessment(businessId: string, requestId: string, slot: { date: string; start: number; userId: string; window: { label: string; hint: string } | null }) {
  const hm = `${String(Math.floor(slot.start / 60)).padStart(2, "0")}:${String(slot.start % 60).padStart(2, "0")}`;
  const at = fromLocalInput(`${slot.date}T${hm}`)!;
  await db.$transaction(async (tx) => {
    const r = await tx.request.update({ where: { id: requestId }, data: { assessmentAt: at, status: "ASSESSMENT_SCHEDULED" } });
    await tx.task.create({
      data: {
        businessId, title: `Assessment: request #${r.number}`, clientId: r.clientId, propertyId: r.propertyId, date: toDbDate(slot.date),
        allDay: false, startAt: at, endAt: new Date(at.getTime() + ASSESS_MIN * 60_000),
        instructions: `Booked online${slot.window ? ` for the ${slot.window.label} window (${slot.window.hint}); told the client that window` : ""}. Request #${r.number}: ${r.title}`, assignees: { create: [{ userId: slot.userId }] },
      },
    });
    await logActivity(tx, { businessId, type: "request.assessment_booked", entityType: "Request", entityId: r.id, clientId: r.clientId, data: { at: at.toISOString() } });
  });
  return at;
}
