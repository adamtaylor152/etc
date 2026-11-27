// Exact port of validate() / estimate() / service_lines() from the Python site's server.py.
// tests/unit/booking.test.ts pins the same cases as tests/test_server.py.
export const SERVICES = [
  "Snow shovelling", "Commercial snow removal", "Roof snow removal",
  "Bin cleaning", "Window cleaning", "Leaf & yard clutter removal", "Trash & junk removal",
  "Driveway / concrete washing", "Deck & fence cleaning", "House & siding wash",
  "Rust stain removal", "Building washing", "Fence repair", "Something else",
] as const;
export const PLANS = ["One-time visit", "Every snowfall"] as const;
export const PAYMENTS = ["Cash", "e-Transfer"] as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CTRL = /[\x00-\x09\x0b-\x1f\x7f]/g; // everything but \n

export type Booking = {
  name: string; email: string; phone: string; address: string; access: string; notes: string;
  plan: string; payment: string; date: string; services: string[]; icemelt: boolean; estimate: string;
  // optional geo from Places autocomplete (new; ignored if absent or outside Calgary)
  lat: number | null; lng: number | null; placeId: string; postalCode: string;
};

export class BookingError extends Error {}

function text(d: Record<string, unknown>, key: string, limit: number, required = false, multiline = false) {
  let v = d[key] ?? "";
  if (typeof v !== "string") throw new BookingError(`${key} must be text`);
  v = v.replace(CTRL, "").trim();
  if (!multiline) v = (v as string).split(/\s+/).filter(Boolean).join(" ");
  if (required && !v) throw new BookingError(`${key} is required`);
  if ((v as string).length > limit) throw new BookingError(`${key} is too long`);
  return v as string;
}

// Calgary-ish bounding box: reject geo that's obviously wrong rather than trusting the client.
const inCalgary = (lat: number, lng: number) => lat > 50.7 && lat < 51.4 && lng > -114.5 && lng < -113.7;

/** todayLocal = Calgary's YYYY-MM-DD. Python allowed 1 day of slack for timezones; we keep it. */
export function validate(d: Record<string, unknown>, todayLocal: string): Booking {
  const b = {
    name: text(d, "name", 100, true),
    email: text(d, "email", 200, true),
    phone: text(d, "phone", 40),
    address: text(d, "address", 300, true),
    access: text(d, "access", 300),
    notes: text(d, "notes", 2000, false, true),
    plan: text(d, "plan", 40),
    payment: text(d, "payment", 20, true),
    date: text(d, "date", 10),
    placeId: text(d, "placeId", 300),
    postalCode: text(d, "postalCode", 10),
  };
  if (!EMAIL_RE.test(b.email)) throw new BookingError("email doesn't look right");
  const services = d.services;
  if (!Array.isArray(services) || !services.length || !services.every((s) => (SERVICES as readonly unknown[]).includes(s)))
    throw new BookingError("pick at least one service");
  if (!(PAYMENTS as readonly string[]).includes(b.payment)) throw new BookingError("payment must be cash or e-Transfer");
  const uniq = [...new Set(services as string[])];
  const shovel = uniq.includes("Snow shovelling");
  if (shovel && !(PLANS as readonly string[]).includes(b.plan)) throw new BookingError("pick one-time or every snowfall");
  if (!shovel) b.plan = "";
  if (b.date) {
    const parsed = new Date(b.date + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== b.date)
      throw new BookingError("date doesn't look right");
    const yesterday = new Date(Date.parse(todayLocal + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
    if (b.date < yesterday) throw new BookingError("date is in the past");
  }
  const lat = typeof d.lat === "number" ? d.lat : null;
  const lng = typeof d.lng === "number" ? d.lng : null;
  const geoOk = lat != null && lng != null && inCalgary(lat, lng);
  const out: Booking = {
    ...b, services: uniq, icemelt: shovel && d.icemelt === true, estimate: "",
    lat: geoOk ? lat : null, lng: geoOk ? lng : null,
  };
  out.estimate = estimate(out);
  return out;
}

/** Prices are tax included. Only shovelling has a fixed price; everything else is quoted. */
export function estimate(b: Pick<Booking, "services" | "plan" | "icemelt">): string {
  const quoted = b.services.filter((s) => s !== "Snow shovelling");
  if (!b.services.includes("Snow shovelling")) return "Quote";
  const base = b.plan === "Every snowfall" ? 30 : 35; // every-snowfall plan gets $5 off
  const money = `$${base + (b.icemelt ? 5 : 0)}` + (b.plan === "Every snowfall" ? " / snowfall" : "");
  return money + (quoted.length ? " + quote" : "");
}

export function serviceLines(b: Pick<Booking, "services" | "plan" | "icemelt">): string[] {
  return b.services.map((s) => (s === "Snow shovelling" ? `${s} (${b.plan}${b.icemelt ? ", + ice melt" : ""})` : s));
}

export function whenText(b: Pick<Booking, "date" | "plan">): string {
  return b.date || (b.plan === "Every snowfall" ? "after every snowfall" : "as soon as possible");
}
