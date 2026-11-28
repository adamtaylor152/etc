"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { HubOrderResult } from "@/components/booking-form";
import { placeBooking } from "@/server/booking/create";
import { slotText } from "@/server/booking/slots";
import { BookingError, bookingLabels, serviceLines, validate } from "@/server/booking/validate";
import { prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { limited } from "@/server/http";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { logActivity, nextNumber } from "@/server/records";
import { SIZES } from "@/server/ops/drive-size";
import { renewPlan, updatePlan } from "@/server/ops/jobs";
import { addVisitExtra, removeVisitExtra } from "@/server/ops/visits";
import { TransitionError } from "@/server/status/visit";
import { peekToken } from "@/server/tokens";
import { checkoutForCard, checkoutForInvoices, stripeEnabled } from "@/server/stripe";
import { cardsOffered, customerFor, removeCard, setAutoPay } from "@/server/ops/autopay";

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

const back = (token: string, error: string) => `/hub/${token}?error=${encodeURIComponent(error)}`;
/** Per client, not per IP: the token is who they are. */
const tooFast = (clientId: string) => limited(`hub:${clientId}`, 20);

/** Structured order from the hub's order page: the same validation and booking pipeline as the public form, for this
 *  token's client only. A picked address must be one of theirs; who they are never comes from the form. */
export async function hubOrder(token: string, raw: unknown): Promise<HubOrderResult> {
  const t = await peekToken(db, String(token), ["CLIENT_HUB"]);
  if (!t.ok || !t.token.clientId) return { ok: false, error: "This link has expired. Get a fresh one from the email we sent you." };
  const client = await db.client.findUniqueOrThrow({ where: { id: t.token.clientId } });
  if (await limited(`hub-order:${client.id}`)) return { ok: false, error: "That's a lot of orders in a few minutes. Try again in ten." };
  const parsed = z.looseObject({ propertyId: z.string().max(40).optional() }).safeParse(raw);
  if (!parsed.success || JSON.stringify(raw).length > 16_384) return { ok: false, error: "That order didn't come through right. Refresh and try again." };
  const d = parsed.data;
  const property = d.propertyId ? await db.property.findFirst({ where: { id: d.propertyId, clientId: client.id, archivedAt: null } }) : null;
  if (d.propertyId && !property) return { ok: false, error: "Pick one of your addresses." };
  let booking;
  try {
    const services = await db.service.findMany({ where: { businessId: client.businessId, active: true, bookable: true }, select: { name: true, bookingLabel: true } });
    booking = validate({
      ...d, name: `${client.firstName} ${client.lastName}`.trim().slice(0, 100), email: client.email, phone: client.phone ?? "",
      // One of their addresses: its own details, and the driveway size we already have, beat anything in the form.
      ...(property ? { address: property.formatted, access: "", lat: null, lng: null, placeId: "", postalCode: "", ...(property.driveSize ? { size: SIZES[property.driveSize].short, extraWalk: property.extraWalk } : {}) } : {}),
    }, todayLocal(), bookingLabels(services));
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." };
    throw e;
  }
  const res = await placeBooking(booking, d.slot, { businessId: client.businessId, source: "CLIENT_HUB", clientId: client.id, propertyId: property?.id, raw: d });
  if (!res) return { ok: false, error: "Sorry, that time just filled up. Please pick another.", slotTaken: true };
  // What happens next: shovelling at a fixed price is booked (it has a job); anything else gets a look and a price first.
  const next = [
    !res.jobId ? "" : booking.plan === "Every snowfall" ? "You're on the snow route: we'll clear it after every snowfall." : `Shovelling is booked${booking.date ? ` for ${prettyDate(booking.date)}` : ": we'll be there as soon as we can"}.`,
    res.jobId && booking.services.length === 1 ? "" : res.slot ? `We'll come take a look ${slotText(res.slot)} and give you a price.` : "Silas will look it over and send you a price.",
    `A confirmation is on its way to ${client.email}.`,
  ].filter(Boolean).join(" ");
  return { ok: true, id: res.number, estimate: booking.estimate, ...(res.uploadUrl ? { uploadUrl: res.uploadUrl } : {}), lines: serviceLines(booking), next };
}

/** Client turns ice melt or extra sidewalk on or off for their plan. Charged with each clearing from the next visit on. */
export async function hubPlanAddOn(f: FormData) {
  const { token, client } = await hubClient(f);
  if (await tooFast(client.id)) redirect(back(token, "Too many changes at once. Try again in a few minutes."));
  const p = z.object({ jobId: z.string().max(40), addon: z.enum(["iceMelt", "extraWalk"]), on: z.enum(["0", "1"]) }).safeParse(Object.fromEntries(f));
  if (!p.success) redirect(`/hub/${token}`);
  const on = p.data.on === "1", what = p.data.addon === "iceMelt" ? "ice melt" : "extra sidewalk";
  // updatePlan only finds this client's own open plan that isn't held for a price OK.
  const job = await updatePlan({ businessId: client.businessId, clientId: client.id }, p.data.jobId, { [p.data.addon]: on }).catch(() => null);
  if (!job) redirect(back(token, "That plan can't be changed online right now. Give us a call!"));
  await tellOwners(client.businessId, `${client.firstName} turned ${what} ${on ? "on" : "off"} on their snow plan`,
    `${clientName(client)} turned ${what} ${on ? "ON" : "OFF"} from their client page. It applies from the next visit.`, `/jobs/${job.id}`);
  redirect(`/hub/${token}?addon=${encodeURIComponent(`${what} ${on ? "on" : "off"}`)}`);
}

/** Client adds a fixed-price add-on to one of their visits that hasn't started (or takes it back). */
export async function hubVisitExtra(f: FormData) {
  const { token, client } = await hubClient(f);
  if (await tooFast(client.id)) redirect(back(token, "Too many changes at once. Try again in a few minutes."));
  const p = z.union([z.object({ visitId: z.string().max(40), serviceId: z.string().max(40) }), z.object({ removeId: z.string().max(40) })]).safeParse(Object.fromEntries(f));
  if (!p.success) redirect(`/hub/${token}`);
  let done: { title: string; body: string; visitId: string; flash: string };
  try {
    if ("removeId" in p.data) {
      const e = await removeVisitExtra(client, p.data.removeId);
      done = { title: `${client.firstName} removed an extra: ${e.name}`, body: `${clientName(client)} took "${e.name}" off an upcoming visit from their client page.`, visitId: e.visitId, flash: `${e.name} removed` };
    } else {
      const e = await addVisitExtra(client, p.data.visitId, p.data.serviceId);
      done = { title: `${client.firstName} added an extra: ${e.name}`, body: `${clientName(client)} added "${e.name}" (${money(e.cents)}) to an upcoming visit from their client page. It's billed when the visit is done.`, visitId: e.visit.id, flash: `${e.name} added` };
    }
  } catch (e) {
    if (e instanceof TransitionError) redirect(back(token, e.message));
    throw e;
  }
  await tellOwners(client.businessId, done.title, done.body, `/visits/${done.visitId}`);
  redirect(`/hub/${token}?extra=${encodeURIComponent(done.flash)}`);
}

/** "Can you also…?" from the client page: becomes a request in the CRM. */
export async function hubRequestWork(f: FormData) {
  const { token, client } = await hubClient(f);
  if (await limited(`hub-order:${client.id}`)) redirect(back(token, "That's a lot of requests in a few minutes. Try again in ten."));
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

/** Save (or replace) a card on Stripe's page. The auto-pay box is the client's opt-in for that card; unticked means off. */
export async function hubSaveCard(f: FormData) {
  const { token, client } = await hubClient(f);
  if (!(await cardsOffered(client.businessId))) redirect(`/hub/${token}`);
  let url: string | null = null;
  try {
    const s = await checkoutForCard({
      customerId: await customerFor(client), businessId: client.businessId, clientId: client.id, autoPay: f.get("autopay") === "on", source: "hub",
      successUrl: `${env.appUrl}/hub/${token}?card=saved`, cancelUrl: `${env.appUrl}/hub/${token}`,
    });
    url = s.url;
  } catch (e) {
    console.error("card setup checkout failed", e);
  }
  redirect(url ?? `/hub/${token}?error=${encodeURIComponent("We couldn't open the card page just now. Please try again later.")}`);
}

export async function hubRemoveCard(f: FormData) {
  const { token, client } = await hubClient(f);
  await removeCard(client.id, { actorType: "CLIENT", actorClientId: client.id });
  redirect(`/hub/${token}?card=removed`);
}

/** The client's own switch: "Charge this card automatically for my invoices" on, or off again at any time. */
export async function hubSetAutoPay(f: FormData) {
  const { token, client } = await hubClient(f);
  const on = f.get("on") === "1";
  await setAutoPay(client.id, on, { actorType: "CLIENT", actorClientId: client.id }).catch((e) => { if (!(e instanceof TransitionError)) throw e; });
  redirect(`/hub/${token}?autopay=${on ? "on" : "off"}`);
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
