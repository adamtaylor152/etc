// Calgary snow forecast from MET Norway (free, no key; credit "MET Norway", CC BY 4.0). Port of server.py's
// trim_forecast() + cache, plus a per-day snow total using the same 10:1 rule as the marketing site.
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { TZ } from "./dates";

const URL_ = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=51.0447&lon=-114.0719";
const TTL = 30 * 60_000;
export type Period = { t: string; h: number; s: string; p: number; a: number | null };
type Raw = { properties: { timeseries: { time: string; data: Record<string, { summary?: { symbol_code: string }; details?: { precipitation_amount?: number; air_temperature?: number } }> }[] } };

/** Non-overlapping periods: hourly near-term, 6-hourly later. */
export function trimForecast(input: unknown): Period[] {
  const raw = input as Raw;
  const out: Period[] = [];
  let covered: number | null = null;
  for (const e of raw.properties.timeseries) {
    const t = Date.parse(e.time);
    if (covered && t < covered) continue;
    for (const [key, hrs] of [["next_1_hours", 1], ["next_6_hours", 6]] as const) {
      const d = e.data[key];
      if (d?.summary) {
        out.push({ t: e.time, h: hrs, s: d.summary.symbol_code, p: d.details?.precipitation_amount ?? 0, a: e.data.instant?.details?.air_temperature ?? null });
        covered = t + hrs * 3_600_000;
        break;
      }
    }
  }
  return out;
}

/** Snow cm per Calgary calendar day. ponytail: 1 mm water ≈ 1 cm snow; real ratios run ~5:1 to 20:1. */
export function snowByDay(periods: Period[]): { day: string; cm: number; lo: number | null; hi: number | null }[] {
  const days = new Map<string, { cm: number; lo: number | null; hi: number | null }>();
  for (const p of periods) {
    const day = format(new TZDate(Date.parse(p.t), TZ), "yyyy-MM-dd");
    const d = days.get(day) ?? { cm: 0, lo: null, hi: null };
    if (p.s.includes("snow") || p.s.includes("sleet")) d.cm += p.p;
    if (p.a != null) { d.lo = d.lo == null ? p.a : Math.min(d.lo, p.a); d.hi = d.hi == null ? p.a : Math.max(d.hi, p.a); }
    days.set(day, d);
  }
  return [...days].map(([day, d]) => ({ day, ...d, cm: Math.round(d.cm * 10) / 10 })).sort((a, b) => a.day.localeCompare(b.day));
}

let cache: { at: number; periods: Period[] } | null = null;
export async function forecast(): Promise<Period[] | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.periods;
  try {
    const r = await fetch(URL_, { headers: { "User-Agent": process.env.WEATHER_USER_AGENT ?? "etc-crm/1.0" }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`MET ${r.status}`);
    cache = { at: Date.now(), periods: trimForecast(await r.json()) };
    return cache.periods;
  } catch (e) {
    console.error("forecast fetch failed", e);
    if (cache) { cache.at = Date.now() - TTL + 5 * 60_000; return cache.periods; } // serve stale, retry in 5 min
    return null;
  }
}
