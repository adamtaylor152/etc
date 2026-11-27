// Recurring jobs: a simple rule (weekly / every 2 weeks / monthly on weekdays) -> concrete visit dates.
// All dates are date-only (YYYY-MM-DD); rrule runs in UTC so no timezone can shift a day. Pure, unit-tested.
import { RRule, Weekday } from "rrule";

export type Repeat = { freq: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; byDay: number[]; startsOn: string; endsOn: string | null }; // byDay: 0=Mon..6=Sun

const toUTC = (s: string) => new Date(`${s}T00:00:00.000Z`);
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

export function toRRule(r: Repeat): string {
  const rule = new RRule({
    freq: r.freq === "MONTHLY" ? RRule.MONTHLY : RRule.WEEKLY,
    interval: r.freq === "BIWEEKLY" ? 2 : 1,
    // Monthly: "every month on the first <weekday>" when a weekday is picked, else the start date's day of month.
    byweekday: r.byDay.length ? r.byDay.map((d) => (r.freq === "MONTHLY" ? new Weekday(d, 1) : new Weekday(d))) : undefined,
    dtstart: toUTC(r.startsOn),
    until: r.endsOn ? toUTC(r.endsOn) : undefined,
  });
  return rule.toString();
}

/** Dates (inclusive) between from and to that the rule produces. */
export function recurrenceDates(rrule: string, from: string, to: string): string[] {
  const rule = RRule.fromString(rrule);
  return rule.between(toUTC(from), toUTC(to), true).map(fromUTC);
}

export function describeRule(rrule: string | null): string {
  if (!rrule) return "As needed";
  try {
    const t = RRule.fromString(rrule).toText();
    return t.charAt(0).toUpperCase() + t.slice(1);
  } catch {
    return "Custom";
  }
}
