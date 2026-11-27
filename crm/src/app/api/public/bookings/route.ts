// Public booking endpoint for etccrew.ca/book.html (cross-origin). Same rules as the Python /api/bookings:
// 16KB cap, honeypot, 5 bookings / 10 min / IP, identical validation and estimate.
import { createBooking } from "@/server/booking/create";
import { BookingError, validate } from "@/server/booking/validate";
import { todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
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
  const res = await createBooking(booking, {
    businessId: await businessId(), source: "BOOKING_FORM", ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, raw: data,
  });
  console.info(`booking ${res.number} saved`);
  return json(req, 201, { ok: true, id: res.number, estimate: booking.estimate, ...(res.uploadUrl ? { uploadUrl: res.uploadUrl } : {}) });
}
