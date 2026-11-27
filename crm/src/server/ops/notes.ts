// Internal notes on any record, with photos/files, pinning, editing, and downstream linking
// (a client note also shows on that client's requests, quotes, jobs and invoices).
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { MediaError, saveAny } from "../media";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };
export type NoteTarget = { clientId?: string; requestId?: string; quoteId?: string; jobId?: string; visitId?: string; invoiceId?: string };
const KEYS = ["clientId", "requestId", "quoteId", "jobId", "visitId", "invoiceId"] as const;

/** Resolve a target to its record + client, checking it belongs to this business. */
async function resolve(businessId: string, t: NoteTarget) {
  const key = KEYS.find((k) => t[k]);
  if (!key) throw new TransitionError("Nothing to attach the note to");
  const id = t[key]!;
  const find = { where: { id, businessId }, select: { clientId: true } } as const;
  const rec = key === "clientId" ? await db.client.findFirst({ where: { id, businessId }, select: { id: true } }).then((c) => c && { clientId: c.id })
    : key === "requestId" ? await db.request.findFirst(find)
    : key === "quoteId" ? await db.quote.findFirst(find)
    : key === "jobId" ? await db.job.findFirst(find)
    : key === "invoiceId" ? await db.invoice.findFirst(find)
    : await db.visit.findFirst({ where: { id, businessId }, select: { jobId: true, job: { select: { clientId: true } } } }).then((v) => v && { clientId: v.job.clientId, jobId: v.jobId });
  if (!rec) throw new TransitionError("That record no longer exists");
  return { key, id, clientId: rec.clientId, jobId: "jobId" in rec ? (rec.jobId as string) : undefined };
}

export async function addNote(user: Actor, t: NoteTarget, input: { body: string; pinned?: boolean; linkDownstream?: boolean; files?: { bytes: Buffer; contentType: string; filename?: string }[] }) {
  const body = input.body.trim().slice(0, 5000);
  const files = input.files ?? [];
  if (!body && !files.length) throw new TransitionError("Write a note or add a file");
  const r = await resolve(user.businessId, t);
  const note = await db.note.create({
    data: {
      businessId: user.businessId, authorId: user.id, body, pinned: !!input.pinned && r.key === "clientId",
      linkDownstream: r.key === "clientId" ? input.linkDownstream ?? true : false,
      clientId: r.clientId, [r.key]: r.id, ...(r.jobId && r.key === "visitId" ? { jobId: r.jobId } : {}),
    },
  });
  for (const f of files.slice(0, 10)) {
    try {
      await saveAny(user.businessId, f, { kind: "DOCUMENT", uploadedByType: "USER", uploadedById: user.id, clientId: r.clientId, noteId: note.id });
    } catch (e) {
      if (!(e instanceof MediaError)) throw e;
      throw new TransitionError(`Note saved, but a file didn't upload: ${e.message}`);
    }
  }
  return note;
}

export async function editNote(user: Actor, id: string, body: string) {
  const n = await db.note.findFirst({ where: { id, businessId: user.businessId } });
  if (!n) throw new TransitionError("That note is gone");
  if (!body.trim()) throw new TransitionError("A note can't be empty (delete it instead)");
  await db.note.update({ where: { id }, data: { body: body.trim().slice(0, 5000), editedAt: new Date() } });
  return n;
}

export async function deleteNote(user: Actor, id: string) {
  const n = await db.note.findFirst({ where: { id, businessId: user.businessId } });
  if (!n) return null;
  await db.$transaction([
    db.attachment.updateMany({ where: { noteId: id }, data: { deletedAt: new Date() } }),
    db.note.delete({ where: { id } }),
  ]);
  return n;
}

export async function pinNote(user: Actor, id: string, pinned: boolean) {
  const n = await db.note.findFirst({ where: { id, businessId: user.businessId } });
  if (!n) throw new TransitionError("That note is gone");
  await db.note.update({ where: { id }, data: { pinned } });
  return n;
}

/** Notes shown on a record: its own, plus the client's downstream-linked notes (Jobber behaviour). Pinned first. */
export function notesFor(businessId: string, t: NoteTarget & { clientIdForDownstream?: string }) {
  const key = KEYS.find((k) => t[k])!;
  const own: Prisma.NoteWhereInput = { [key]: t[key] };
  const downstream: Prisma.NoteWhereInput[] = key !== "clientId" && key !== "invoiceId" && t.clientIdForDownstream
    ? [{ clientId: t.clientIdForDownstream, linkDownstream: true, requestId: null, quoteId: null, jobId: null, visitId: null, invoiceId: null }] : [];
  return db.note.findMany({
    where: { businessId, OR: [own, ...downstream] },
    include: { attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 100,
  });
}
