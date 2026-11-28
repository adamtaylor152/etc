// Email outbox. Writers enqueue inside their own transaction (so a mail outage never loses a booking);
// processOutbox() claims rows with FOR UPDATE SKIP LOCKED, so two containers during a deploy can't double-send.
import { render, toPlainText } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, Prisma } from "@/generated/prisma/client";
import { db, type Db } from "../db";
import { env } from "../env";
import { unsubscribeUrl } from "../ops/campaigns";
import { clip, sendSms, smsEnabled, smsFrom, toE164 } from "../sms";
import { smsTemplates, type SmsTemplateName } from "./sms-templates";
import { templates, type PropsOf, type TemplateName } from "./templates";

const MAX_ATTEMPTS = 6;
const DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP ?? 300); // Brevo free plan
const CAP_RESERVE = 30; // keep headroom for priority <= 3 (logins, receipts, bookings)

export async function enqueue<T extends TemplateName>(tx: Db, m: {
  businessId: string; template: T; to: string; props: PropsOf<T>; cc?: string[]; replyTo?: string;
  priority?: number; dedupeKey?: string; clientId?: string; entityType?: string; entityId?: string; sendAfter?: Date;
}) {
  if (!m.to.trim()) return null; // clients added from a text thread may have no email
  const subject = m.template === "campaign.email"
    ? ((await tx.campaign.findUnique({ where: { id: (m.props as { campaignId: string }).campaignId } }))?.subject ?? "News from etc.")
    : (templates[m.template].subject as (p: PropsOf<T>) => string)(m.props);
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
  if (m.template.startsWith("sms.")) return sendText(m);
  const tx = mailer();
  if (!tx) {
    console.info(`mail not configured, skipped: ${m.subject} -> ${m.to}`);
    await db.emailMessage.update({ where: { id: m.id }, data: { status: "SUPPRESSED", lastError: "mail not configured" } });
    return;
  }
  try {
    const { html, text } = await renderMessage(m);
    // Marketing emails carry one-click unsubscribe headers (Gmail/Yahoo require them; CASL wants an easy opt-out).
    const cid = m.template === "campaign.email" ? (m.props as { clientId?: string }).clientId : null;
    const headers = cid ? { "List-Unsubscribe": `<${unsubscribeUrl(cid)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
    const info = await tx.sendMail({ from: env.mailFrom, to: m.to, cc: m.cc.length ? m.cc : undefined, replyTo: m.replyTo ?? undefined, subject: m.subject, html, text, headers });
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
  if (process.env.VITEST) return; // tests queue mail but never send it
  processOutbox().catch((e) => console.error("outbox", e));
}

// ---------- texts ----------
async function sendText(m: EmailMessage) {
  if (!smsEnabled()) {
    await db.emailMessage.update({ where: { id: m.id }, data: { status: "SUPPRESSED", lastError: "sms not configured" } });
    return;
  }
  try {
    const t = smsTemplates[m.template as SmsTemplateName];
    if (!t) throw new Error(`unknown sms template ${m.template}`);
    const client = m.clientId ? await db.client.findUnique({ where: { id: m.clientId } }) : null;
    if (client?.smsOptOutAt) {
      await db.emailMessage.update({ where: { id: m.id }, data: { status: "SUPPRESSED", lastError: "client texted STOP" } });
      return;
    }
    const body = clip(await t(m.props as never, { businessId: m.businessId }));
    const sid = await sendSms(m.to, body);
    await db.emailMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: sid, lastError: null } });
    await db.textMessage.create({ data: { businessId: m.businessId, clientId: m.clientId, direction: "OUT", from: smsFrom(), to: m.to, body, status: "sent", providerId: sid || null } });
  } catch (e) {
    const failed = m.attempts >= MAX_ATTEMPTS;
    await db.emailMessage.update({
      where: { id: m.id },
      data: { status: failed ? "FAILED" : "QUEUED", lastError: String(e).slice(0, 1000), nextAttemptAt: new Date(Date.now() + Math.min(2 ** m.attempts, 120) * 60_000) },
    });
  }
}

/** Queue a text for a client who opted in. No-op otherwise. */
export async function enqueueSms<T extends SmsTemplateName>(tx: Db, m: {
  businessId: string; template: T; client: { id: string; phone: string | null; smsOptIn: boolean; smsOptOutAt?: Date | null }; props: Parameters<(typeof smsTemplates)[T]>[0]; dedupeKey: string; entityType?: string; entityId?: string; sendAfter?: Date;
}) {
  const to = toE164(m.client.phone);
  if (!m.client.smsOptIn || m.client.smsOptOutAt || !to) return null;
  const data = {
    businessId: m.businessId, template: m.template, to, cc: [], subject: m.template, props: m.props as Prisma.InputJsonValue,
    priority: 3, dedupeKey: m.dedupeKey, clientId: m.client.id, entityType: m.entityType, entityId: m.entityId, nextAttemptAt: m.sendAfter ?? new Date(),
  };
  return tx.emailMessage.upsert({ where: { businessId_dedupeKey: { businessId: m.businessId, dedupeKey: m.dedupeKey } }, create: data, update: {} });
}
