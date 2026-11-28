// In-process 60s tick. No queue library: state lives in Postgres, so restarts lose nothing.
// The outbox is already safe across containers (SKIP LOCKED). Automations added later (reminders, snow alerts)
// run inside `exclusive()`, a transaction-scoped advisory lock, plus per-message dedupe keys.
import { createStorm } from "./ops/storms";
import { health, markTick } from "./health";
import { retryTextMedia } from "./ops/texts";
import { sendReviewRequests } from "./ops/marketing";
import { syncTelnyxCalls } from "./ops/calls";
import { db } from "./db";
import { env } from "./env";
import { reminderDue } from "./billing/invoice";
import { addDays, dateOnly, todayLocal, toDbDate, TZ } from "./dates";
import { forecast, snowByDay } from "./forecast";
import { generateRecurringVisits } from "./ops/jobs";
import { billingEmailFor, invoiceRecurringPeriods, invoiceSeasonalInstalments, invoiceUnbilled } from "./ops/invoices";
import { isInvoiceDay } from "./billing/periods";
import { parseSettings } from "./settings";
import { autoPayPending } from "./billing/autopay";
import { runAutoPay } from "./ops/autopay";
import { followUpDue } from "./status/quote";
import { plansTriggered } from "./snow/select";
import { enqueue, enqueueSms, processOutbox } from "./email/outbox";

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
  markTick(); // heartbeat for /api/healthz: set once the outbox run finishes
  await retryTextMedia();
  if (Date.now() - lastCallSync > 5 * 60_000) {
    lastCallSync = Date.now();
    await exclusive(LOCK_CALLS, async () => { for (const b of await db.business.findMany({ select: { id: true } })) await syncTelnyxCalls(b.id).catch((e) => console.error("call sync failed", e)); });
  }
  if (Date.now() - lastHourly > 3_600_000) {
    lastHourly = Date.now();
    await exclusive(LOCK_HOURLY, hourly);
  }
}

const LOCK_HOURLY = 724_001;
const LOCK_CALLS = 724_002;
let lastCallSync = 0;

/** Hourly automations. Each one is idempotent (dedupe keys / state checks), so a missed or doubled run is harmless. */
async function hourly() {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour >= 8 && hour < 20) await invoiceReminders(); // no reminder emails at night
  if (hour >= 7 && hour < 22) await snowAlert();
  if (hour >= 9 && hour < 19) await quoteFollowUps();
  for (const b of await db.business.findMany({ select: { id: true } })) await generateRecurringVisits(b.id);
  if (hour === 7) await monthlyInvoices();
  if (hour >= 7 && hour < 20) await invoiceSeasonalInstalments(); // due instalments of seasonal snow plans; emails the client
  if (hour >= 7 && hour < 20) await invoiceRecurringPeriods(); // recurring jobs on a fixed monthly price: a draft per month due
  if (hour >= 8 && hour < 20) await runAutoPay().catch((e) => console.error("auto-pay run failed", e)); // saved cards: charge due invoices, retry failed ones
  if (hour >= 6 && hour < 22) await visitReminders(hour);
  if (hour >= 10 && hour < 18) await reviewRequests();
  if (hour === 6) await dailyDigest();
  await opsAlerts();
}

/** Texts failing: email the owners (once a day). Emails failing can't be emailed: the outside monitor catches those. */
async function opsAlerts() {
  const h = await health();
  if (h.checks.texts) return;
  const biz = await db.business.findUnique({ where: { slug: env.businessSlug } });
  if (!biz) return;
  for (const to of env.ownerEmails) {
    await enqueue(db, { businessId: biz.id, template: "owner.notice", to, priority: 2, dedupeKey: `ops:texts:${todayLocal()}:${to}`, props: {
      title: "Texts are failing", body: `${h.counts.smsFailed} text messages failed in the last 2 hours. Check the Telnyx number and balance.`, path: "/messages",
    } });
  }
}

/** A job's invoice day (the 1st unless it picked another): draft invoices for monthly-billed work. Re-runs find nothing left to bill. */
async function monthlyInvoices() {
  const today = todayLocal();
  const groups = await db.visitCharge.findMany({
    where: { invoiceLineItemId: null, visit: { job: { invoiceSchedule: "MONTHLY" } } },
    select: { businessId: true, visit: { select: { jobId: true, job: { select: { clientId: true, invoiceDay: true } } } } },
  });
  const seen = new Set<string>();
  for (const g of groups) {
    const key = `${g.businessId}:${g.visit.job.clientId}:${g.visit.jobId}`;
    if (seen.has(key) || !isInvoiceDay(today, g.visit.job.invoiceDay)) continue;
    seen.add(key);
    await invoiceUnbilled({ id: null, businessId: g.businessId }, { clientId: g.visit.job.clientId, jobId: g.visit.jobId });
  }
}

