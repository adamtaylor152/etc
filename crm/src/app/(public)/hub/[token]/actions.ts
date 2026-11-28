"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { logActivity, nextNumber } from "@/server/records";
import { renewPlan } from "@/server/ops/jobs";
import { peekToken } from "@/server/tokens";
import { checkoutForInvoices, stripeEnabled } from "@/server/stripe";

async function hubClient(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["CLIENT_HUB"]);
  if (!t.ok || !t.token.clientId) redirect(`/hub/${encodeURIComponent(token)}`);
  const client = await db.client.findUniqueOrThrow({ where: { id: t.token.clientId } });
  return { token, client };
}

async function tellOwners(businessId: string, title: string, body: string, path: string) {
  for (const to of env.ownerEmails) await enqueue(db, { businessId, template: "owner.notice", to, priority: 3, props: { title, body, path } });
  kickOutbox();
}

/** Client pauses (away for a while) or resumes their every-snowfall plan. */
export async function hubPausePlan(f: FormData) {
  const { token, client } = await hubClient(f);
  const job = await db.job.findFirst({ where: { id: String(f.get("jobId")), clientId: client.id, kind: "SNOW_PLAN", closedAt: null } });
  if (!job) redirect(`/hub/${token}`);
  const pause = f.get("pause") === "1";
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: job.id }, data: { planPausedAt: pause ? new Date() : null } });
    await logActivity(tx, { businessId: client.businessId, type: pause ? "plan.paused" : "plan.resumed", entityType: "Job", entityId: job.id, actorType: "CLIENT", actorClientId: client.id, clientId: client.id, jobId: job.id });
  });
  await tellOwners(client.businessId, `${client.firstName} ${pause ? "paused" : "resumed"} their snow plan`, `${client.firstName} ${client.lastName} ${pause ? "paused" : "resumed"} every-snowfall service from their client page.`, `/jobs/${job.id}`);
  redirect(`/hub/${token}?plan=${pause ? "paused" : "resumed"}`);
}

/** "Can you also…?" from the client page: becomes a request in the CRM. */
export async function hubRequestWork(f: FormData) {
  const { token, client } = await hubClient(f);
  const notes = String(f.get("notes") ?? "").trim().slice(0, 2000);
  if (!notes) redirect(`/hub/${token}?error=${encodeURIComponent("Tell us what you need")}`);
  const property = await db.property.findFirst({ where: { clientId: client.id, archivedAt: null }, orderBy: { isDefault: "desc" } });
  const r = await db.$transaction(async (tx) => {
    const req = await tx.request.create({
      data: {
        businessId: client.businessId, number: await nextNumber(tx, client.businessId, "REQUEST"), clientId: client.id, propertyId: property?.id,
        source: "CLIENT_HUB", title: notes.split("\n")[0].slice(0, 80), services: ["Something else"], notes, estimateText: "Quote",
      },
    });
    await logActivity(tx, { businessId: client.businessId, type: "booking.received", entityType: "Request", entityId: req.id, actorType: "CLIENT", actorClientId: client.id, clientId: client.id });
    return req;
  });
  await tellOwners(client.businessId, `New request #${r.number} from ${client.firstName}`, notes, `/requests/${r.id}`);
  redirect(`/hub/${token}?requested=1`);
}

export async function hubRenewPlan(f: FormData) {
  const { token, client } = await hubClient(f);
  const job = await renewPlan(client.businessId, client.id, { clientId: client.id }).catch(() => null);
  if (!job) redirect(`/hub/${token}?error=${encodeURIComponent("Couldn't renew online. Give us a call!")}`);
  await tellOwners(client.businessId, `${client.firstName} renewed their snow plan`, `${client.firstName} ${client.lastName} renewed every-snowfall service from their client page.`, `/jobs/${job.id}`);
  redirect(`/hub/${token}?renewed=1`);
}

/** Client turns text updates on/off for themselves. */
export async function hubSetTexts(f: FormData) {
  const { token, client } = await hubClient(f);
  const on = f.get("on") === "1";
  await db.client.update({ where: { id: client.id }, data: { smsOptIn: on } });
  redirect(`/hub/${token}?texts=${on ? "on" : "off"}`);
}

/** "Pay all" from the hub: one card checkout covering every open invoice (oldest first, up to 10). */
export async function hubPayAll(f: FormData) {
  const { token, client } = await hubClient(f);
  if (!stripeEnabled()) redirect(`/hub/${token}`);
  const open = await db.invoice.findMany({ where: { clientId: client.id, status: "AWAITING_PAYMENT" }, orderBy: { number: "asc" } });
  const list = open.map((i) => ({ id: i.id, number: i.number, balanceCents: i.totalCents - i.amountPaidCents })).filter((i) => i.balanceCents >= 50);
  if (!list.length) redirect(`/hub/${token}`);
  let url: string | null = null;
  try {
    const s = await checkoutForInvoices({ businessId: client.businessId, clientId: client.id, email: client.email, invoices: list, successUrl: `${env.appUrl}/hub/${token}?paid=1`, cancelUrl: `${env.appUrl}/hub/${token}` });
    url = s.url;
  } catch (e) {
    console.error("pay-all checkout failed", e);
  }
  redirect(url ?? `/hub/${token}?error=${encodeURIComponent("Card payments are having trouble. Try again, or pay by e-Transfer.")}`);
}
