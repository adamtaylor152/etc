// Booking -> CRM records, in one transaction. Emails are enqueued in the same transaction and sent after
// commit, keeping the Python site's rule: a mail outage never loses a booking.
import type { ClientSource, PaymentMethod, Prisma } from "@/generated/prisma/client";
import { communityFor } from "../communities";
import { todayLocal, toDbDate } from "../dates";
import { db, type Tx } from "../db";
import { env } from "../env";
import { enqueue, kickOutbox } from "../email/outbox";
import { logActivity, nextNumber } from "../records";
import { mintToken } from "../tokens";
import { serviceLines, whenText, type Booking } from "./validate";

export type BookingMeta = {
  businessId: string; source: ClientSource; ip?: string; userAgent?: string; raw?: unknown;
  legacyBookingId?: number; createdAt?: Date; sendEmails?: boolean; number?: number; when?: string;
};

const PAYMENT: Record<string, PaymentMethod> = { Cash: "CASH", "e-Transfer": "ETRANSFER" };
export const normalizeAddress = (s: string) => s.toLowerCase().replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean).join(" ");

async function price(tx: Tx, businessId: string, key: string, fallback: number) {
  const s = await tx.service.findUnique({ where: { businessId_key: { businessId, key } } });
  return s?.unitPriceCents ?? fallback;
}

/** The season covering a date; creates "Winter YYYY–YY" (Oct 1 – Apr 30) if none exists yet. */
export async function seasonFor(tx: Tx, businessId: string, day: string) {
  const d = toDbDate(day);
  const found = await tx.season.findFirst({ where: { businessId, startsOn: { lte: d }, endsOn: { gte: d } } });
  if (found) return found;
  const y = Number(day.slice(0, 4));
  const startY = Number(day.slice(5, 7)) >= 7 ? y : y - 1;
  return tx.season.create({
    data: { businessId, name: `Winter ${startY}–${String(startY + 1).slice(2)}`, startsOn: toDbDate(`${startY}-10-01`), endsOn: toDbDate(`${startY + 1}-04-30`) },
  });
}

