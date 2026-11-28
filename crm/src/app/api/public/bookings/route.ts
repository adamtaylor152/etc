// Public booking endpoint for etccrew.ca/book.html (cross-origin). Same rules as the Python /api/bookings:
// 16KB cap, honeypot, 5 bookings / 10 min / IP, identical validation and estimate.
import { fmtMin } from "@/server/availability";
import { createBooking } from "@/server/booking/create";
import { bookAssessment, claimSlot } from "@/server/booking/slots";
import { recordReferral } from "@/server/ops/marketing";
import { BookingError, validate } from "@/server/booking/validate";
import { todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { enqueueSms, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { clientIp, limited } from "@/server/http";

const MAX_BODY = 16_384;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !env.publicOrigins.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" };
}

const json = (req: Request, status: number, body: unknown) =>
  Response.json(body, { status, headers: { ...cors(req), "Cache-Control": "no-store" } });

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!raw.length || new TextEncoder().encode(raw).length > MAX_BODY) return json(req, 413, { error: "request too large" });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
  } catch {
    return json(req, 400, { error: "bad request" });
  }
  if (data.website) return json(req, 201, { ok: true }); // honeypot humans never see; pretend it worked
  if (limited(clientIp(req))) return json(req, 429, { error: `Too many bookings from here. Please call ${env.phone}.` });

  let booking;
  try {
    booking = validate(data, todayLocal());
  } catch (e) {
    if (e instanceof BookingError) return json(req, 400, { error: e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." });
    throw e;
  }
  // A picked time books the on-site assessment for quote services (snow shovelling is "anytime" and needs none).
  const bid = await businessId();
  const quoted = booking.services.some((s) => s !== "Snow shovelling");
  const slot = quoted && data.slot ? await claimSlot(bid, data.slot) : null;
  if (quoted && data.slot && !slot) return json(req, 409, { error: "Sorry, that time was just taken. Please pick another.", slotTaken: true });
  const res = await createBooking(booking, {
    businessId: bid, source: "BOOKING_FORM", when: slot ? `Assessment visit ${new Date(`${slot.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} at ${fmtMin(slot.start)}` : undefined, ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, raw: data,
  });
  if (data.smsOptIn === true && booking.phone) {
    const client = await db.client.update({ where: { id: res.clientId }, data: { smsOptIn: true } });
    await enqueueSms(db, { businessId: client.businessId, template: "sms.opt_in", client, props: {}, dedupeKey: `sms-optin:${client.id}` }); // once per client
    kickOutbox();
  }
  if (data.offers === true) await db.client.updateMany({ where: { id: res.clientId, emailMarketingConsentAt: null }, data: { emailMarketingConsentAt: new Date(), emailMarketingConsentSource: "booking form" } });
  if (typeof data.ref === "string") await recordReferral(await businessId(), res.clientId, data.ref.slice(0, 20)).catch((e) => console.error("referral", e));
  if (slot) await bookAssessment(bid, res.requestId, slot).catch((e) => console.error("assessment", e)); // booking is saved either way
  console.info(`booking ${res.number} saved`);
  return json(req, 201, { ok: true, id: res.number, estimate: booking.estimate, ...(res.uploadUrl ? { uploadUrl: res.uploadUrl } : {}) });
}
