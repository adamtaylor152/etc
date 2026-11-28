import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const TZ = "America/Edmonton";

/** Today's calendar date in Calgary as YYYY-MM-DD, whatever the server's TZ. */
export function todayLocal(now: Date = new Date()): string {
  return format(new TZDate(now, TZ), "yyyy-MM-dd");
}

/** @db.Date columns come back as UTC-midnight Dates; read them as YYYY-MM-DD with no TZ shift. */
export function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** YYYY-MM-DD -> Date for a @db.Date column. */
export function toDbDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDays(s: string, n: number): string {
  const d = toDbDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week a YYYY-MM-DD falls in (time sheets run Monday to Sunday). */
export function mondayOf(s: string): string {
  return addDays(s, -((toDbDate(s).getUTCDay() + 6) % 7));
}

/** "Thu, Dec 4" for a YYYY-MM-DD. */
export function prettyDate(s: string | null | undefined): string {
  if (!s) return "";
  return toDbDate(s).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** An instant shown in Calgary time: "Nov. 28, 2:37 p.m.". It ends in a period, so a sentence that ends with it adds none. */
export function prettyDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Times of day are written one way on every screen: "2:37 a.m.", "8:00 p.m." (Canadian style, minutes always shown).
/** The time of day of an instant, in Calgary: "2:37 a.m.". */
export function prettyTime(d: Date | null | undefined): string {
  return d ? d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) : "";
}

/** The same style from a wall-clock hour and minute (calendar slots, minutes after midnight): (14, 37) -> "2:37 p.m.". Pure. */
export function clockTime(hour: number, minute = 0): string {
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour % 24 < 12 ? "a.m." : "p.m."}`;
}

/** Minutes after midnight -> "8:00 a.m.". Pure. */
export const prettyMinutes = (min: number) => clockTime(Math.floor(min / 60), min % 60);

/** The instant a Calgary calendar day starts (DST- and tzdata-aware). */
export function localDayStart(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, TZ).getTime());
}

/** "2026-12-01T14:30" from a datetime-local input, read as Calgary time (the server runs in UTC). */
export function fromLocalInput(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, TZ).getTime());
}

/** A Date as a datetime-local value in Calgary time. */
export function toLocalInput(d: Date): string {
  return format(new TZDate(d, TZ), "yyyy-MM-dd'T'HH:mm");
}

/** "today", "tomorrow" or "on Tuesday, Dec 2": how a reminder names the visit day. Pure, unit-tested. */
export function dayWord(date: string, today: string = todayLocal()): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return `on ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}`;
}
