// In-process 60s tick. No queue library: state lives in Postgres, so restarts lose nothing.
// The outbox is already safe across containers (SKIP LOCKED). Automations added later (reminders, snow alerts)
// run inside `exclusive()`, a transaction-scoped advisory lock, plus per-message dedupe keys.
import { db } from "./db";
import { env } from "./env";
import { reminderDue } from "./billing/invoice";
import { dateOnly, todayLocal, toDbDate, TZ } from "./dates";
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
