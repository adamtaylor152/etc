// Import bookings from the Python site's SQLite into the CRM. Safe to re-run: rows already imported
// (matched on legacyBookingId) are skipped, so it also picks up bookings that fell back to the old endpoint.
//
//   docker cp <site-container>:/data/bookings.db .        (or scp from the server)
//   sqlite3 -json bookings.db "select * from bookings" > bookings.json
//   pnpm import:legacy bookings.json
//
// Request numbers keep the legacy id (so "booking #57" still means #57) unless that number is already taken.
// No emails are sent. GOOGLE_GEOCODING_KEY (server key) is optional: with it, addresses get a map pin + community.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createBooking } from "../src/server/booking/create";
import type { Booking } from "../src/server/booking/validate";
import { todayLocal } from "../src/server/dates";
import { businessId, db } from "../src/server/db";

type Row = {
  id: number; created_at: string; name: string; email: string; phone: string | null; address: string; access: string | null;
  services: string; plan: string | null; icemelt: number; date: string | null; notes: string | null; payment: string; estimate: string;
};

async function geocode(address: string): Promise<{ lat: number; lng: number; placeId: string; postalCode: string } | null> {
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?region=ca&bounds=50.84,-114.32|51.21,-113.86&address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url).then((r) => r.json()).catch(() => null);
  const hit = res?.results?.[0];
  if (!hit) return null;
  const pc = hit.address_components?.find((c: { types: string[] }) => c.types.includes("postal_code"));
  return { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, placeId: hit.place_id ?? "", postalCode: pc?.long_name ?? "" };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: import-legacy-bookings.ts bookings.json");
  const rows: Row[] = JSON.parse(readFileSync(file, "utf8"));
  const bid = await businessId();
  const today = todayLocal();
  let imported = 0, skipped = 0, renumbered = 0, closed = 0;

  for (const r of rows.sort((a, b) => a.id - b.id)) {
    if (await db.request.findUnique({ where: { businessId_legacyBookingId: { businessId: bid, legacyBookingId: r.id } } })) { skipped++; continue; }
    const geo = await geocode(r.address);
    const b: Booking = {
      name: r.name, email: r.email, phone: r.phone ?? "", address: r.address, access: r.access ?? "", notes: r.notes ?? "",
      plan: r.plan ?? "", payment: r.payment, date: r.date ?? "", services: JSON.parse(r.services), icemelt: !!r.icemelt,
      estimate: r.estimate, size: "", extraWalk: false, lat: geo?.lat ?? null, lng: geo?.lng ?? null, placeId: geo?.placeId ?? "", postalCode: geo?.postalCode ?? "",
    };
    const taken = await db.request.findUnique({ where: { businessId_number: { businessId: bid, number: r.id } } });
    if (taken) renumbered++;
    const createdAt = new Date(r.created_at);
    const res = await createBooking(b, {
      businessId: bid, source: "IMPORT", legacyBookingId: r.id, createdAt, sendEmails: false, number: taken ? undefined : r.id, raw: r,
    });
    // One-time jobs from the past are history, not work: close them so they don't show as Late.
    const stale = b.date ? b.date < today : Date.now() - createdAt.getTime() > 7 * 86_400_000;
    if (res.jobId && b.plan === "One-time visit" && stale) {
      await db.job.update({ where: { id: res.jobId }, data: { closedAt: new Date(), closeReason: "Imported from the old booking system" } });
      closed++;
    }
    imported++;
  }

  // Next new request number continues after the highest legacy id.
  const max = Math.max(0, ...rows.map((r) => r.id));
  await db.$executeRaw`
    INSERT INTO "Counter" ("businessId", kind, next) VALUES (${bid}, 'REQUEST', ${max + 1})
    ON CONFLICT ("businessId", kind) DO UPDATE SET next = GREATEST("Counter".next, ${max + 1})`;

  console.log(`rows ${rows.length}: imported ${imported} (renumbered ${renumbered}, closed as history ${closed}), already imported ${skipped}`);
  console.log(`check: sqlite3 bookings.db "select count(*) from bookings"  vs  ${await db.request.count({ where: { businessId: bid, legacyBookingId: { not: null } } })} legacy requests in the CRM`);
}

main().finally(() => db.$disconnect());
