// Two-way texting: owners text clients from the CRM; client replies come in through the Telnyx webhook.
import { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { clientName } from "../queries";
import { MAX_UPLOAD_BYTES, mmsJpeg, saveAny, saveImage, signedMediaPath } from "../media";
import { clip, keyword, sendSms, smsEnabled, smsFrom, toE164 } from "../sms";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };

/** Find the client a phone number belongs to. ponytail: scans clients with a phone (hundreds); index a normalized column if it grows. */
export async function clientByPhone(businessId: string, e164: string) {
  const clients = await db.client.findMany({ where: { businessId, phone: { not: null }, archivedAt: null }, orderBy: { createdAt: "asc" } });
  return clients.find((c) => toE164(c.phone) === e164) ?? null;
}

export const MAX_MMS_FILES = 5;

/** Owner sends a text (optionally with photos -> MMS) to a client, or replies to an unknown number. */
export async function sendText(user: Actor, input: { clientId?: string; to?: string; body: string; photos?: { bytes: Buffer; contentType: string }[] }) {
  if (!smsEnabled()) throw new TransitionError("Texting isn't set up yet (Telnyx key missing)");
  const body = input.body.trim();
  const photos = input.photos ?? [];
  if (!body && !photos.length) throw new TransitionError("Type a message or add a photo");
  if (photos.length > MAX_MMS_FILES) throw new TransitionError(`Up to ${MAX_MMS_FILES} photos per text`);
  const client = input.clientId ? await db.client.findFirstOrThrow({ where: { id: input.clientId, businessId: user.businessId } }) : null;
  const to = client ? toE164(client.phone) : toE164(input.to);
  if (!to) throw new TransitionError("No mobile number on file");
  if (client?.smsOptOutAt) throw new TransitionError(`${client.firstName} texted STOP. They have to text START before you can text them.`);
  const msg = await db.textMessage.create({
    data: { businessId: user.businessId, clientId: client?.id, direction: "OUT", from: smsFrom(), to, body: clip(body, 1000), sentById: user.id, type: photos.length ? "MMS" : "SMS" },
  });
  const urls: string[] = [];
  for (const p of photos) {
    const a = await saveImage(user.businessId, p, { kind: "TEXT_PHOTO", uploadedByType: "USER", uploadedById: user.id, clientId: client?.id, textMessageId: msg.id, sharedWithClient: true });
    await mmsJpeg(a.storageKey);
    urls.push(env.appUrl + signedMediaPath(a.id, "mms", 30));
  }
  try {
    const id = await sendSms(to, clip(body, 1000), urls);
    await db.textMessage.update({ where: { id: msg.id }, data: { status: "sent", providerId: id || null } });
  } catch (e) {
    await db.textMessage.update({ where: { id: msg.id }, data: { status: "failed", error: String(e).slice(0, 500) } });
    throw new TransitionError("Couldn't send that text. Try again in a minute.");
  }
  return msg.id;
}

type PendingMedia = { url: string; contentType: string; attempts?: number }[];

/** Inbound text from the webhook. Idempotent on the provider id (Telnyx retries webhooks). MMS files download in the background. */
export async function receiveText(businessId: string, e: { id: string; from: string; to: string; text: string; type?: string; media?: { url: string; contentType: string }[] }) {
  if (await db.textMessage.findUnique({ where: { providerId: e.id } })) return;
  const client = await clientByPhone(businessId, e.from);
  const media = (e.media ?? []).slice(0, 10);
  const msg = await db.textMessage.create({
    data: {
      businessId, clientId: client?.id, direction: "IN", from: e.from, to: e.to, body: e.text.slice(0, 2000), status: "received", providerId: e.id,
      type: e.type ?? (media.length ? "MMS" : "SMS"), mediaPending: media.length ? (media as Prisma.InputJsonValue) : undefined,
    },
  });
  if (media.length) void fetchTextMedia(msg.id).catch((err) => console.error("mms fetch failed", err)); // the tick retries
  const k = keyword(e.text);
  if (client && k === "STOP") await db.client.update({ where: { id: client.id }, data: { smsOptOutAt: new Date(), smsOptIn: false } });
  if (client && k === "START") await db.client.update({ where: { id: client.id }, data: { smsOptOutAt: null } });
  // Tell the owners (at most one email per conversation every 15 minutes).
  const who = client ? clientName(client) : e.from;
  const slot = Math.floor(Date.now() / 900_000);
  const preview = e.text.trim() || (media.length ? `📷 ${media.length} photo${media.length === 1 ? "" : "s"}` : "");
  for (const to of env.ownerEmails) {
    await enqueue(db, {
      businessId, template: "owner.notice", to, priority: 2, dedupeKey: `text:${client?.id ?? e.from}:${slot}:${to}`,
      props: { title: `New text from ${who}`, body: preview.slice(0, 500), path: `/messages/${client ? client.id : `n${e.from.replace("+", "")}`}` },
    });
  }
  kickOutbox();
}

/**
 * Download an inbound MMS's files (Telnyx keeps them ~30 days). Claims the work atomically, so the webhook's
 * background call and the tick never both save the same files; anything that fails goes back for a retry.
 */
