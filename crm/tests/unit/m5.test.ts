import { describe, expect, it } from "vitest";
import { snowByDay, trimForecast } from "@/server/forecast";
import { nearestNeighbour, orderStops, routeLength } from "@/server/routing/order";

const start = { lat: 50.913, lng: -114.117 }; // Evergreen depot
const pts = [
  { id: "far", lat: 50.95, lng: -114.06 },
  { id: "near", lat: 50.915, lng: -114.115 },
  { id: "mid", lat: 50.93, lng: -114.09 },
  { id: "mid2", lat: 50.925, lng: -114.1 },
];

describe("route ordering", () => {
  it("nearest neighbour walks outward from the depot", () => {
    expect(nearestNeighbour(start, pts).map((p) => p.id)).toEqual(["near", "mid2", "mid", "far"]);
  });
  it("2-opt is never worse than nearest neighbour and keeps every stop", () => {
    const scrambled = [pts[2], pts[0], pts[3], pts[1]];
    const o = orderStops(start, scrambled);
    expect(new Set(o.map((p) => p.id))).toEqual(new Set(pts.map((p) => p.id)));
    expect(routeLength(start, o)).toBeLessThanOrEqual(routeLength(start, nearestNeighbour(start, scrambled)) + 1e-9);
  });
  it("handles 0 and 1 stops", () => {
    expect(orderStops(start, [])).toEqual([]);
    expect(orderStops(start, [pts[0]])).toEqual([pts[0]]);
  });
});

describe("forecast", () => {
  const raw = { properties: { timeseries: [
    { time: "2026-12-04T06:00:00Z", data: { instant: { details: { air_temperature: -8 } }, next_1_hours: { summary: { symbol_code: "snow" }, details: { precipitation_amount: 1.2 } } } },
    { time: "2026-12-04T07:00:00Z", data: { instant: { details: { air_temperature: -9 } }, next_6_hours: { summary: { symbol_code: "heavysnow" }, details: { precipitation_amount: 4 } } } },
    { time: "2026-12-04T09:00:00Z", data: { next_1_hours: { summary: { symbol_code: "cloudy" }, details: {} } } }, // inside the 6h block: skipped
    { time: "2026-12-04T13:00:00Z", data: { instant: { details: { air_temperature: -3 } }, next_6_hours: { summary: { symbol_code: "rain" }, details: { precipitation_amount: 2 } } } },
  ] } };
  it("trims overlapping periods like server.py", () => {
    expect(trimForecast(raw).map((p) => [p.t, p.h])).toEqual([["2026-12-04T06:00:00Z", 1], ["2026-12-04T07:00:00Z", 6], ["2026-12-04T13:00:00Z", 6]]);
  });
  it("sums snow per Calgary day (rain doesn't count)", () => {
    // Calgary is UTC-6 in Dec 2026 (tzdata 2026e), so 06:00Z is midnight Dec 4. The 13:00Z rain adds nothing.
    const days = snowByDay(trimForecast(raw));
    expect(days).toEqual([{ day: "2026-12-04", cm: 5.2, lo: -9, hi: -3 }]);
  });
});
