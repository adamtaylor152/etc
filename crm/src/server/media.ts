// Photos: decode with sharp (rejects anything that isn't an image), auto-rotate, strip ALL metadata
// (EXIF GPS included), store WebP variants. Signed URLs let emails and public pages embed private photos.
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import sharp, { type Metadata, type Sharp } from "sharp";
import type { AttachmentKind, ActorType } from "@/generated/prisma/client";
import { db } from "./db";
import { getStream, put } from "./storage";

export const VARIANTS = { sm: 320, md: 1280, lg: 2000 } as const;
export type Variant = keyof typeof VARIANTS;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export class MediaError extends Error {}

type Links = { clientId?: string | null; propertyId?: string | null; requestId?: string | null; quoteId?: string | null; jobId?: string | null; visitId?: string | null; textMessageId?: string | null };

export async function saveImage(businessId: string, file: { bytes: Buffer; contentType: string }, meta: Links & {
  kind: AttachmentKind; uploadedByType: ActorType; uploadedById?: string; capturedLat?: number | null; capturedLng?: number | null;
  caption?: string; sharedWithClient?: boolean;
}) {
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new MediaError("That photo is too big (25 MB max)");
  let img: Sharp, info: Metadata;
  try {
    img = sharp(file.bytes, { failOn: "error" }).rotate(); // rotate() applies EXIF orientation, then output drops all metadata
    info = await img.metadata();
  } catch {
    throw new MediaError("That file isn't a photo we can read");
  }
  if (!info.width || !info.height || info.pages && info.pages > 1 && info.format === "gif") throw new MediaError("That file isn't a photo we can read");
  const id = randomUUID();
  const prefix = `${businessId}/${id}`;
  let w = 0, h = 0;
  for (const [name, size] of Object.entries(VARIANTS)) {
    const out = await img.clone().resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    await put(`${prefix}/${name}.webp`, out.data);
    if (name === "lg") { w = out.info.width; h = out.info.height; }
  }
  return db.attachment.create({
    data: {
      id, businessId, kind: meta.kind, mediaType: "IMAGE", storageKey: prefix, contentType: "image/webp", bytes: file.bytes.length,
      width: w, height: h, sha256: createHash("sha256").update(file.bytes).digest("hex"),
      capturedAt: new Date(), capturedLat: meta.capturedLat ?? null, capturedLng: meta.capturedLng ?? null,
      uploadedByType: meta.uploadedByType, uploadedById: meta.uploadedById, caption: meta.caption || null,
      sharedWithClient: meta.sharedWithClient ?? false,
      clientId: meta.clientId, propertyId: meta.propertyId, requestId: meta.requestId, quoteId: meta.quoteId, jobId: meta.jobId, visitId: meta.visitId,
      textMessageId: meta.textMessageId,
    },
  });
}

/** Non-photo files (video, PDF, contact cards from MMS): stored as-is, served only as a download. */
export async function saveFile(businessId: string, file: { bytes: Buffer; contentType: string; filename?: string }, meta: Links & { kind: AttachmentKind; uploadedByType: ActorType }) {
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new MediaError("That file is too big (25 MB max)");
  const id = randomUUID();
  const prefix = `${businessId}/${id}`;
  await put(`${prefix}/file`, file.bytes);
  const ct = file.contentType.split(";")[0].trim().toLowerCase() || "application/octet-stream";
  return db.attachment.create({
    data: {
      id, businessId, kind: meta.kind, mediaType: ct.startsWith("video/") ? "VIDEO" : ct === "application/pdf" ? "PDF" : "FILE",
      storageKey: prefix, contentType: ct, bytes: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex"),
      uploadedByType: meta.uploadedByType, filename: file.filename?.slice(0, 200) ?? null, clientId: meta.clientId, textMessageId: meta.textMessageId,
    },
  });
}

/** Image or file, by content type. HEIC etc. that sharp can't read falls back to a stored file. */
export async function saveAny(businessId: string, file: { bytes: Buffer; contentType: string; filename?: string }, meta: Links & { kind: AttachmentKind; uploadedByType: ActorType; uploadedById?: string }) {
  if (file.contentType.startsWith("image/")) {
    try { return await saveImage(businessId, file, meta); } catch (e) { if (!(e instanceof MediaError) || file.bytes.length > MAX_UPLOAD_BYTES) throw e; }
  }
  return saveFile(businessId, file, meta);
}

/** A JPEG copy for MMS: carriers handle JPEG everywhere (not WebP) and cap messages near 1 MB. Made once, on first send. */
export async function mmsJpeg(storageKey: string) {
  const key = `${storageKey}/mms.jpg`;
  if (await getStream(key)) return;
  const src = await getStream(`${storageKey}/lg.webp`);
  if (!src) throw new MediaError("Photo file is missing");
  const bytes = Buffer.from(await new Response(src.stream).arrayBuffer());
  await put(key, await sharp(bytes).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer());
}

// ---------- signed URLs (stateless HMAC; emails embed several images, no DB row per link) ----------
function secret() {
  const s = process.env.MEDIA_SIGNING_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("MEDIA_SIGNING_SECRET must be set (32+ random chars)");
    return "dev-only-media-secret-change-me";
  }
  return s;
}
const sign = (id: string, variant: string, exp: number) => createHmac("sha256", secret()).update(`${id}.${variant}.${exp}`).digest("base64url");

export function signedMediaPath(id: string, variant: Variant | "mms" | "file", ttlDays = 365, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlDays * 86_400;
  return `/api/media/${id}/${variant}?exp=${exp}&sig=${sign(id, variant, exp)}`;
}

export function verifyMediaSig(id: string, variant: string, exp: string | null, sig: string | null, now = Date.now()) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const want = Buffer.from(sign(id, variant, Number(exp)));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
