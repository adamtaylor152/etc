// Stop ordering: nearest-neighbour from a start point, then 2-opt to remove crossings. Pure, unit-tested.
// The cost between two points is injected (`dist`): road minutes from a matrix when we have one (routing-matrix.ts),
// straight-line km otherwise. ponytail: O(n^2) per pass, fine for a few dozen stops per community.
export type LatLng = { lat: number; lng: number };
export type Pt = LatLng & { id: string };
export type Dist = (a: LatLng, b: LatLng) => number;

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A `dist` that reads a matrix whose rows/columns are `pts` (the same objects, in order); anything else is straight-line. */
export function matrixDist(pts: LatLng[], matrix: number[][]): Dist {
  const at = new Map(pts.map((p, i) => [p, i]));
  return (a, b) => matrix[at.get(a) ?? -1]?.[at.get(b) ?? -1] ?? haversineKm(a, b);
}

/** Length of start -> stops (-> end, when the route has somewhere to finish). */
export function routeLength(start: LatLng, stops: LatLng[], dist: Dist = haversineKm, end?: LatLng | null) {
  let d = 0, prev = start;
  for (const s of stops) { d += dist(prev, s); prev = s; }
  return end ? d + dist(prev, end) : d;
}

export function nearestNeighbour<T extends LatLng>(start: LatLng, stops: T[], dist: Dist = haversineKm): T[] {
  const left = [...stops], out: T[] = [];
  let at: LatLng = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (dist(at, left[i]) < dist(at, left[best])) best = i;
    const next = left.splice(best, 1)[0];
    out.push(next);
    at = next;
  }
  return out;
}

/** Open-path 2-opt (we don't return to the start; an `end` pulls the last stops toward it). */
export function twoOpt<T extends LatLng>(start: LatLng, route: T[], dist: Dist = haversineKm, end?: LatLng | null): T[] {
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        if (routeLength(start, cand, dist, end) + 1e-9 < routeLength(start, best, dist, end)) { best = cand; improved = true; }
      }
    }
  }
  return best;
}

export const orderStops = <T extends LatLng>(start: LatLng, stops: T[], dist: Dist = haversineKm, end?: LatLng | null) =>
  twoOpt(start, nearestNeighbour(start, stops, dist), dist, end);

/** One community: "do first" stops in their best order, then everyone else carrying on from the last of them. */
export function orderGroup<T extends LatLng & { priority?: boolean }>(start: LatLng, stops: T[], dist: Dist = haversineKm, end?: LatLng | null): T[] {
  const rest = stops.filter((s) => !s.priority);
  const first = orderStops(start, stops.filter((s) => s.priority), dist, rest.length ? null : end);
  return [...first, ...orderStops(first.at(-1) ?? start, rest, dist, end)];
}
