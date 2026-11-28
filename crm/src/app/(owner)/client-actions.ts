"use server";
// Clients, properties, notes and calls. Every action re-checks the session and scopes to the business.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { propertyData, PropertyInput, saveClient } from "@/server/clients";
import { fromLocalInput } from "@/server/dates";
import { db } from "@/server/db";
import { logCall } from "@/server/ops/calls";
import { importClients, mergeClients } from "@/server/ops/client-import";
import { addNote, deleteNote, editNote, pinNote, type NoteTarget } from "@/server/ops/notes";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
/** Same-site relative paths only (where to go back to after an action). */
const safeBack = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") ? p : fallback);
const withError = (path: string, e: unknown) => {
  if (e instanceof TransitionError || e instanceof z.ZodError) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the form" : e.message;
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  throw e;
};

/** New/edit client. The form posts its rows as JSON in "payload". */
export async function clientSave(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id") || undefined;
  const back = id ? `/clients/${id}/edit` : "/clients/new";
  let saved = "";
  try {
    saved = await saveClient(user, JSON.parse(str(f, "payload") || "{}"), id);
  } catch (e) { withError(back, e); }
  revalidatePath("/clients");
  redirect(str(f, "next") === "another" ? "/clients/new?saved=1" : `/clients/${saved}`);
}

export async function clientArchive(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id");
  await db.client.updateMany({ where: { id, businessId: user.businessId }, data: { archivedAt: str(f, "archive") === "1" ? new Date() : null } });
  revalidatePath(`/clients/${id}`);
}

/** Merge a duplicate into the client being viewed. */
export async function clientMerge(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id");
  try { await mergeClients(user, id, str(f, "dupId")); } catch (e) { withError(`/clients/${id}`, e); }
  revalidatePath("/", "layout");
  redirect(`/clients/${id}`);
}

/** CSV upload from /clients/import. */
export async function clientImport(f: FormData) {
  const user = await requireOwner();
  const file = f.get("file");
  let res = { created: 0, skipped: 0, errors: [] as string[] };
  try {
    if (!(file instanceof File) || !file.size) throw new TransitionError("Choose a CSV file");
    if (file.size > 1_000_000) throw new TransitionError("That file is over 1 MB; split it up");
    res = await importClients(user, await file.text());
  } catch (e) { withError("/clients/import", e); }
  revalidatePath("/clients");
  redirect(`/clients/import?${new URLSearchParams({ created: String(res.created), skipped: String(res.skipped), ...(res.errors.length ? { problems: res.errors.join("\n").slice(0, 1500) } : {}) })}`);
}

export async function clientTagsBulk(f: FormData) {
  const user = await requireOwner();
  const ids = f.getAll("ids").map(String);
  const tag = str(f, "tag").trim().toLowerCase().slice(0, 40);
  if (!ids.length || !tag) return;
  const clients = await db.client.findMany({ where: { id: { in: ids }, businessId: user.businessId } });
  const remove = str(f, "mode") === "remove";
  for (const c of clients) await db.client.update({ where: { id: c.id }, data: { tags: remove ? c.tags.filter((t) => t !== tag) : [...new Set([...c.tags, tag])] } });
  revalidatePath("/clients");
}

