// In-process 60s tick. No queue library: state lives in Postgres, so restarts lose nothing.
// The outbox is already safe across containers (SKIP LOCKED). Automations added later (reminders, snow alerts)
// run inside `exclusive()`, a transaction-scoped advisory lock, plus per-message dedupe keys.
import { retryTextMedia } from "./ops/texts";
import { db } from "./db";
import { env } from "./env";
import { reminderDue } from "./billing/invoice";
import { addDays, dateOnly, todayLocal, toDbDate, TZ } from "./dates";
import { forecast, snowByDay } from "./forecast";
import { generateRecurringVisits } from "./ops/jobs";
import { invoiceUnbilled } from "./ops/invoices";
import { parseSettings } from "./settings";
import { plansTriggered } from "./snow/select";
import { enqueue, processOutbox } from "./email/outbox";

const TICK_MS = 60_000;
const g = globalThis as unknown as { etcScheduler?: NodeJS.Timeout };

export function startScheduler() {
  if (env.cronDisabled || g.etcScheduler) return;
  g.etcScheduler = setInterval(() => tick().catch((e) => console.error("tick failed", e)), TICK_MS);
  g.etcScheduler.unref();
  console.info("scheduler started");
}

let lastHourly = 0;
export async function tick() {
  await processOutbox();
  await retryTextMedia();
  if (Date.now() - lastHourly > 3_600_000) {
    lastHourly = Date.now();
    await exclusive(LOCK_HOURLY, hourly);
  }
}

const LOCK_HOURLY = 724_001;

/** Hourly automations. Each one is idempotent (dedupe keys / state checks), so a missed or doubled run is harmless. */
async function hourly() {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour >= 8 && hour < 20) await invoiceReminders(); // no reminder emails at night
  if (hour >= 7 && hour < 22) await snowAlert();
  if (hour >= 9 && hour < 19) await quoteFollowUps();
  for (const b of await db.business.findMany({ select: { id: true } })) await generateRecurringVisits(b.id);
  if (hour === 7) await monthlyInvoices();
  if (hour === 17) await visitReminders();
  if (hour >= 10 && hour < 18) await reviewRequests();
  if (hour === 6) await dailyDigest();
}

