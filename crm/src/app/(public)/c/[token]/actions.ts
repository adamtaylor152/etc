"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { clientName } from "@/server/queries";
import { logActivity } from "@/server/records";
import { claimReschedule } from "@/server/booking/slots";
import { dateOnly, fromLocalInput, prettyDate, toDbDate } from "@/server/dates";
import { limited } from "@/server/http";
import { alertAssigned } from "@/server/ops/assign-alerts";
import { getSettings } from "@/server/settings";
import { windowHint } from "@/server/windows";
import { peekToken } from "@/server/tokens";

async function visitFor(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["VISIT_CONFIRM"]);
  if (!t.ok || !t.token.visitId) redirect(`/c/${encodeURIComponent(token)}`);
  const v = await db.visit.findUniqueOrThrow({ where: { id: t.token.visitId }, include: { job: { include: { client: true } }, assignees: true } });
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

/** The client picks another open day + arrival window (Settings: "Clients can reschedule themselves"). */
export async function pickNewTime(f: FormData) {
  const { token, v } = await visitFor(f);
  const [date, key] = String(f.get("slot") ?? "").split("|");
  const on = (await getSettings(db, v.businessId)).clientReschedule;
  if (!on || v.state !== "SCHEDULED" || v.job.kind === "SNOW_PLAN" || await limited(`resched:${v.id}`, 5, 3_600_000)) redirect(`/c/${token}`);
  const w = await claimReschedule(v.businessId, v, date, key ?? "");
  if (!w) redirect(`/c/${token}?done=taken`);
  await db.$transaction(async (tx) => {
    await tx.visit.update({
      where: { id: v.id },
      data: { scheduledDate: toDbDate(date), startAt: fromLocalInput(`${date}T${w.from}`), endAt: fromLocalInput(`${date}T${w.to}`), anytime: false, confirmedAt: new Date(), rescheduleRequest: null, rescheduleRequestedAt: null, ...(v.recurrenceDate ? { detachedFromRecurrence: true } : {}) },
    });
    await logActivity(tx, { businessId: v.businessId, type: "visit.rescheduled_by_client", entityType: "Visit", entityId: v.id, actorType: "CLIENT", actorClientId: v.job.clientId, clientId: v.job.clientId, jobId: v.jobId, data: { from: dateOnly(v.scheduledDate), date, window: w.label } });
    const body = `${v.job.title}: moved from ${prettyDate(dateOnly(v.scheduledDate))} to ${prettyDate(date)}, ${w.label} (${windowHint(w)}).`;
    for (const to of env.ownerEmails) await enqueue(tx, { businessId: v.businessId, template: "owner.notice", to, priority: 2, props: { title: `${clientName(v.job.client)} moved their visit`, body, path: `/visits/${v.id}` } });
    if (!v.job.client.emailBouncedAt) await enqueue(tx, { businessId: v.businessId, template: "visit.scheduled", to: v.job.client.email, replyTo: env.helpEmail, priority: 4, props: { visitId: v.id }, dedupeKey: `visit:${v.id}:scheduled:${date}:client`, clientId: v.job.clientId, entityType: "Visit", entityId: v.id });
    await alertAssigned(tx, v.businessId, null, v.assignees.map((x) => x.userId), date); // tell the crew their day changed
  });
  kickOutbox();
  redirect(`/c/${token}?done=moved`);
}
