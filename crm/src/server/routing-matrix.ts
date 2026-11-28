// Drive times between a list of points: an OSRM-compatible /table API when ROUTING_URL is set, straight-line maths
// otherwise (or when the server is down, slow, or the list is too long). Callers never have to care which they got,
// but `road` says whether the minutes are real enough to quote to a client.
import { env } from "./env";
import { haversineKm, type LatLng } from "./routing/order";

export type Matrix = { minutes: number[][]; km: number[][]; road: boolean };

export const FALLBACK_KMH = 30; // straight-line distance at city speed
const MAX_POINTS = 100; // OSRM's default table limit
const TIMEOUT_MS = 4000, CACHE_MS = 5 * 60_000, CACHE_MAX = 200, DOWN_MS = 60_000;

const cache = new Map<string, { at: number; m: Matrix }>();
let downUntil = 0; // after a failure, skip the server for a minute so one outage doesn't cost 4s per request

export function haversineMatrix(pts: LatLng[]): Matrix {
  const km = pts.map((a) => pts.map((b) => haversineKm(a, b)));
  return { km, minutes: km.map((row) => row.map((k) => (k / FALLBACK_KMH) * 60)), road: false };
}

export async function travelMatrix(pts: LatLng[]): Promise<Matrix> {
  const fallback = haversineMatrix(pts);
  const base = env.routingUrl;
  if (!base || pts.length < 2 || pts.length > MAX_POINTS || Date.now() < downUntil) return fallback;
  const coords = pts.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const hit = cache.get(coords);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.m;
  try {
    const r = await fetch(`${base}/table/v1/driving/${coords}?annotations=duration,distance`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const j = (await r.json()) as { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
    if (!r.ok || j.code !== "Ok" || j.durations?.length !== pts.length) throw new Error(`${r.status} ${j.code ?? ""}`);
    // A pair OSRM can't route (null) keeps its straight-line guess.
    const m: Matrix = {
      road: true,
      minutes: j.durations.map((row, i) => row.map((s, k) => (s == null ? fallback.minutes[i][k] : s / 60))),
      km: fallback.km.map((row, i) => row.map((k, n) => { const d = j.distances?.[i]?.[n]; return d == null ? k : d / 1000; })),
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(coords, { at: Date.now(), m });
    return m;
  } catch (e) {
    downUntil = Date.now() + DOWN_MS;
    console.warn(`routing: ${base} failed (${e instanceof Error ? e.message : e}); using straight-line distances for a minute`);
    return fallback;
  }
}

/** Tests only: forget cached matrices and the "server is down" pause. */
export function resetRoutingCache() { cache.clear(); downUntil = 0; }
