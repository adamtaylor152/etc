import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pageOf } from "@/components/list-page";
import { findCommunity, toShape } from "@/server/communities";
import { addDays, clockTime, dateOnly, prettyMinutes, prettyTime, todayLocal, toDbDate } from "@/server/dates";
import { cad, lineTotal, money } from "@/server/money";
import { checkToken } from "@/server/tokens";

describe("times of day", () => {
  it("are written one way: 2:37 a.m.", () => {
    expect(clockTime(2, 37)).toBe("2:37 a.m.");
    expect(clockTime(0)).toBe("12:00 a.m.");
    expect(clockTime(12)).toBe("12:00 p.m.");
    expect(prettyMinutes(8 * 60)).toBe("8:00 a.m.");
    expect(prettyMinutes(20 * 60 + 5)).toBe("8:05 p.m.");
    // The locale-formatted instant matches the hand-built one (whatever space the runtime puts before a.m.).
    expect(prettyTime(new Date("2027-07-15T20:37:00Z")).replace(/\s/g, " ")).toBe(clockTime(14, 37));
  });
});

describe("money", () => {
  it("formats CAD", () => {
    expect(money(3500)).toBe("$35");
    expect(money(3550)).toBe("$35.50");
    expect(money(5)).toBe("$0.05");
    expect(money(123456)).toBe("$1,234.56");
    expect(money(-500)).toBe("-$5");
  });
  it("shows amounts on a page with two decimals, always", () => {
    expect(cad(5000)).toBe("$50.00");
    expect(cad(1163550)).toBe("$11,635.50");
    expect(cad(5)).toBe("$0.05");
    expect(cad(-500)).toBe("−$5.00");
  });
  it("rounds line totals half-up", () => {
    expect(lineTotal(1.5, 3333)).toBe(5000); // 4999.5 -> 5000
    expect(lineTotal(2, 3000)).toBe(6000);
  });
});

describe("dates (America/Edmonton)", () => {
  it("today flips at Calgary midnight, not UTC midnight", () => {
    // Jan 2026 is MST (UTC-7). tzdata 2026e has Alberta on permanent MDT (UTC-6) from Nov 2026, so the code
    // must follow the tz database rather than a hard-coded offset.
    expect(todayLocal(new Date("2026-01-16T06:59:00Z"))).toBe("2026-01-15"); // 11:59pm MST
    expect(todayLocal(new Date("2026-01-16T07:00:00Z"))).toBe("2026-01-16");
    expect(todayLocal(new Date("2026-07-01T05:59:00Z"))).toBe("2026-06-30"); // MDT is UTC-6
  });
  it("handles DST weekends", () => {
    expect(todayLocal(new Date("2026-03-08T08:30:00Z"))).toBe("2026-03-08"); // spring forward
    expect(todayLocal(new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01"); // fall back
  });
  it("date-only round trip and arithmetic", () => {
    expect(dateOnly(toDbDate("2026-12-31"))).toBe("2026-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("tokens", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const row = { purpose: "LOGIN" as const, revokedAt: null, expiresAt: new Date("2026-11-27T12:10:00Z"), maxUses: 1, useCount: 0 };
  it("accepts a fresh token", () => expect(checkToken(row, ["LOGIN"], now)).toBeNull());
  it("rejects missing, wrong purpose, revoked, expired, used up", () => {
    expect(checkToken(null, ["LOGIN"], now)).toBe("missing");
    expect(checkToken(row, ["INVOICE"], now)).toBe("wrong_purpose");
    expect(checkToken({ ...row, revokedAt: now }, ["LOGIN"], now)).toBe("revoked");
    expect(checkToken({ ...row, expiresAt: now }, ["LOGIN"], now)).toBe("expired");
    expect(checkToken({ ...row, useCount: 1 }, ["LOGIN"], now)).toBe("used_up");
    expect(checkToken({ ...row, maxUses: null, useCount: 99 }, ["LOGIN"], now)).toBeNull();
  });
});

describe("list paging", () => {
  it("works out the rows a page shows", () => {
    expect(pageOf(undefined, 734)).toMatchObject({ page: 1, pages: 15, skip: 0, take: 50, from: 1, to: 50 });
    expect(pageOf("2", 734)).toMatchObject({ page: 2, skip: 50, from: 51, to: 100 });
    expect(pageOf("15", 734)).toMatchObject({ page: 15, skip: 700, from: 701, to: 734 });
  });
  it("a page that doesn't exist lands on the nearest one that does", () => {
    expect(pageOf("99", 734).page).toBe(15); // e.g. a filter shrank the list
    expect(pageOf("0", 734).page).toBe(1);
    expect(pageOf("-3", 734).page).toBe(1);
    expect(pageOf("abc", 734).page).toBe(1);
    expect(pageOf("2", 0)).toMatchObject({ page: 1, pages: 1, skip: 0, from: 0, to: 0 });
    expect(pageOf("2", 50)).toMatchObject({ page: 1, pages: 1, to: 50 });
  });
});

describe("communities", () => {
  const gj = JSON.parse(readFileSync(new URL("../../prisma/data/communities.geojson", import.meta.url), "utf8"));
  const shapes = gj.features.map((f: { properties: { comm_code: string }; geometry: never }) => toShape(f.properties.comm_code, f.geometry));
  const name = (code: string | null) => gj.features.find((f: { properties: { comm_code: string } }) => f.properties.comm_code === code)?.properties.name;
  it.each([
    [50.9136, -114.1138, "EVERGREEN"],
    [50.9032, -114.1203, "BRIDLEWOOD"], // Bridlewood Ave SW area
    [51.0447, -114.0719, "DOWNTOWN COMMERCIAL CORE"],
  ])("%f,%f is in %s", (lat, lng, want) => {
    expect(name(findCommunity(shapes, lat, lng))).toBe(want);
  });
  it("outside the city is null", () => expect(findCommunity(shapes, 49.28, -123.12)).toBeNull());
});

import { localDayStart } from "@/server/dates";
describe("localDayStart", () => {
  it("is Calgary midnight", () => {
    expect(localDayStart("2026-01-15").toISOString()).toBe("2026-01-15T07:00:00.000Z"); // MST
    expect(localDayStart("2026-07-01").toISOString()).toBe("2026-07-01T06:00:00.000Z"); // MDT
  });
});
