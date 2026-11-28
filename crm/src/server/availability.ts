// Availability: working hours + time off, conflict warnings, and "Find a time" slot suggestions.
// Everything here is pure (Calgary-local minutes and YYYY-MM-DD dates) and unit-tested; schedule-data.ts loads the rows.

import { prettyMinutes } from "./dates";

export type WorkHours = Record<string, [string, string]>; // weekday "0"(Sun)..."6" -> ["08:00","18:00"]; missing = day off
export type TimeOffRow = { userId: string | null; startDate: string; endDate: string; reason?: string | null };
export type Busy = { id: string; userIds: string[]; date: string; start: number | null; end: number | null; label: string; lat?: number | null; lng?: number | null };

export const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + (m || 0); };
export const fmtMin = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "pm" : "am"}`;
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Calgary-local date and minutes-from-midnight for an instant. */
export function localParts(d: Date) {
  const date = d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  const [h, m] = d.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  return { date, min: h * 60 + m };
}

export const onTimeOff = (rows: TimeOffRow[], userId: string | null, date: string) =>
  rows.find((t) => (t.userId === null || t.userId === userId) && t.startDate <= date && date <= t.endDate) ?? null;

/** Why a person can't work then (null = fine). */
export function unavailable(hours: WorkHours, timeOff: TimeOffRow[], userId: string, date: string, start: number | null, end: number | null) {
  const off = onTimeOff(timeOff, userId, date);
  if (off) return off.userId ? `time off${off.reason ? `: ${off.reason}` : ""}` : `closed${off.reason ? `: ${off.reason}` : ""}`;
  const day = hours[String(weekday(date))];
  if (!day) return "their day off";
  if (start != null && (start < toMin(day[0]) || (end ?? start + 60) > toMin(day[1]))) return `outside their hours, ${prettyMinutes(toMin(day[0]))}–${prettyMinutes(toMin(day[1]))}`;
  return null;
}

const overlaps = (a: { start: number | null; end: number | null }, b: { start: number | null; end: number | null }) =>
  a.start != null && b.start != null && a.start < (b.end ?? b.start + 60) && b.start < (a.end ?? a.start + 60);

/** Warnings for putting an item at a date/time with these people. */
export function conflicts(item: Busy, others: Busy[], people: { id: string; name: string; hours: WorkHours }[], timeOff: TimeOffRow[]) {
  const out: string[] = [];
  for (const uid of item.userIds) {
    const p = people.find((x) => x.id === uid);
    if (!p) continue;
    const why = unavailable(p.hours, timeOff, uid, item.date, item.start, item.end);
    if (why) out.push(`${p.name} isn't working then (${why})`);
    const clash = others.find((o) => o.id !== item.id && o.date === item.date && o.userIds.includes(uid) && overlaps(o, item));
    if (clash) out.push(`${p.name} is already booked then (${clash.label})`);
  }
  if (!item.userIds.length) { const closed = onTimeOff(timeOff, null, item.date); if (closed) out.push(`Closed that day${closed.reason ? ` (${closed.reason})` : ""}`); }
  return out;
}

/** Open windows in a working day around busy times, in step-minute increments. */
export function freeSlots(day: [string, string] | undefined, busy: { start: number | null; end: number | null }[], durationMin: number, step = 30) {
  if (!day) return [];
  const [from, to] = [toMin(day[0]), toMin(day[1])];
  const slots: number[] = [];
  for (let t = from; t + durationMin <= to; t += step) {
    if (!busy.some((b) => overlaps(b, { start: t, end: t + durationMin }))) slots.push(t);
  }
  return slots;
}

export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (x: number) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export type Suggestion = { userId: string; date: string; start: number; nearKm: number | null; near: string | null; score: number };

/**
 * Best open slots over the next `days`: per person, per working day, the first free window. Ranked by date, then by how
 * close the job is to someone's other stops that day (less driving), then earliest time.
 */
export function suggestSlots(input: {
  people: { id: string; hours: WorkHours }[]; timeOff: TimeOffRow[]; busy: Busy[]; from: string; days: number; durationMin: number;
  where?: { lat: number; lng: number } | null; addDays: (d: string, n: number) => string; limit?: number;
  nowMin?: number; // minutes past midnight now: today's slots must start after it
}): Suggestion[] {
  const out: Suggestion[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = input.addDays(input.from, i);
    for (const p of input.people) {
      if (onTimeOff(input.timeOff, p.id, date)) continue;
      const mine = input.busy.filter((b) => b.date === date && b.userIds.includes(p.id));
      const slots = freeSlots(p.hours[String(weekday(date))], mine, input.durationMin).filter((t) => i > 0 || input.nowMin == null || t >= input.nowMin + 30);
      if (!slots.length) continue;
      let nearKm: number | null = null, near: string | null = null;
      if (input.where) for (const b of mine) if (b.lat != null && b.lng != null) {
        const km = haversineKm(input.where, { lat: b.lat, lng: b.lng });
        if (nearKm === null || km < nearKm) { nearKm = km; near = b.label; }
      }
      // Next to an existing stop beats an empty day; earlier days beat later ones.
      const score = i * 10 + (nearKm === null ? 5 : Math.min(5, nearKm / 2)) + slots[0] / 1440;
      out.push({ userId: p.id, date, start: slots[0], nearKm, near, score });
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, input.limit ?? 12);
}
