// Two-way texting: owners text clients from the CRM; client replies come in through the Telnyx webhook.
import { db } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { clientName } from "../queries";
import { clip, keyword, sendSms, smsEnabled, smsFrom, toE164 } from "../sms";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };

/** Find the client a phone number belongs to. ponytail: scans clients with a phone (hundreds); index a normalized column if it grows. */
export async function clientByPhone(businessId: string, e164: string) {
  const clients = await db.client.findMany({ where: { businessId, phone: { not: null }, archivedAt: null }, orderBy: { createdAt: "asc" } });
  return clients.find((c) => toE164(c.phone) === e164) ?? null;
}

/** Owner sends a text from the CRM (to a client, or replying to an unknown number). */
export async function sendText(user: Actor, input: { clientId?: string; to?: string; body: string }) {
  if (!smsEnabled()) throw new TransitionError("Texting isn't set up yet (Telnyx key missing)");
  const body = input.body.trim();
  if (!body) throw new TransitionError("Type a message");
  const client = input.clientId ? await db.client.findFirstOrThrow({ where: { id: input.clientId, businessId: user.businessId } }) : null;
  const to = client ? toE164(client.phone) : toE164(input.to);
  if (!to) throw new TransitionError("No mobile number on file");
  if (client?.smsOptOutAt) throw new TransitionError(`${client.firstName} texted STOP. They have to text START before you can text them.`);
  const msg = await db.textMessage.create({ data: { businessId: user.businessId, clientId: client?.id, direction: "OUT", from: smsFrom(), to, body: clip(body, 1000), sentById: user.id } });
  try {
    const id = await sendSms(to, clip(body, 1000));
    await db.textMessage.update({ where: { id: msg.id }, data: { status: "sent", providerId: id || null } });
  } catch (e) {
    await db.textMessage.update({ where: { id: msg.id }, data: { status: "failed", error: String(e).slice(0, 500) } });
    throw new TransitionError("Couldn't send that text. Try again in a minute.");
  }
}

/** Inbound text from the webhook. Idempotent on the provider id (Telnyx retries webhooks). */
export async function receiveText(businessId: string, e: { id: string; from: string; to: string; text: string }) {
  if (await db.textMessage.findUnique({ where: { providerId: e.id } })) return;
  const client = await clientByPhone(businessId, e.from);
  await db.textMessage.create({ data: { businessId, clientId: client?.id, direction: "IN", from: e.from, to: e.to, body: e.text.slice(0, 2000), status: "received", providerId: e.id } });
  const k = keyword(e.text);
  if (client && k === "STOP") await db.client.update({ where: { id: client.id }, data: { smsOptOutAt: new Date(), smsOptIn: false } });
  if (client && k === "START") await db.client.update({ where: { id: client.id }, data: { smsOptOutAt: null } });
  // Tell the owners (at most one email per conversation every 15 minutes).
  const who = client ? clientName(client) : e.from;
  const slot = Math.floor(Date.now() / 900_000);
  for (const to of env.ownerEmails) {
    await enqueue(db, {
      businessId, template: "owner.notice", to, priority: 2, dedupeKey: `text:${client?.id ?? e.from}:${slot}:${to}`,
      props: { title: `New text from ${who}`, body: e.text.slice(0, 500), path: `/messages/${client ? client.id : `n${e.from.replace("+", "")}`}` },
    });
  }
  kickOutbox();
}

/** Delivery receipts. */
export async function textStatus(e: { id: string; status: string; error: string | null }) {
  await db.textMessage.updateMany({ where: { providerId: e.id }, data: { status: e.status, error: e.error } });
}
