// Hard bounces: flag the client so reminders and campaigns stop mailing a dead address (Client.emailBouncedAt).
// Two sources: the mail server refusing the recipient when we send, and a bounce report (DSN) arriving later.
import { db } from "../db";

/** The SMTP server permanently refused the recipient (5xx on RCPT, e.g. "550 no such user"). Pure, unit-tested. */
export function permanentRejection(e: unknown) {
  const err = e as { responseCode?: number; code?: string; command?: string; rejected?: unknown[] } | null;
  if (!err || typeof err.responseCode !== "number" || err.responseCode < 550 || err.responseCode > 554) return false;
  return err.code === "EENVELOPE" || err.command === "RCPT TO" || (Array.isArray(err.rejected) && err.rejected.length > 0);
}

/**
 * Reads a raw bounce report. Returns the failed address and every message id it mentions, or null unless it reports
 * a permanent (5.x.x) failure. Pure, unit-tested.
 */
export function parseBounce(raw: string) {
  const recipient = /^(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s<>]+@[^\s<>]+)>?/im.exec(raw)?.[1]?.toLowerCase();
  const status = /^Status:\s*(\d\.\d+\.\d+)/im.exec(raw)?.[1];
  if (!recipient || !status?.startsWith("5.")) return null;
  return { recipient, status, messageIds: [...new Set([...raw.matchAll(/<[^<>\s@]+@[^<>\s]+>/g)].map((m) => m[0]))] };
}

export async function markBounced(businessId: string, email: string) {
  return (await db.client.updateMany({ where: { businessId, email: { equals: email, mode: "insensitive" }, emailBouncedAt: null }, data: { emailBouncedAt: new Date() } })).count;
}

/**
 * A bounce report from the inbound mail worker. Anyone can send us email, so it only counts if it quotes the
 * message id of something we really sent to that address (ids are random and never shown to anyone else).
 */
export async function handleBounce(raw: string) {
  const b = parseBounce(raw);
  if (!b || !b.messageIds.length) return { bounce: false as const };
  const sent = await db.emailMessage.findFirst({ where: { providerMessageId: { in: b.messageIds }, to: { equals: b.recipient, mode: "insensitive" } } });
  if (!sent) return { bounce: false as const };
  await db.emailMessage.update({ where: { id: sent.id }, data: { status: "FAILED", lastError: `bounced: ${b.status}` } });
  return { bounce: true as const, flagged: await markBounced(sent.businessId, b.recipient) };
}
