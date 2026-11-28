// Route timing: drive minutes between stops, arrival offsets, totals, and the arrival window we tell clients. Pure, unit-tested.
import { TZ } from "../dates";

/**
 * `driveMin[i]` is the drive to stop i from the one before (the first from the start point). Each stop then takes
 * `serviceMin` (one number for every stop, or one per stop). Returns minutes-after-setting-off for each arrival, and the totals (`homeMin` = the drive back).
 */
export function routeTimes(driveMin: number[], serviceMin: number | number[], homeMin = 0) {
  let t = 0;
  const arrive = driveMin.map((d, i) => { t += d; const at = t; t += typeof serviceMin === "number" ? serviceMin : serviceMin[i]; return at; });
  return { arrive, driveMin: driveMin.reduce((a, b) => a + b, 0) + homeMin, totalMin: t + homeMin };
}

/** "2h 05m" / "45m". */
export function duration(min: number) {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "9:15am" in Calgary time. */
export const clock = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();

/** A 30-minute window around an arrival, on the quarter hour, so we never promise a precise time: 9:22 -> "9:00-9:30am". */
export function etaWindow(arrival: Date) {
  const q = 15 * 60_000, mid = Math.round(arrival.getTime() / q) * q;
  const from = clock(new Date(mid - q)), to = clock(new Date(mid + q));
  return `${from.slice(-2) === to.slice(-2) ? from.slice(0, -2) : from}-${to}`; // one am/pm when both ends share it
}