export async function propertySave(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id") || undefined;
  const clientId = str(f, "clientId");
  const back = id ? `/properties/${id}/edit` : `/clients/${clientId}/properties/new`;
  try {
    await db.client.findFirstOrThrow({ where: { id: clientId, businessId: user.businessId } });
    const num = (k: string) => (str(f, k) ? Number(str(f, k)) : null);
    const input = PropertyInput.parse({
      formatted: str(f, "formatted"), label: str(f, "label") || undefined, lat: num("lat"), lng: num("lng"), placeId: str(f, "placeId") || null,
      postalCode: str(f, "postalCode") || null, communityCode: str(f, "communityCode") || null, accessNotes: str(f, "accessNotes") || null,
      gateCode: str(f, "gateCode") || null, petNotes: str(f, "petNotes") || null, hazards: str(f, "hazards") || null,
    });
    const data = await propertyData(user.businessId, clientId, input);
    const makeDefault = f.get("isDefault") === "on";
    if (makeDefault) await db.property.updateMany({ where: { clientId }, data: { isDefault: false } });
    if (id) {
      const p = await db.property.findFirstOrThrow({ where: { id, businessId: user.businessId } });
      // Keep the map pin if the address text didn't change and no new pin came in.
      const keepPin = input.lat == null && p.formatted === input.formatted;
      await db.property.update({ where: { id }, data: { ...data, ...(keepPin ? { lat: p.lat, lng: p.lng, placeId: p.placeId, geocodeSource: p.geocodeSource, communityCode: input.communityCode || p.communityCode } : {}), ...(makeDefault ? { isDefault: true } : {}) } });
    } else {
      const first = (await db.property.count({ where: { clientId, archivedAt: null } })) === 0;
      await db.property.create({ data: { ...data, isDefault: makeDefault || first } });
    }
  } catch (e) { withError(back, e); }
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function propertyArchive(f: FormData) {
  const user = await requireOwner();
  const p = await db.property.findFirst({ where: { id: str(f, "id"), businessId: user.businessId } });
  if (!p) return;
  await db.property.update({ where: { id: p.id }, data: { archivedAt: str(f, "archive") === "1" ? new Date() : null } });
  revalidatePath(`/clients/${p.clientId}`);
}

const TARGETS = ["clientId", "requestId", "quoteId", "jobId", "visitId", "invoiceId"] as const;

export async function noteAdd(f: FormData) {
  const user = await requireOwner();
  const back = safeBack(str(f, "path"), "/");
  const target = Object.fromEntries(TARGETS.filter((k) => str(f, k)).map((k) => [k, str(f, k)])) as NoteTarget;
  const files = await Promise.all(f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0)
    .map(async (x) => ({ bytes: Buffer.from(await x.arrayBuffer()), contentType: x.type, filename: x.name })));
  try {
    await addNote(user, target, { body: str(f, "body"), pinned: f.get("pinned") === "on", linkDownstream: f.get("linkDownstream") !== "off", files });
  } catch (e) { withError(back, e); }
  revalidatePath(back.split("?")[0]);
}

export async function noteEdit(f: FormData) {
  const user = await requireOwner();
  const back = safeBack(str(f, "path"), "/");
  try { await editNote(user, str(f, "id"), str(f, "body")); } catch (e) { withError(back, e); }
  revalidatePath(back.split("?")[0]);
}

export async function noteDelete(f: FormData) {
  const user = await requireOwner();
  await deleteNote(user, str(f, "id"));
  revalidatePath(safeBack(str(f, "path"), "/").split("?")[0]);
}

export async function notePin(f: FormData) {
  const user = await requireOwner();
  await pinNote(user, str(f, "id"), str(f, "pinned") === "1");
  revalidatePath(safeBack(str(f, "path"), "/").split("?")[0]);
}

export async function callLog(f: FormData) {
  const user = await requireOwner();
  const back = safeBack(str(f, "back"), "/activity");
  try {
    const when = str(f, "startedAt");
    await logCall(user, {
      clientId: str(f, "clientId") || undefined, number: str(f, "number") || undefined, direction: str(f, "direction") === "OUT" ? "OUT" : "IN",
      status: str(f, "status"), startedAt: when ? fromLocalInput(when) ?? undefined : undefined, durationMin: str(f, "duration") ? Number(str(f, "duration")) : undefined, notes: str(f, "notes"),
    });
  } catch (e) { withError(`/calls/new?back=${encodeURIComponent(back)}${str(f, "clientId") ? `&client=${str(f, "clientId")}` : ""}`, e); }
  revalidatePath(back.split("?")[0]);
  redirect(back);
}
