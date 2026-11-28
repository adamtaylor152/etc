// Customer photo uploads for a quote (from the /u/[token] page, or right after booking on either booking form).
// Token-scoped to one request; no login. A multipart POST needs no CORS preflight, just the allow-origin header.
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { clientIp, limited, PUBLIC_HEADERS } from "@/server/http";
import { MediaError, saveImage } from "@/server/media";
import { peekToken } from "@/server/tokens";

const PER_BATCH = 10, PER_TOKEN = 30;

export async function POST(req: Request, ctx: RouteContext<"/api/public/uploads/[token]">) {
  const { token } = await ctx.params;
  const origin = req.headers.get("origin");
  const site = !!origin && env.publicOrigins.includes(origin); // etccrew.ca's book.html
  const json = (status: number, body: unknown) =>
    Response.json(body, { status, headers: { ...PUBLIC_HEADERS, ...(site ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } });
  if (origin && origin !== env.appUrl && !site) return json(403, { error: "Bad origin" });
  if (await limited(`upload:${clientIp(req)}`, 60, 3_600_000)) return json(429, { error: "Too many uploads, try again later" });
  const t = await peekToken(db, token, ["PHOTO_UPLOAD"]);
  if (!t.ok || !t.token.requestId) return json(410, { error: "This link has expired. Reply to our email and we'll send a new one." });
  const request = await db.request.findUniqueOrThrow({ where: { id: t.token.requestId } });

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const already = await db.attachment.count({ where: { requestId: request.id, uploadedByType: "CLIENT", deletedAt: null } });
  if (!files.length || files.length > PER_BATCH) return json(400, { error: `Send 1 to ${PER_BATCH} photos at a time` });
  if (already + files.length > PER_TOKEN) return json(400, { error: `That's plenty, thanks! (${PER_TOKEN} photos max)` });
  const caption = String(form.get("caption") ?? "").slice(0, 120);

  let saved = 0;
  try {
    for (const f of files) {
      await saveImage(request.businessId, { bytes: Buffer.from(await f.arrayBuffer()), contentType: f.type }, {
        kind: "REQUEST_PHOTO", uploadedByType: "CLIENT", clientId: request.clientId, propertyId: request.propertyId, requestId: request.id, caption,
      });
      saved++;
    }
  } catch (e) {
    if (!(e instanceof MediaError)) throw e;
    if (!saved) return json(415, { error: e.message });
  }
  // One "photos arrived" email per request per hour, however many batches they send.
  const hour = new Date().toISOString().slice(0, 13);
  for (const to of env.ownerEmails) {
    await enqueue(db, {
      businessId: request.businessId, template: "owner.photos_uploaded", to, priority: 4, dedupeKey: `request:${request.id}:photos:${hour}:${to}`,
      props: { requestId: request.id, number: request.number }, entityType: "Request", entityId: request.id, clientId: request.clientId,
    });
  }
  kickOutbox();
  return json(201, { ok: true, saved });
}
