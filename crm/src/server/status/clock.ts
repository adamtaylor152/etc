// The time clock rule. A person has at most ONE running entry, so hours can never be counted twice:
//  - Clock in starts a general entry (no visit/job). Clock out stops whatever is running.
//  - Starting a visit timer ends the general entry at that instant (the day clock is paused, like Jobber).
//  - Stopping the visit timer resumes the day clock with a new general entry, if the timer (or the chain of
//    back-to-back visit timers before it) took over from a general entry.
// Entries therefore never overlap, and a day's hours are simply the sum of its entries. Pure, unit-tested.

export type Span = { id: string; visitId: string | null; jobId: string | null; startedAt: Date; endedAt: Date | null; minutes: number | null };
export type ClockAction = "clockIn" | "clockOut" | "visitStart" | "visitStop";
export type ClockPlan = { stop: Span[]; start: "general" | "visit" | null; error?: string };

export const isGeneral = (e: { visitId: string | null; jobId: string | null }) => !e.visitId && !e.jobId;

/** Did `timer` take over from the day clock? Walks back through entries that ended exactly when the next one began. */
export function pausedGeneral(entries: Span[], timer: Span): boolean {
  let cur = timer;
  for (let i = 0; i < entries.length; i++) {
    const prev = entries.find((e) => e.id !== cur.id && e.endedAt?.getTime() === cur.startedAt.getTime());
    if (!prev) return false;
    if (isGeneral(prev)) return true;
    cur = prev;
  }
  return false;
}

/** What to stop and what to start for an action, given the person's recent entries (running ones included). */
export function clockPlan(entries: Span[], action: ClockAction): ClockPlan {
  const running = entries.filter((e) => !e.endedAt);
  const timer = running.find((e) => !isGeneral(e));
  if (action === "clockIn") {
    if (timer) return { stop: [], start: null, error: "A visit timer is running. Stop it first, then clock in." };
    return { stop: [], start: running.length ? null : "general" }; // already clocked in: nothing to do
  }
  if (action === "clockOut") return { stop: running, start: null };
  if (action === "visitStart") return { stop: running, start: "visit" };
  // visitStop: only a visit timer stops here; the day clock (if that is what's running) carries on.
  return { stop: running.filter((e) => !isGeneral(e)), start: timer && pausedGeneral(entries, timer) ? "general" : null };
}

/** Minutes for a set of entries, split general vs job; a running entry counts up to `now`. */
export function clockTotals(entries: Span[], now: Date) {
  let general = 0, job = 0;
  for (const e of entries) {
    const m = e.minutes ?? Math.max(0, Math.round((now.getTime() - e.startedAt.getTime()) / 60_000));
    if (isGeneral(e)) general += m; else job += m;
  }
  return { general, job, total: general + job };
}