export async function createBooking(b: Booking, meta: BookingMeta) {
  const { businessId } = meta;
  const community = await communityFor(b.lat, b.lng);
  const today = todayLocal(meta.createdAt);

  const result = await db.$transaction(async (tx) => {
    // 1. Client: match on email. Never overwrite an existing name from a public form.
    const email = b.email.toLowerCase();
    let client = await tx.client.findFirst({ where: { businessId, email }, orderBy: { createdAt: "asc" } });
    const [first, ...rest] = b.name.split(" ");
    if (!client) {
      client = await tx.client.create({
        data: {
          businessId, firstName: first, lastName: rest.join(" "), email, phone: b.phone || null,
          preferredPayment: PAYMENT[b.payment], source: meta.source, tags: meta.source === "IMPORT" ? ["imported"] : [],
          createdAt: meta.createdAt,
        },
      });
    } else if (!client.phone && b.phone) {
      client = await tx.client.update({ where: { id: client.id }, data: { phone: b.phone } });
    }

    // 2. Property: this client's address, matched by placeId or normalized text.
    const normalized = normalizeAddress(b.address);
    let property = await tx.property.findFirst({
      where: { businessId, clientId: client.id, OR: [{ normalized }, ...(b.placeId ? [{ placeId: b.placeId }] : [])] },
    });
    if (!property) {
      const isFirst = (await tx.property.count({ where: { clientId: client.id } })) === 0;
      property = await tx.property.create({
        data: {
          businessId, clientId: client.id, formatted: b.address, normalized, placeId: b.placeId || null,
          postalCode: b.postalCode || null, lat: b.lat, lng: b.lng, geocodeSource: b.lat != null ? "PLACES_AUTOCOMPLETE" : "NONE",
          communityCode: community, accessNotes: b.access || null, isDefault: isFirst,
        },
      });
    } else if (b.access && b.access !== property.accessNotes) {
      property = await tx.property.update({ where: { id: property.id }, data: { accessNotes: b.access } });
    }

    // 3. Request: always, with the raw payload and the exact estimate string the customer saw.
    const number = meta.number ?? (await nextNumber(tx, businessId, "REQUEST"));
    const shovel = b.services.includes("Snow shovelling");
    const quoted = b.services.filter((s) => s !== "Snow shovelling");
    const request = await tx.request.create({
      data: {
        businessId, number, clientId: client.id, propertyId: property.id, source: meta.source,
        title: b.services.join(", "), services: b.services,
        snowPlan: !shovel ? null : b.plan === "Every snowfall" ? "EVERY_SNOWFALL" : "ONE_TIME",
        iceMelt: b.icemelt, preferredDate: b.date ? toDbDate(b.date) : null, preferredPayment: PAYMENT[b.payment],
        notes: b.notes || null, accessNotes: b.access || null, estimateText: b.estimate,
        rawPayload: (meta.raw ?? null) as Prisma.InputJsonValue, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300),
        legacyBookingId: meta.legacyBookingId, createdAt: meta.createdAt,
      },
    });

    // 4. Shovelling has a fixed price, so it becomes a job straight away. Everything else waits for a quote.
    let jobId: string | null = null;
    if (shovel) {
      const iceMelt = await price(tx, businessId, "ice_melt", 500);
      if (b.plan === "Every snowfall") {
        const season = await seasonFor(tx, businessId, b.date || today);
        const push = await price(tx, businessId, "snow_plan_push", 3000);
        const open = await tx.job.findFirst({ where: { businessId, propertyId: property.id, seasonId: season.id, kind: "SNOW_PLAN", closedAt: null } });
        const job = open ?? await tx.job.create({
          data: {
            businessId, number: await nextNumber(tx, businessId, "JOB"), clientId: client.id, propertyId: property.id,
            requestId: request.id, seasonId: season.id, kind: "SNOW_PLAN", title: "Every snowfall",
            instructions: b.access || null, billingType: "PER_VISIT", invoiceSchedule: "PER_SNOW_EVENT",
            snowBillingMode: "PER_PUSH", triggerCm: season.defaultTriggerCm,
            pricePerPushCents: push, iceMelt: b.icemelt,
            lineItems: { create: [
              { name: "Snow shovelling, every snowfall (per push)", unitPriceCents: push, totalCents: push, perVisit: true },
              ...(b.icemelt ? [{ name: "Ice melt", unitPriceCents: iceMelt, totalCents: iceMelt, perVisit: true, sortOrder: 1 }] : []),
            ] },
          },
        });
        jobId = job.id;
      } else {
        const base = await price(tx, businessId, "snow_once", 3500);
        const job = await tx.job.create({
          data: {
            businessId, number: await nextNumber(tx, businessId, "JOB"), clientId: client.id, propertyId: property.id,
            requestId: request.id, kind: "ONE_OFF", title: "Snow shovelling", instructions: b.access || null,
            billingType: "PER_VISIT", invoiceSchedule: "AFTER_EACH_VISIT",
            lineItems: { create: [
              { name: "Snow shovelling (one-time)", unitPriceCents: base, totalCents: base },
              ...(b.icemelt ? [{ name: "Ice melt", unitPriceCents: iceMelt, totalCents: iceMelt, sortOrder: 1 }] : []),
            ] },
            visits: { create: [{
              businessId, propertyId: property.id, scheduledDate: b.date ? toDbDate(b.date) : null, anytime: true,
              source: "BOOKING", routeSort: property.routeSort, iceMeltApplied: b.icemelt || null,
            }] },
          },
        });
        jobId = job.id;
      }
      if (!quoted.length) await tx.request.update({ where: { id: request.id }, data: { status: "CONVERTED", convertedAt: meta.createdAt ?? new Date() } });
    }

    await logActivity(tx, {
      businessId, type: meta.source === "IMPORT" ? "booking.imported" : "booking.received", entityType: "Request", entityId: request.id,
      clientId: client.id, jobId: jobId ?? undefined, data: { estimate: b.estimate, services: b.services },
    });

    // 5. Emails (not for imports).
    if (meta.sendEmails !== false) {
      const props = {
        number, name: b.name, email: b.email, phone: b.phone, address: b.address, access: b.access, notes: b.notes,
        plan: b.plan, payment: b.payment, services: b.services, serviceLines: serviceLines(b), when: meta.when ?? whenText(b),
        estimate: b.estimate, site: env.siteUrl, phone_: env.phone, helpEmail: env.helpEmail, etransferEmail: env.etransferEmail,
      };
      const badge = shovel ? (b.plan === "Every snowfall" ? "Every snowfall" : "One-time") : "Quote job";
      const owners = env.ownerEmails;
      const cc = env.ownerCc.filter((e) => !owners.includes(e.toLowerCase()));
      for (const to of [...owners, ...cc]) {
        await enqueue(tx, {
          businessId, template: "owner.new_booking", to, replyTo: b.email, priority: 2, props: { requestId: request.id, badge, booking: props },
          dedupeKey: `request:${request.id}:owner:${to}`, clientId: client.id, entityType: "Request", entityId: request.id,
        });
      }
      await enqueue(tx, {
        businessId, template: "booking.confirmation", to: b.email, replyTo: env.helpEmail, priority: 2,
        props: { ...props, requestId: request.id, wantsPhotos: quoted.length > 0 },
        dedupeKey: `request:${request.id}:confirmation`, clientId: client.id, entityType: "Request", entityId: request.id,
      });
    }
    // A link for the "send us photos" step on book.html's done screen.
    const uploadToken = quoted.length && meta.sendEmails !== false ? await mintToken(tx, businessId, "PHOTO_UPLOAD", { requestId: request.id }) : null;
    return { requestId: request.id, number, clientId: client.id, jobId, uploadUrl: uploadToken ? `${env.appUrl}/u/${uploadToken}` : null };
  });

  if (meta.sendEmails !== false) kickOutbox();
  return result;
}