export async function fetchTextMedia(messageId: string) {
  // RETURNING shows the row after the update, so read the old list from a locked subselect.
  const [row] = await db.$queryRaw<{ mediaPending: PendingMedia; businessId: string; clientId: string | null }[]>`
    UPDATE "TextMessage" t SET "mediaPending" = NULL
    FROM (SELECT id, "mediaPending" FROM "TextMessage" WHERE id = ${messageId} AND "mediaPending" IS NOT NULL FOR UPDATE) old
    WHERE t.id = old.id
    RETURNING old."mediaPending" AS "mediaPending", t."businessId", t."clientId"`;
  if (!row) return;
  const pending = row.mediaPending;
  const failed: PendingMedia = [];
  for (const m of pending) {
    try {
      const res = await fetch(m.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new Error("too big");
      const bytes = Buffer.from(await res.arrayBuffer());
      const contentType = m.contentType || res.headers.get("content-type") || "application/octet-stream";
      const filename = decodeURIComponent(new URL(m.url).pathname.split("/").pop() ?? "").slice(0, 120) || undefined;
      await saveAny(row.businessId, { bytes, contentType, filename }, { kind: "TEXT_PHOTO", uploadedByType: "CLIENT", clientId: row.clientId, textMessageId: messageId });
    } catch (err) {
      if ((m.attempts ?? 0) < 4) failed.push({ ...m, attempts: (m.attempts ?? 0) + 1 });
      else await db.textMessage.update({ where: { id: messageId }, data: { error: `Couldn't download an attachment: ${String(err).slice(0, 200)}` } });
    }
  }
  if (failed.length) await db.textMessage.update({ where: { id: messageId }, data: { mediaPending: failed as Prisma.InputJsonValue } });
}

/** Tick: retry MMS downloads that didn't finish (container restart, Telnyx hiccup). */
export async function retryTextMedia() {
  const rows = await db.textMessage.findMany({ where: { mediaPending: { not: Prisma.DbNull }, createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true }, take: 20 });
  for (const r of rows) await fetchTextMedia(r.id).catch((e) => console.error("mms retry failed", e));
}

/** Texts (and their photos) from a number nobody was linked to now belong to this client. */
export async function adoptTexts(businessId: string, clientId: string, phone: string | null | undefined) {
  const n = toE164(phone);
  if (!n) return 0;
  const where = { businessId, clientId: null, OR: [{ from: n }, { to: n }] };
  const ids = (await db.textMessage.findMany({ where, select: { id: true } })).map((t) => t.id);
  if (!ids.length) return 0;
  await db.$transaction([
    db.textMessage.updateMany({ where: { id: { in: ids } }, data: { clientId } }),
    db.attachment.updateMany({ where: { textMessageId: { in: ids }, clientId: null }, data: { clientId } }),
  ]);
  return ids.length;
}

/** Link an unknown number's conversation to a client, saving the number on the client if they have none. */
export async function linkThread(user: Actor, number: string, clientId: string) {
  const n = toE164(number);
  if (!n) throw new TransitionError("That isn't a phone number");
  const client = await db.client.findFirstOrThrow({ where: { id: clientId, businessId: user.businessId } });
  if (!toE164(client.phone)) await db.client.update({ where: { id: client.id }, data: { phone: n } });
  await adoptTexts(user.businessId, client.id, n);
  return client.id;
}

/** New client straight from a text thread (people who text first often never filled in the booking form). */
export async function clientFromThread(user: Actor, number: string, input: { firstName: string; lastName?: string; email?: string }) {
  const n = toE164(number);
  if (!n) throw new TransitionError("That isn't a phone number");
  if (!input.firstName.trim()) throw new TransitionError("Add a first name");
  const client = await db.client.create({
    data: {
      businessId: user.businessId, firstName: input.firstName.trim().slice(0, 80), lastName: (input.lastName ?? "").trim().slice(0, 80),
      email: (input.email ?? "").trim().toLowerCase().slice(0, 200), phone: n, source: "PHONE", smsOptIn: true,
    },
  });
  await adoptTexts(user.businessId, client.id, n);
  return client.id;
}

/**
 * Put a text's photos on a job and/or quote (they then show in that job's or quote's photo gallery).
 * target: "job:<id>", "quote:<id>", "unjob" or "unquote". Only photos of this client's own job/quote.
 */
export async function linkTextPhotos(user: Actor, input: { messageId: string; attachmentIds?: string[]; target: string }) {
  const msg = await db.textMessage.findFirstOrThrow({ where: { id: input.messageId, businessId: user.businessId }, include: { media: true } });
  const ids = msg.media.filter((a) => !input.attachmentIds?.length || input.attachmentIds.includes(a.id)).map((a) => a.id);
  if (!ids.length) throw new TransitionError("No photos on that text");
  const [kind, id] = input.target.split(":");
  let data: Prisma.AttachmentUncheckedUpdateManyInput;
  if (kind === "unjob") data = { jobId: null };
  else if (kind === "unquote") data = { quoteId: null };
  else if (kind === "job") {
    const job = await db.job.findFirst({ where: { id, businessId: user.businessId } });
    if (!job || (msg.clientId && job.clientId !== msg.clientId)) throw new TransitionError("That job isn't this client's");
    data = { jobId: job.id, clientId: job.clientId, propertyId: job.propertyId };
  } else if (kind === "quote") {
    const quote = await db.quote.findFirst({ where: { id, businessId: user.businessId } });
    if (!quote || (msg.clientId && quote.clientId !== msg.clientId)) throw new TransitionError("That quote isn't this client's");
    data = { quoteId: quote.id, clientId: quote.clientId };
  } else throw new TransitionError("Pick a job or quote");
  await db.attachment.updateMany({ where: { id: { in: ids }, businessId: user.businessId }, data });
}

/** Delivery receipts. */
export async function textStatus(e: { id: string; status: string; error: string | null }) {
  await db.textMessage.updateMany({ where: { providerId: e.id }, data: { status: e.status, error: e.error } });
}
