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

/** "Thu, Dec 4" for a YYYY-MM-DD. */
export function prettyDate(s: string | null | undefined): string {
  if (!s) return "";
  return toDbDate(s).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** An instant shown in Calgary time. */
export function prettyDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The instant a Calgary calendar day starts (DST- and tzdata-aware). */
export function localDayStart(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, TZ).getTime());
}
