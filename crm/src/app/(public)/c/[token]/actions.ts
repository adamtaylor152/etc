"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { clientName } from "@/server/queries";
import { logActivity } from "@/server/records";
import { peekToken } from "@/server/tokens";

async function visitFor(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["VISIT_CONFIRM"]);
  if (!t.ok || !t.token.visitId) redirect(`/c/${encodeURIComponent(token)}`);
  const v = await db.visit.findUniqueOrThrow({ where: { id: t.token.visitId }, include: { job: { include: { client: true } } } });
  return { token, v };
}

export async function confirmVisit(f: FormData) {
  const { token, v } = await visitFor(f);
  if (v.state === "SCHEDULED" && !v.confirmedAt) {
    await db.visit.update({ where: { id: v.id }, data: { confirmedAt: new Date(), rescheduleRequest: null, rescheduleRequestedAt: null } });
    await logActivity(db, { businessId: v.businessId, type: "visit.confirmed", entityType: "Visit", entityId: v.id, actorType: "CLIENT", actorClientId: v.job.clientId, clientId: v.job.clientId, jobId: v.jobId });
  }
  redirect(`/c/${token}?done=confirmed`);
}

export async function requestReschedule(f: FormData) {
  const { token, v } = await visitFor(f);
  const message = String(f.get("message") ?? "").trim().slice(0, 1000);
  if (v.state === "SCHEDULED" && message) {
    await db.visit.update({ where: { id: v.id }, data: { rescheduleRequest: message, rescheduleRequestedAt: new Date(), confirmedAt: null } });
    await logActivity(db, { businessId: v.businessId, type: "visit.reschedule_requested", entityType: "Visit", entityId: v.id, actorType: "CLIENT", actorClientId: v.job.clientId, clientId: v.job.clientId, jobId: v.jobId, data: { reason: message } });
    for (const to of env.ownerEmails) await enqueue(db, { businessId: v.businessId, template: "owner.notice", to, priority: 2, props: { title: `${clientName(v.job.client)} wants a different time`, body: message, path: `/schedule/find?visit=${v.id}` } });
    kickOutbox();
  }
  redirect(`/c/${token}?done=asked`);
}
