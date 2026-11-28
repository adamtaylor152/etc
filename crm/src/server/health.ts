// System health for /api/healthz (polled by the outside monitor) and the hourly ops alerts.
// "Down" (503) = database unreachable or the scheduler stopped ticking. Email/text trouble is reported but keeps 200,
// so a mail outage doesn't look like the site being down; the monitor alerts on both.
import { db } from "./db";
import { env } from "./env";

const g = globalThis as unknown as { etcLastTick?: number; etcBootAt?: number };
g.etcBootAt ??= Date.now();
export const markTick = () => { g.etcLastTick = Date.now(); };

/** Pure: turns raw numbers into the verdict. */
export function verdict(i: { dbOk: boolean; cronEnabled: boolean; lastTickMs: number | null; upMs: number; emailStuck: number; emailFailed: number; smsFailed: number }) {
  // Ticks run every 60 s; allow a slow outbox run before calling it stalled. Fresh boots get 5 minutes to tick.
  const scheduler = !i.cronEnabled || (i.lastTickMs != null ? i.lastTickMs < 5 * 60_000 : i.upMs < 5 * 60_000);
  // ponytail: fixed thresholds so one bad address or phone number doesn't page anyone; tune if it's noisy.
  const emails = i.emailStuck === 0 && i.emailFailed < 2;
  const texts = i.smsFailed < 3;
  return { up: i.dbOk && scheduler, checks: { db: i.dbOk, scheduler, emails, texts } };
}

export async function health() {
  const now = Date.now();
  let dbOk = true, emailStuck = 0, emailFailed = 0, smsFailed = 0;
  try {
    const since = new Date(now - 2 * 3_600_000);
    [emailStuck, emailFailed, smsFailed] = await Promise.all([
      // Must-send mail (priority <= 3 is never held back by the daily cap) waiting well past its retry time = sender is down.
      db.emailMessage.count({ where: { status: { in: ["QUEUED", "SENDING"] }, nextAttemptAt: { lt: new Date(now - 30 * 60_000) }, priority: { lte: 3 } } }),
      db.emailMessage.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
      db.textMessage.count({ where: { direction: "OUT", status: "failed", createdAt: { gte: since } } }),
    ]);
  } catch { dbOk = false; }
  return {
    ...verdict({ dbOk, cronEnabled: !env.cronDisabled, lastTickMs: g.etcLastTick ? now - g.etcLastTick : null, upMs: now - g.etcBootAt!, emailStuck, emailFailed, smsFailed }),
    counts: { emailStuck, emailFailed, smsFailed },
  };
}
