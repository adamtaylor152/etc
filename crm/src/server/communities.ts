// Point-in-polygon against City of Calgary community boundaries (seeded into Community).
// ponytail: all ~313 polygons held in memory and scanned linearly with a bbox pre-check; plenty fast at this size.
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { MultiPolygon, Polygon } from "geojson";
import { db } from "./db";

type Shape = { code: string; geometry: Polygon | MultiPolygon; bbox: [number, number, number, number] };
let shapes: Shape[] | null = null;

function bboxOf(g: Polygon | MultiPolygon): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  for (const ring of rings) for (const [x, y] of ring) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

export function findCommunity(list: Shape[], lat: number, lng: number): string | null {
  for (const s of list) {
    const [a, b, c, d] = s.bbox;
    if (lng < a || lng > c || lat < b || lat > d) continue;
    if (booleanPointInPolygon([lng, lat], s.geometry)) return s.code;
  }
  return null;
}

export function toShape(code: string, geometry: Polygon | MultiPolygon): Shape {
  return { code, geometry, bbox: bboxOf(geometry) };
}

export async function communityFor(lat: number | null | undefined, lng: number | null | undefined): Promise<string | null> {
  if (lat == null || lng == null) return null;
  shapes ??= (await db.community.findMany({ select: { code: true, geometry: true } }))
    .map((c) => toShape(c.code, c.geometry as unknown as Polygon | MultiPolygon));
  return findCommunity(shapes, lat, lng);
}
