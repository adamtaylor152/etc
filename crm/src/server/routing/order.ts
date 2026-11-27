// Stop ordering: nearest-neighbour from a start point, then 2-opt to remove crossings. Pure, unit-tested.
// ponytail: straight-line (haversine) distance, O(n^2) per pass. Fine for a few dozen stops per community;
// a road-distance matrix (OSRM/Google) is the upgrade if routes get long.
export type Pt = { id: string; lat: number; lng: number };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeLength(start: { lat: number; lng: number }, stops: Pt[]) {
  let d = 0, prev = start;
  for (const s of stops) { d += haversineKm(prev, s); prev = s; }
  return d;
}

export function nearestNeighbour(start: { lat: number; lng: number }, stops: Pt[]): Pt[] {
  const left = [...stops], out: Pt[] = [];
  let at: { lat: number; lng: number } = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (haversineKm(at, left[i]) < haversineKm(at, left[best])) best = i;
    const next = left.splice(best, 1)[0];
    out.push(next);
    at = next;
  }
  return out;
}

/** Open-path 2-opt (we don't return to the start). */
export function twoOpt(start: { lat: number; lng: number }, route: Pt[]): Pt[] {
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        if (routeLength(start, cand) + 1e-9 < routeLength(start, best)) { best = cand; improved = true; }
      }
    }
  }
  return best;
}

export const orderStops = (start: { lat: number; lng: number }, stops: Pt[]) => twoOpt(start, nearestNeighbour(start, stops));
