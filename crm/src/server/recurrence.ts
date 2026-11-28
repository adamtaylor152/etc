// Recurring jobs: a simple rule (every N weeks on weekdays / every N months on a day or an nth weekday) -> concrete visit dates.
// All dates are date-only (YYYY-MM-DD); rrule runs in UTC so no timezone can shift a day. Pure, unit-tested.
import { RRule, Weekday } from "rrule";

export type Repeat = {
  freq: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; byDay: number[]; startsOn: string; endsOn: string | null; // byDay: 0=Mon..6=Sun
  interval?: number; // every N weeks / months (BIWEEKLY = every 2 weeks)
  monthDay?: number | null; // MONTHLY: day of the month (1-28), -1 = the last day
  nth?: number | null; // MONTHLY with byDay: 1-4 = first..fourth, -1 = last (default first)
  count?: number | null; // stop after this many visits (counted from startsOn); instead of endsOn
};

const toUTC = (s: string) => new Date(`${s}T00:00:00.000Z`);
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

export function toRRule(r: Repeat): string {
  const monthly = r.freq === "MONTHLY";
  const rule = new RRule({
    freq: monthly ? RRule.MONTHLY : RRule.WEEKLY,
    interval: r.interval ?? (r.freq === "BIWEEKLY" ? 2 : 1),
    // Monthly: a day of the month, or "the nth <weekday>" when a weekday is picked, else the start date's day of month.
    bymonthday: monthly && r.monthDay ? r.monthDay : undefined,
    byweekday: r.byDay.length && !(monthly && r.monthDay) ? r.byDay.map((d) => (monthly ? new Weekday(d, r.nth ?? 1) : new Weekday(d))) : undefined,
    dtstart: toUTC(r.startsOn),
    until: r.endsOn && !r.count ? toUTC(r.endsOn) : undefined,
    count: r.count ?? undefined,
  });
  return rule.toString();
}

/** The form's view of a stored rule (the inverse of toRRule, for the edit form). Null when it can't be read. */
export function fromRRule(rrule: string): Repeat | null {
  try {
    const o = RRule.fromString(rrule).origOptions;
    const list = <T,>(v: T | T[] | null | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
    const days = list(o.byweekday).map((d) => (typeof d === "number" ? new Weekday(d) : typeof d === "string" ? Weekday.fromStr(d) : d));
    const monthly = o.freq === RRule.MONTHLY;
    return {
      freq: monthly ? "MONTHLY" : "WEEKLY", interval: o.interval ?? 1, byDay: days.map((d) => d.weekday),
      monthDay: monthly ? list(o.bymonthday)[0] ?? null : null, nth: monthly ? days[0]?.n ?? null : null,
      startsOn: o.dtstart ? fromUTC(o.dtstart) : "", endsOn: o.until ? fromUTC(o.until) : null, count: o.count ?? null,
    };
  } catch {
    return null;
  }
}

/** Dates (inclusive) between from and to that the rule produces. */
export function recurrenceDates(rrule: string, from: string, to: string): string[] {
  const rule = RRule.fromString(rrule);
  return rule.between(toUTC(from), toUTC(to), true).map(fromUTC);
}

/** The last date of a rule that ends (on a date or after N visits); null when it keeps going. */
export function lastRecurrenceDate(rrule: string): string | null {
  const rule = RRule.fromString(rrule);
  if (!rule.origOptions.count && !rule.origOptions.until) return null;
  const last = rule.all().at(-1);
  return last ? fromUTC(last) : null;
}

/** Drop the dates inside a pause (both ends inclusive; an open end pauses from / until forever). */
export function outsidePause(dates: string[], from: string | null, until: string | null): string[] {
  if (!from && !until) return dates;
  return dates.filter((d) => (from && d < from) || (until && d > until));
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
