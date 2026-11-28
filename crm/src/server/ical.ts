// A person's schedule as an iCalendar feed (subscribe from Google / Apple / Outlook). One-way: read only.
// The link is the secret: it carries a signature of the user id, so it can't be guessed and needs no sign-in.
import { createHmac, timingSafeEqual } from "node:crypto";
import { configuredSecret } from "./secret";

export type CalEvent = { uid: string; title: string; location?: string | null; notes?: string | null; date: string; start?: Date | null; end?: Date | null };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const nextDay = (ymd: string) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replaceAll("-", ""); };

/** RFC 5545 text. Timed events are UTC instants; untimed ones are all-day. Pure, unit-tested. */
export function toIcs(name: string, events: CalEvent[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//etc. CRM//Schedule//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@etc-crm`, `DTSTAMP:${utc(now)}`);
    if (e.start) lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + 3_600_000))}`);
    else lines.push(`DTSTART;VALUE=DATE:${e.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push("END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

const sig = (userId: string) => createHmac("sha256", configuredSecret() ?? "").update(`cal.${userId}`).digest("base64url").slice(0, 32);
export const feedPath = (userId: string) => `/api/cal/${userId}.${sig(userId)}`;
/** The user id a feed key is for, or null if the signature is wrong (or no signing secret is set). */
export function feedUser(key: string) {
  const [userId, s] = key.replace(/\.ics$/, "").split(".");
  if (!userId || !s || !configuredSecret()) return null;
  const want = Buffer.from(sig(userId)), got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}
