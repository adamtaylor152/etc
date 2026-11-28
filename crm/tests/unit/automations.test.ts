// Who is due for the automatic messages: win-back, plan renewal, review asks and reminders, missed-call text-backs, skip notices.
import { describe, expect, it } from "vitest";
import { renewalStep, winBackDue } from "@/server/ops/automations";
import { missedCallPlan, textedStop } from "@/server/ops/calls";
import { nextTextWindow } from "@/server/ops/campaigns";
import { reviewAskDue, reviewFollowUpDue } from "@/server/ops/marketing";
import { skipNotice } from "@/server/status/visit";

const now = new Date("2026-12-01T18:00:00Z"); // late morning in Calgary
const calgaryHour = (t: Date) => Number(t.toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", hourCycle: "h23" }));
const d = (s: string) => new Date(`${s}T18:00:00Z`);

describe("win-back", () => {
  const c = { lastVisitAt: d("2026-05-20"), openWork: false, lastSentAt: null };
  it("is due once the last visit is N months back", () => {
    expect(winBackDue(c, 6, now)).toBe(true);
    expect(winBackDue({ ...c, lastVisitAt: d("2026-06-15") }, 6, now)).toBe(false);
    expect(winBackDue(c, 12, now)).toBe(false);
  });
  it("skips clients who never had a visit or have something open", () => {
    expect(winBackDue({ ...c, lastVisitAt: null }, 6, now)).toBe(false);
    expect(winBackDue({ ...c, openWork: true }, 6, now)).toBe(false);
  });
  it("goes at most once per client per 12 months", () => {
    expect(winBackDue({ ...c, lastSentAt: d("2026-01-10") }, 6, now)).toBe(false);
    expect(winBackDue({ ...c, lastSentAt: d("2025-11-30") }, 6, now)).toBe(true);
  });
});

describe("plan renewal", () => {
  const p = { today: "2026-09-20", seasonStart: "2026-10-15", seasonEnd: "2027-04-30", daysBefore: 30, reminderDays: 14, renewed: false, firstQueued: false, firstSentOn: null, reminderQueued: false };
  it("sends the first email from N days before the season until it starts", () => {
    expect(renewalStep({ ...p, today: "2026-09-14" })).toBeNull();
    expect(renewalStep({ ...p, today: "2026-09-15" })).toBe("first");
    expect(renewalStep(p)).toBe("first");
    expect(renewalStep({ ...p, today: "2026-10-15" })).toBeNull(); // season already started: too late for a first ask
  });
  it("sends one reminder, N days after the first actually went out", () => {
    const asked = { ...p, firstQueued: true, firstSentOn: "2026-09-20" };
    expect(renewalStep({ ...asked, today: "2026-10-03" })).toBeNull();
    expect(renewalStep({ ...asked, today: "2026-10-04" })).toBe("reminder");
    expect(renewalStep({ ...asked, today: "2026-10-20" })).toBe("reminder"); // still worth one nudge just after the start
    expect(renewalStep({ ...asked, today: "2026-10-04", reminderQueued: true })).toBeNull();
    expect(renewalStep({ ...asked, today: "2026-10-04", reminderDays: 0 })).toBeNull();
    expect(renewalStep({ ...asked, firstSentOn: null, today: "2026-10-10" })).toBeNull(); // first still waiting in the outbox (or failed)
    expect(renewalStep({ ...asked, today: "2027-05-01" })).toBeNull();
  });
  it("stops the moment they renew", () => {
    expect(renewalStep({ ...p, renewed: true })).toBeNull();
    expect(renewalStep({ ...p, renewed: true, firstQueued: true, firstSentOn: "2026-09-01", today: "2026-10-01" })).toBeNull();
  });
});

describe("review requests", () => {
  const first = { reviewTrigger: "first" as const, reviewCapMonths: 6, reviewRatedMonths: 12 };
  const every = { ...first, reviewTrigger: "every" as const, reviewCapMonths: 2 };
  it("first job of the season: one ask per 180 days", () => {
    expect(reviewAskDue(first, { lastAskedAt: null, lastRatedAt: null }, now)).toBe(true);
    expect(reviewAskDue(first, { lastAskedAt: d("2026-08-01"), lastRatedAt: null }, now)).toBe(false);
    expect(reviewAskDue(first, { lastAskedAt: d("2026-05-01"), lastRatedAt: null }, now)).toBe(true);
  });
  it("every job: capped at one ask per N months", () => {
    expect(reviewAskDue(every, { lastAskedAt: d("2026-11-01"), lastRatedAt: null }, now)).toBe(false);
    expect(reviewAskDue(every, { lastAskedAt: d("2026-09-15"), lastRatedAt: null }, now)).toBe(true);
  });
  it("never asks someone who rated recently, whatever the trigger", () => {
    expect(reviewAskDue(every, { lastAskedAt: d("2026-03-01"), lastRatedAt: d("2026-03-02") }, now)).toBe(false);
    expect(reviewAskDue(every, { lastAskedAt: d("2025-10-01"), lastRatedAt: d("2025-10-02") }, now)).toBe(true);
  });
  it("reminds once, N days later, only while unrated and still recent", () => {
    const r = { sentAt: d("2026-11-25"), ratedAt: null, followUpAt: null };
    expect(reviewFollowUpDue(r, 5, d("2026-11-29"))).toBe(false);
    expect(reviewFollowUpDue(r, 5, now)).toBe(true);
    expect(reviewFollowUpDue({ ...r, ratedAt: d("2026-11-26") }, 5, now)).toBe(false);
    expect(reviewFollowUpDue({ ...r, followUpAt: d("2026-11-30") }, 5, now)).toBe(false);
    expect(reviewFollowUpDue({ ...r, sentAt: d("2026-10-01") }, 5, now)).toBe(false); // switched on later: old asks are left alone
  });
});

describe("missed-call text-back", () => {
  const call = { direction: "IN" as const, status: "missed", from: "+14035550101", startedAt: new Date(now.getTime() - 4 * 60_000) };
  const ok = { stopped: false, contactedSince: false, staff: false }, hours = { from: 8, to: 20 };
  it("texts back a fresh missed inbound call, now if inside the hours", () => {
    expect(missedCallPlan(call, ok, hours, now)).toEqual({ task: true, textAt: now });
    expect(missedCallPlan({ ...call, status: "no_answer" }, ok, hours, now).textAt).toBe(now);
  });
  it("holds a night call's text until the window opens", () => {
    const night = new Date("2026-12-02T08:30:00Z"); // between 1 and 3 am
    const at = missedCallPlan({ ...call, startedAt: night }, ok, hours, night).textAt!;
    expect(calgaryHour(at)).toBe(8);
    expect(at.getTime() - night.getTime()).toBeLessThan(8 * 3_600_000); // the same morning
  });
  it("ignores answered, outbound, stale, staff and unusable numbers", () => {
    const none = { task: false, textAt: null };
    expect(missedCallPlan({ ...call, status: "answered" }, ok, hours, now)).toEqual(none);
    expect(missedCallPlan({ ...call, direction: "OUT" }, ok, hours, now)).toEqual(none);
    expect(missedCallPlan({ ...call, startedAt: new Date(now.getTime() - 3 * 3_600_000) }, ok, hours, now)).toEqual(none);
    expect(missedCallPlan(call, { ...ok, staff: true }, hours, now)).toEqual(none);
    expect(missedCallPlan({ ...call, from: "anonymous" }, ok, hours, now)).toEqual(none);
  });
  it("never texts a number that said STOP, but still makes the call-back task", () => {
    expect(missedCallPlan(call, { ...ok, stopped: true }, hours, now)).toEqual({ task: true, textAt: null });
    expect(missedCallPlan(call, { ...ok, contactedSince: true }, hours, now)).toEqual({ task: false, textAt: null });
  });
  it("reads the latest STOP/START from a number's texts", () => {
    expect(textedStop(["thanks!", "STOP", "hello"])).toBe(true);
    expect(textedStop(["start", "ok", "Stop"])).toBe(false);
    expect(textedStop(["please stop coming on Mondays"])).toBe(false);
    expect(textedStop([])).toBe(false);
  });
  it("uses the given hours for the window", () => {
    const evening = new Date("2026-12-02T03:30:00Z"); // 8:30 or 9:30 pm: fine for an 8-to-10 window, too late for 8-to-8
    expect(nextTextWindow(evening, 8, 22)).toBe(evening);
    expect(calgaryHour(nextTextWindow(evening, 8, 20))).toBe(8);
  });
});

describe("skipped-visit notice", () => {
  it("only has wording for reasons the client can act on", () => {
    expect(skipNotice("BLOCKED_BY_CAR")?.what).toContain("vehicle");
    expect(skipNotice("NO_ACCESS")?.next).toContain("Reply");
    for (const r of ["ALREADY_CLEARED", "BELOW_TRIGGER", "CLIENT_CANCELLED", "OTHER", null]) expect(skipNotice(r)).toBeNull();
  });
  it("respects the owner's choice of reasons", () => {
    expect(skipNotice("WEATHER", ["BLOCKED_BY_CAR", "NO_ACCESS"])).toBeNull();
    expect(skipNotice("NO_ACCESS", ["BLOCKED_BY_CAR", "NO_ACCESS"])).not.toBeNull();
    expect(skipNotice("ALREADY_CLEARED", ["ALREADY_CLEARED"])).toBeNull();
  });
});
