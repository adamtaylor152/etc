// Email outbox. Writers enqueue inside their own transaction (so a mail outage never loses a booking);
// processOutbox() claims rows with FOR UPDATE SKIP LOCKED, so two containers during a deploy can't double-send.
import { render, toPlainText } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, Prisma } from "@/generated/prisma/client";
import { db, type Db } from "../db";
import { env } from "../env";
import { templates, type PropsOf, type TemplateName } from "./templates";

const MAX_ATTEMPTS = 6;
const DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP ?? 300); // Brevo free plan
const CAP_RESERVE = 30; // keep headroom for priority <= 3 (logins, receipts, bookings)

export async function enqueue<T extends TemplateName>(tx: Db, m: {
  businessId: string; template: T; to: string; props: PropsOf<T>; cc?: string[]; replyTo?: string;
  priority?: number; dedupeKey?: string; clientId?: string; entityType?: string; entityId?: string; sendAfter?: Date;
}) {
  const subject = (templates[m.template].subject as (p: PropsOf<T>) => string)(m.props);
  const data = {
    businessId: m.businessId, template: m.template, to: m.to, cc: m.cc ?? [], replyTo: m.replyTo, subject,
    props: m.props as Prisma.InputJsonValue, priority: m.priority ?? 5, dedupeKey: m.dedupeKey,
    clientId: m.clientId, entityType: m.entityType, entityId: m.entityId, nextAttemptAt: m.sendAfter ?? new Date(),
  };
  if (!m.dedupeKey) return tx.emailMessage.create({ data });
  // Dedupe: automations can re-run safely; the second enqueue is a no-op.
  return tx.emailMessage.upsert({ where: { businessId_dedupeKey: { businessId: m.businessId, dedupeKey: m.dedupeKey } }, create: data, update: {} });
}

let transport: Transporter | null = null;
function mailer() {
  if (!process.env.SMTP_HOST || !env.mailFrom) return null;
  const tls = process.env.SMTP_TLS ?? "starttls";
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587),
    secure: tls === "ssl", requireTLS: tls === "starttls", ignoreTLS: tls === "none",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return transport;
}

export async function renderMessage(m: Pick<EmailMessage, "template" | "props" | "businessId" | "to">) {
  const t = templates[m.template as TemplateName];
  if (!t) throw new Error(`unknown template ${m.template}`);
  const el = await (t.render as (p: unknown, c: { businessId: string; to: string }) => Promise<React.ReactElement>)(m.props, { businessId: m.businessId, to: m.to });
  const html = await render(el);
  return { html, text: toPlainText(html) };
}

async function sendOne(m: EmailMessage) {
  const tx = mailer();
  if (!tx) {
    console.info(`mail not configured, skipped: ${m.subject} -> ${m.to}`);
    await db.emailMessage.update({ where: { id: m.id }, data: { status: "SUPPRESSED", lastError: "mail not configured" } });
    return;
  }
  try {
    const { html, text } = await renderMessage(m);
    const info = await tx.sendMail({ from: env.mailFrom, to: m.to, cc: m.cc.length ? m.cc : undefined, replyTo: m.replyTo ?? undefined, subject: m.subject, html, text });
    await db.emailMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: info.messageId, lastError: null } });
  } catch (e) {
    const failed = m.attempts >= MAX_ATTEMPTS;
    const backoffMin = Math.min(2 ** m.attempts, 120);
    console.error(`email ${m.id} (${m.template}) failed`, e);
    await db.emailMessage.update({
      where: { id: m.id },
      data: { status: failed ? "FAILED" : "QUEUED", lastError: String(e).slice(0, 1000), nextAttemptAt: new Date(Date.now() + backoffMin * 60_000) },
    });
  }
}

let running: Promise<void> | null = null;
let again = false;
/** Send whatever is due. Safe to call often and concurrently (in-process and across containers). */
export function processOutbox(): Promise<void> {
  if (running) {
    again = true; // something was enqueued mid-run: go round once more
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await drain();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function drain() {
  // Anything stuck in SENDING for 10 minutes (crash mid-send) goes back in the queue.
  await db.$executeRaw`UPDATE "EmailMessage" SET status = 'QUEUED' WHERE status = 'SENDING' AND "nextAttemptAt" < now() - interval '10 minutes'`;
  const sentToday = await db.emailMessage.count({ where: { status: "SENT", sentAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
  const maxPriority = sentToday >= DAILY_CAP - CAP_RESERVE ? 3 : 9;
  const batch = await db.$queryRaw<EmailMessage[]>`
    UPDATE "EmailMessage" SET status = 'SENDING', attempts = attempts + 1, "nextAttemptAt" = now()
    WHERE id IN (
      SELECT id FROM "EmailMessage"
      WHERE status = 'QUEUED' AND "nextAttemptAt" <= now() AND priority <= ${maxPriority}
      ORDER BY priority, "createdAt" LIMIT 20 FOR UPDATE SKIP LOCKED)
    RETURNING *`;
  for (const m of batch) await sendOne(m);
}

/** Fire-and-forget after a commit so mail goes out now instead of on the next tick. */
export function kickOutbox() {
  processOutbox().catch((e) => console.error("outbox", e));
}