/** Which days' visits get a reminder this hour: the first one N days ahead at the chosen hour, plus 7am on the day if on. Pure, unit-tested. */
export function reminderDates(today: string, hour: number, s: { visitReminders: boolean; reminderDaysBefore: number; reminderHour: number; reminderMorningOf: boolean }) {
  if (!s.visitReminders) return [];
  return [...(hour === s.reminderHour ? [addDays(today, s.reminderDaysBefore)] : []), ...(s.reminderMorningOf && hour === 7 ? [today] : [])];
}

/** Reminders for scheduled (non-snow) visits, by email and (if they opted in) text. Timing is per business (Settings). */
async function visitReminders(hour: number) {
  const today = todayLocal();
  for (const biz of await db.business.findMany({ select: { id: true, settings: true } })) {
    for (const date of reminderDates(today, hour, parseSettings(biz.settings))) {
      const visits = await db.visit.findMany({
        where: { businessId: biz.id, scheduledDate: toDbDate(date), state: "SCHEDULED", job: { kind: { not: "SNOW_PLAN" }, closedAt: null, client: { visitReminders: true } } },
        include: { job: { include: { client: true } } },
      });
      for (const v of visits) {
        if (!v.job.client.emailBouncedAt) await enqueue(db, {
          businessId: v.businessId, template: "visit.reminder", to: v.job.client.email, replyTo: env.helpEmail, priority: 5, props: { visitId: v.id },
          dedupeKey: `visit:${v.id}:reminder:${date}:${date === today ? "day-of" : "ahead"}`, clientId: v.job.clientId, entityType: "Visit", entityId: v.id,
        });
        await enqueueSms(db, { businessId: v.businessId, template: "sms.visit_reminder", client: v.job.client, props: { visitId: v.id }, dedupeKey: `visit:${v.id}:reminder-sms:${date}:${date === today ? "day-of" : "ahead"}`, entityType: "Visit", entityId: v.id });
      }
    }
  }
}

/** Google review ask, 2 days after a client's first completed visit of the season; once per client per season. */
async function reviewRequests() {
  await sendReviewRequests();
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

/**
 * Up to two nudges (Settings: days after sending, each on/off) for quotes still waiting on the client, by the channel
 * the quote was last sent by. Each goes once per quote (dedupe key), whatever the hourly run does.
 */
export async function quoteFollowUps(now = new Date()) {
  const today = todayLocal();
  const quotes = await db.quote.findMany({ where: { status: "AWAITING_RESPONSE", sentAt: { not: null }, client: { followUpQuotes: true } }, include: { client: true } });
  for (const q of quotes) {
    const s = parseSettings((await db.business.findUniqueOrThrow({ where: { id: q.businessId } })).settings);
    const n = followUpDue({ status: q.status, validUntil: dateOnly(q.validUntil), sentAt: q.lastSentAt ?? q.sentAt }, [{ on: s.quoteFollowUp, days: s.quoteFollowUpDays }, { on: s.quoteFollowUp2, days: s.quoteFollowUp2Days }], now, today);
    if (!n) continue;
    const dedupeKey = `quote:${q.id}:followup${n > 1 ? n : ""}`; // the first keeps the key the single follow-up used
    if (q.lastSentVia === "SMS") await enqueueSms(db, { businessId: q.businessId, template: "sms.quote", client: q.client, props: { quoteId: q.id, followUp: true }, dedupeKey, entityType: "Quote", entityId: q.id });
    else if (!q.client.emailBouncedAt) {
      await enqueue(db, {
        businessId: q.businessId, template: "quote.follow_up", to: q.client.email, replyTo: env.helpEmail, priority: 6, props: { quoteId: q.id },
        dedupeKey, clientId: q.clientId, entityType: "Quote", entityId: q.id,
      });
    }
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
  // Storm prep: a FORECAST storm is waiting on the Snow page, so storm morning is one tap ("Start").
  const open = await db.snowEvent.findFirst({ where: { businessId: biz.id, OR: [{ status: { in: ["FORECAST", "ACTIVE"] } }, { snowStartedAt: toDbDate(first) }] } });
  const owner = open ? null : await db.user.findFirst({ where: { businessId: biz.id, active: true }, orderBy: { createdAt: "asc" } });
  if (owner) await createStorm(owner, { forecastCm: Math.round(peak), day: first, notes: "Created automatically from the forecast." });
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
    // A refund re-opens an invoice; chasing the client for money we just sent back is the owner's call, not automatic.
    where: { status: "AWAITING_PAYMENT", dueOn: { lt: toDbDate(today) }, remindersSent: { lt: 2 }, client: { followUpInvoices: true }, payments: { none: { refundedCents: { gt: 0 } } } },
    include: { client: true },
  });
  for (const inv of due) {
    const n = reminderDue({ status: inv.status, dueOn: dateOnly(inv.dueOn), remindersSent: inv.remindersSent }, today);
    if (!n || inv.client.emailBouncedAt) continue;
    if (autoPayPending(inv.autoPayState)) continue; // the card will be charged (or retried): its own emails cover this
    await db.$transaction(async (tx) => {
      await enqueue(tx, {
        businessId: inv.businessId, template: "invoice.reminder", to: await billingEmailFor(tx, inv.client), replyTo: env.helpEmail, priority: 6,
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
