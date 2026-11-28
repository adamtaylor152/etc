import { beforeAll, describe, expect, it } from "vitest";
import { feedPath, feedUser, toIcs } from "@/server/ical";

describe("toIcs", () => {
  it("writes timed and all-day events with escaped text", () => {
    const ics = toIcs("etc. · Sam", [
      { uid: "visit-1", title: "Gutters; front, back", location: "12 Elm St, Calgary", notes: "Gate code 1234\nDog in yard", date: "2026-12-02", start: new Date("2026-12-02T16:00:00Z"), end: new Date("2026-12-02T18:00:00Z") },
      { uid: "task-2", title: "Buy ice melt", date: "2026-12-31" },
    ], new Date("2026-12-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261202T160000Z\r\nDTEND:20261202T180000Z");
    expect(ics).toContain(String.raw`SUMMARY:Gutters\; front\, back`);
    expect(ics).toContain("DESCRIPTION:Gate code 1234\\nDog in yard");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101"); // all-day ends the next day, across a year
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("feed links", () => {
  beforeAll(() => { process.env.MEDIA_SIGNING_SECRET = "test-secret-at-least-16"; });
  it("accept their own signature and nothing else", () => {
    const key = feedPath("user123").split("/").pop()!;
    expect(feedUser(key)).toBe("user123");
    expect(feedUser(`${key}.ics`)).toBe("user123");
    expect(feedUser(key.replace("user123", "user999"))).toBeNull();
    expect(feedUser("user123.")).toBeNull();
    expect(feedUser("user123")).toBeNull();
  });
});
