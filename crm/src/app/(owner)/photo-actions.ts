"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";

const back = (f: FormData) => { const p = String(f.get("back") ?? "/"); return p.startsWith("/") && !p.startsWith("//") ? p : "/"; };

export async function photoShare(f: FormData) {
  const user = await requireOwner();
  await db.attachment.updateMany({ where: { id: String(f.get("id")), businessId: user.businessId }, data: { sharedWithClient: f.get("shared") === "1" } });
  revalidatePath(back(f));
}

/** Soft delete: the file stays on disk until a cleanup job; the record disappears from every page and email. */
export async function photoDelete(f: FormData) {
  const user = await requireOwner();
  await db.attachment.updateMany({ where: { id: String(f.get("id")), businessId: user.businessId }, data: { deletedAt: new Date() } });
  revalidatePath(back(f));
}

/** Email the client a link to send photos for this request. */
export async function requestPhotos(f: FormData) {
  const user = await requireOwner();
  const r = await db.request.findFirstOrThrow({ where: { id: String(f.get("requestId")), businessId: user.businessId }, include: { client: true } });
  await enqueue(db, {
    businessId: user.businessId, template: "photo_upload.request", to: r.client.email, replyTo: env.helpEmail, priority: 3,
    props: { requestId: r.id, name: r.client.firstName, services: r.services }, clientId: r.clientId, entityType: "Request", entityId: r.id,
  });
  kickOutbox();
  redirect(`${back(f)}?sent=photos`);
}

/** Feature a before/after photo in etccrew.ca's "Our work" (the owner confirms the client said OK). */
export async function photoShowcase(f: FormData) {
  const user = await requireOwner();
  const on = f.get("on") === "1";
  await db.attachment.updateMany({
    where: { id: String(f.get("id")), businessId: user.businessId, kind: { in: ["BEFORE", "AFTER"] } },
    data: on ? { showcase: true, showcaseConsentAt: new Date() } : { showcase: false, showcaseConsentAt: null },
  });
  revalidatePath(back(f));
}
