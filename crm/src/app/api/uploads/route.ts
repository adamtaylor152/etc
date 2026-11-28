// Photo uploads (before/after on a visit, or onto a job/request/quote). multipart/form-data.
// Crew can only add to a visit on their own route; jobs, requests and quotes are owner-only.
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { MediaError, saveImage } from "@/server/media";
import { visitScope } from "@/server/runner";

const KINDS = ["BEFORE", "AFTER", "PROOF", "REQUEST_PHOTO", "OTHER"] as const;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in again" }, { status: 401 });
  const form = await req.formData();
  const kind = KINDS.find((k) => k === form.get("kind")) ?? "OTHER";
  const visitId = String(form.get("visitId") ?? "") || null;
  const jobId = String(form.get("jobId") ?? "") || null;
  const requestId = String(form.get("requestId") ?? "") || null;
  const quoteId = String(form.get("quoteId") ?? "") || null; // a quote line's photo (the quote editor)
  const num = (k: string) => { const v = Number(form.get(k)); return form.get(k) && Number.isFinite(v) ? v : null; };

  // Resolve and authorize what the photo attaches to.
  let links: { clientId?: string; propertyId?: string; jobId?: string; visitId?: string; requestId?: string; quoteId?: string } = {};
  if (visitId) {
    const v = await db.visit.findFirst({ where: { id: visitId, businessId: user.businessId, ...visitScope(user) }, include: { job: true } });
    if (!v) return Response.json({ error: "Visit not found" }, { status: 404 });
    links = { visitId, jobId: v.jobId, clientId: v.job.clientId, propertyId: v.propertyId };
  } else if (user.role !== "OWNER") {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  } else if (jobId) {
    const j = await db.job.findFirst({ where: { id: jobId, businessId: user.businessId } });
    if (!j) return Response.json({ error: "Job not found" }, { status: 404 });
    links = { jobId, clientId: j.clientId, propertyId: j.propertyId };
  } else if (requestId) {
    const r = await db.request.findFirst({ where: { id: requestId, businessId: user.businessId } });
    if (!r) return Response.json({ error: "Request not found" }, { status: 404 });
    links = { requestId, clientId: r.clientId, propertyId: r.propertyId ?? undefined };
  } else if (quoteId) {
    const q = await db.quote.findFirst({ where: { id: quoteId, businessId: user.businessId } });
    if (!q) return Response.json({ error: "Quote not found" }, { status: 404 });
    links = { quoteId, clientId: q.clientId, propertyId: q.propertyId ?? undefined };
  } else return Response.json({ error: "Nothing to attach to" }, { status: 400 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length || files.length > 20) return Response.json({ error: "Pick 1 to 20 photos" }, { status: 400 });
  const saved = [];
  try {
    for (const f of files) {
      saved.push(await saveImage(user.businessId, { bytes: Buffer.from(await f.arrayBuffer()), contentType: f.type }, {
        ...links, kind, uploadedByType: "USER", uploadedById: user.id, capturedLat: num("lat"), capturedLng: num("lng"),
        sharedWithClient: kind === "BEFORE" || kind === "AFTER", // before/after go in the client's "done" email
        caption: String(form.get("caption") ?? "").slice(0, 60) || undefined, // "checklist:<itemId>" ties a photo to a checklist item
      }));
    }
  } catch (e) {
    if (e instanceof MediaError) return Response.json({ error: e.message, saved: saved.length }, { status: 415 });
    throw e;
  }
  return Response.json({ ok: true, ids: saved.map((a) => a.id) }, { status: 201 });
}