/** 1st of the month: draft invoices for recurring (monthly-billed) work. Re-runs find nothing left to bill. */
async function monthlyInvoices() {
  if (todayLocal().slice(8) !== "01") return;
  const groups = await db.visitCharge.findMany({
    where: { invoiceLineItemId: null, visit: { job: { invoiceSchedule: "MONTHLY" } } },
    select: { businessId: true, visit: { select: { jobId: true, job: { select: { clientId: true } } } } },
  });
  const seen = new Set<string>();
  for (const g of groups) {
    const key = `${g.businessId}:${g.visit.job.clientId}:${g.visit.jobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await invoiceUnbilled({ id: null, businessId: g.businessId }, { clientId: g.visit.job.clientId, jobId: g.visit.jobId });
  }
}

/** Day-before reminder for scheduled (non-snow) visits. */
async function visitReminders() {
  const tomorrow = addDays(todayLocal(), 1);
  const visits = await db.visit.findMany({
    where: { scheduledDate: toDbDate(tomorrow), state: "SCHEDULED", job: { kind: { not: "SNOW_PLAN" }, closedAt: null } },
    include: { job: { include: { client: true } } },
  });
  for (const v of visits) {
    const biz = await db.business.findUniqueOrThrow({ where: { id: v.businessId } });
    if (!parseSettings(biz.settings).visitReminders || v.job.client.emailBouncedAt) continue;
    await enqueue(db, {
      businessId: v.businessId, template: "visit.reminder", to: v.job.client.email, replyTo: env.helpEmail, priority: 5, props: { visitId: v.id },
      dedupeKey: `visit:${v.id}:reminder:${tomorrow}`, clientId: v.job.clientId, entityType: "Visit", entityId: v.id,
    });
  }
}

/** Google review ask, 2 days after a client's first completed visit of the season; once per client per season. */
async function reviewRequests() {
  const businesses = await db.business.findMany();
  for (const biz of businesses) {
    if (!parseSettings(biz.settings).reviewRequests || !biz.googleReviewUrl) continue;
    const from = new Date(Date.now() - 4 * 86_400_000), to = new Date(Date.now() - 2 * 86_400_000);
    const done = await db.visit.findMany({
      where: { businessId: biz.id, state: "COMPLETED", completedAt: { gte: from, lte: to } },
      include: { job: { include: { client: true } } }, distinct: ["jobId"],
    });
    const season = todayLocal().slice(0, 4);
    for (const v of done) {
      const c = v.job.client;
      if (c.marketingOptOut || c.emailBouncedAt) continue;
      await enqueue(db, {
        businessId: biz.id, template: "review.request", to: c.email, replyTo: env.helpEmail, priority: 8, props: { clientId: c.id },
        dedupeKey: `review:${c.id}:${season}`, clientId: c.id,
      });
    }
  }
}

/** 6am summary for owners who turned it on. */
async function dailyDigest() {
  const today = todayLocal();
  for (const biz of await db.business.findMany()) {
    if (!parseSettings(biz.settings).dailyDigest) continue;
    for (const to of env.ownerEmails) {
      await enqueue(db, { businessId: biz.id, template: "owner.daily_digest", to, priority: 4, props: { day: today }, dedupeKey: `digest:${today}:${to}` });
    }
  }
}

/** One nudge, 3 days after sending, for quotes still waiting on the client. */
async function quoteFollowUps() {
  const cutoff = new Date(Date.now() - 3 * 86_400_000);
  const quotes = await db.quote.findMany({ where: { status: "AWAITING_RESPONSE", sentAt: { lte: cutoff } }, include: { client: true } });
  for (const q of quotes) {
    const biz = await db.business.findUniqueOrThrow({ where: { id: q.businessId } });
    if (!parseSettings(biz.settings).quoteFollowUp || q.client.emailBouncedAt) continue;
    await enqueue(db, {
      businessId: q.businessId, template: "quote.follow_up", to: q.client.email, replyTo: env.helpEmail, priority: 6, props: { quoteId: q.id },
      dedupeKey: `quote:${q.id}:followup`, clientId: q.clientId, entityType: "Quote", entityId: q.id,
    });
  }
}

/** Email owners once per snowy day when the forecast (today + tomorrow) meets at least one plan's trigger. */
async function snowAlert() {
  const biz = await db.business.findUnique({ where: { slug: env.businessSlug } });
  if (!biz || !parseSettings(biz.settings).snowAlert) return;
  const periods = await forecast();
  if (!periods) return;
  const today = todayLocal();
  const days = snowByDay(periods).filter((d) => d.day === today || d.day === addDays(today, 1));
  const season = await db.season.findFirst({ where: { businessId: biz.id, startsOn: { lte: toDbDate(today) }, endsOn: { gte: toDbDate(today) } } });
  if (!season || !days.length) return;
  const plans = await db.job.findMany({ where: { businessId: biz.id, kind: "SNOW_PLAN", seasonId: season.id, closedAt: null, planPausedAt: null }, select: { id: true, triggerCm: true, planPausedAt: true, closedAt: true } });
  const peak = Math.max(...days.map((d) => d.cm));
  const hit = plansTriggered(plans, Math.floor(peak), season.defaultTriggerCm).length;
  if (!hit) return;
  const first = days.find((d) => d.cm >= 1)!.day;
  for (const to of env.ownerEmails) {
    await enqueue(db, {
      businessId: biz.id, template: "owner.snow_alert", to, priority: 3, dedupeKey: `snow-alert:${first}:${to}`,
      props: { days: days.filter((d) => d.cm >= 0.5).map((d) => ({ label: d.day === today ? "Today" : "Tomorrow", cm: d.cm })), plans: hit },
    });
  }
}

async function invoiceReminders() {
  const today = todayLocal();
  const due = await db.invoice.findMany({
    where: { status: "AWAITING_PAYMENT", dueOn: { lt: toDbDate(today) }, remindersSent: { lt: 2 } },
    include: { client: true },
  });
  for (const inv of due) {
    const n = reminderDue({ status: inv.status, dueOn: dateOnly(inv.dueOn), remindersSent: inv.remindersSent }, today);
    if (!n || inv.client.emailBouncedAt) continue;
    await db.$transaction(async (tx) => {
      await enqueue(tx, {
        businessId: inv.businessId, template: "invoice.reminder", to: inv.client.email, replyTo: env.helpEmail, priority: 6,
        props: { invoiceId: inv.id, n }, dedupeKey: `invoice:${inv.id}:reminder:${n}`, clientId: inv.clientId, entityType: "Invoice", entityId: inv.id,
      });
      await tx.invoice.update({ where: { id: inv.id }, data: { remindersSent: n, lastReminderAt: new Date() } });
    });
  }
}

/** Run fn only if no other container is running it right now (lock released when the transaction ends). */
export async function exclusive(lockKey: number, fn: () => Promise<void>) {
  await db.$transaction(async (tx) => {
    const [{ got }] = await tx.$queryRaw<{ got: boolean }[]>`SELECT pg_try_advisory_xact_lock(${lockKey}) AS got`;
    if (got) await fn();
  }, { timeout: 120_000 });
}
