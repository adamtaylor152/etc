import { afterEach, describe, expect, it, vi } from "vitest";
import { haversineMatrix, resetRoutingCache, travelMatrix } from "@/server/routing-matrix";
import { duration, etaWindow, routeTimes } from "@/server/routing/eta";
import { matrixDist, orderGroup, orderStops } from "@/server/routing/order";
import { splitRoute } from "@/server/runner";

const start = { lat: 50.913, lng: -114.117 };
const a = { id: "a", lat: 50.914, lng: -114.117 }, b = { id: "b", lat: 50.916, lng: -114.117 }, c = { id: "c", lat: 50.918, lng: -114.117 };

describe("ordering with an injected matrix", () => {
  it("follows the matrix, not the straight line", () => {
    // In a straight line it's start, a, b, c. By road, a is across the river: a long way from everything but c.
    const pts = [start, a, b, c];
    const m = [
      [0, 20, 2, 4],
      [20, 0, 20, 3],
      [2, 20, 0, 2],
      [4, 3, 2, 0],
    ];
    expect(orderStops(start, [a, b, c]).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(orderStops(start, [a, b, c], matrixDist(pts, m)).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
  it("falls back to straight-line for points the matrix doesn't know", () => {
    expect(matrixDist([start], [[0]])(start, a)).toBeCloseTo(0.111, 2);
  });
  it("an end point pulls the route toward where the day finishes", () => {
    // Two stops either side of the start; ending up north means doing the southern one first.
    const near = { id: "near", lat: 50.9135, lng: -114.117 }, far = { id: "far", lat: 50.911, lng: -114.117 };
    expect(orderStops(start, [near, far]).map((p) => p.id)).toEqual(["near", "far"]);
    expect(orderStops(start, [near, far], undefined, { lat: 50.92, lng: -114.117 }).map((p) => p.id)).toEqual(["far", "near"]);
  });
  it("puts do-first stops at the front of their community, then carries on from the last of them", () => {
    const stops = [a, b, { ...c, priority: true }];
    expect(orderGroup(start, stops).map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(orderGroup(start, [a, b, c]).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(orderGroup(start, [])).toEqual([]);
  });
});

describe("route times", () => {
  it("adds up drive and service time into arrivals and totals", () => {
    const t = routeTimes([10, 5, 8], 12, 15);
    expect(t.arrive).toEqual([10, 27, 47]); // arrive, 12 min on site, drive on
    expect(t.driveMin).toBe(38);
    expect(t.totalMin).toBe(74); // last stop done at 59, then 15 home
    expect(routeTimes([], 12)).toEqual({ arrive: [], driveMin: 0, totalMin: 0 });
  });
  it("formats durations", () => {
    expect([duration(45), duration(60), duration(125.4)]).toEqual(["45m", "1h 00m", "2h 05m"]);
  });
  it("tells clients a 30-minute window that always contains the estimate", () => {
    // Calgary is UTC-6 in July whatever the tzdata says about winter.
    expect(etaWindow(new Date("2027-07-15T15:22:00Z"))).toBe("9:00-9:30am");
    expect(etaWindow(new Date("2027-07-15T15:29:00Z"))).toBe("9:15-9:45am");
    expect(etaWindow(new Date("2027-07-15T17:50:00Z"))).toBe("11:30am-12:00pm");
  });
});

describe("splitRoute by estimated time", () => {
  it("balances minutes, not stop counts", () => {
    // Community a: 2 slow stops (long drives). Community b: 6 quick ones. By count x would get a + part of b.
    const stops = [...[40, 40].map((w, i) => ({ id: `a${i}`, community: "a", weight: w })), ...[13, 13, 13, 13, 14, 14].map((w, i) => ({ id: `b${i}`, community: "b", weight: w }))];
    const m = splitRoute(stops, ["x", "y"]);
    expect(stops.map((s) => m.get(s.id)).join("")).toBe("xxyyyyyy");
  });
});

describe("travelMatrix", () => {
  const pts = [start, a, b];
  const ok = { code: "Ok", durations: [[0, 120, 300], [120, 0, null], [300, 180, 0]], distances: [[0, 900, 2500], [900, 0, 1500], [2500, 1500, 0]] };
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetRoutingCache(); });

  it("uses straight-line distance at 30 km/h when ROUTING_URL is unset", async () => {
    vi.stubEnv("ROUTING_URL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const m = await travelMatrix(pts);
    expect(m.road).toBe(false);
    expect(m.minutes[0][1]).toBeCloseTo(m.km[0][1] * 2, 6);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("asks the OSRM table API (lng,lat), converts units, and caches the answer", async () => {
    vi.stubEnv("ROUTING_URL", "http://osrm.test/");
    const fetch = vi.fn(async () => new Response(JSON.stringify(ok)));
    vi.stubGlobal("fetch", fetch);
    const m = await travelMatrix(pts);
    expect(fetch).toHaveBeenCalledWith("http://osrm.test/table/v1/driving/-114.11700,50.91300;-114.11700,50.91400;-114.11700,50.91600?annotations=duration,distance", expect.anything());
    expect(m.road).toBe(true);
    expect(m.minutes[0]).toEqual([0, 2, 5]);
    expect(m.km[0][2]).toBe(2.5);
    expect(m.minutes[1][2]).toBeCloseTo(haversineMatrix(pts).minutes[1][2], 6); // a pair OSRM couldn't route
    await travelMatrix(pts);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("falls back when the server fails, and leaves it alone for a while", async () => {
    vi.stubEnv("ROUTING_URL", "http://osrm.test");
    const fetch = vi.fn(async () => { throw new Error("timeout"); });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await travelMatrix(pts)).road).toBe(false);
    expect((await travelMatrix([start, c])).road).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("falls back on a bad answer and past the size limit", async () => {
    vi.stubEnv("ROUTING_URL", "http://osrm.test");
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: "NoTable" }), { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await travelMatrix(pts)).road).toBe(false);
    resetRoutingCache();
    fetch.mockClear();
    expect((await travelMatrix(Array.from({ length: 101 }, (_, i) => ({ lat: 50.9 + i / 1000, lng: -114.1 })))).road).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
