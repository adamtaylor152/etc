import { describe, expect, it } from "vitest";
import { age, quoteStage, requestStage } from "@/server/status/pipeline";

describe("pipeline stages", () => {
  it("puts quotes in the column their status means", () => {
    expect((["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED", "DECLINED", "ARCHIVED"] as const).map(quoteStage))
      .toEqual(["quoting", "sent", "changes", "won", "won", "lost", "lost"]);
  });
  it("shows a request only until a quote or job stands for it", () => {
    expect(requestStage({ status: "NEW", quotes: 0, jobs: 0 })).toBe("new");
    expect(requestStage({ status: "ASSESSMENT_SCHEDULED", quotes: 0, jobs: 0 })).toBe("assessment");
    expect(requestStage({ status: "NEW", quotes: 1, jobs: 0 })).toBeNull(); // the quote card takes over
    expect(requestStage({ status: "CONVERTED", quotes: 0, jobs: 1 })).toBe("won"); // booked straight to a job
    expect(requestStage({ status: "ARCHIVED", quotes: 1, jobs: 0 })).toBe("lost");
    expect(requestStage({ status: "ARCHIVED", quotes: 0, jobs: 1 })).toBeNull(); // tidied away after the work, not lost
  });
  it("says how long a card has sat", () => {
    const now = new Date("2026-12-31T12:00:00Z"), ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
    expect([0.5, 3, 13, 14, 69, 75].map((d) => age(ago(d), now))).toEqual(["today", "3d", "13d", "2w", "9w", "2mo"]);
  });
});
