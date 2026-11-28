// Booking page served by the CRM itself (prices from the price book). etccrew.ca/book.html keeps working too;
// both post to the same endpoint. Point etccrew.ca's "Book" links here once the Python endpoint is retired.
import { BookingForm } from "@/components/booking-form";
import { mapsKey } from "@/server/clients";
import { OTHER } from "@/server/booking/validate";
import { businessId, db } from "@/server/db";
import { env } from "@/server/env";
import { money } from "@/server/money";

// Prices come from the database, so render per request (never prerendered at build time, when the DB may be empty).
export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Book · etc. snow shovelling & odd jobs" }, robots: { index: true, follow: true } };

export default async function Book({ searchParams }: PageProps<"/book">) {
  const ref = (await searchParams).ref; // referral links: /book?ref=CODE
  const services = await db.service.findMany({ where: { businessId: await businessId(), active: true, bookable: true }, orderBy: { sortOrder: "asc" } });
  // One row per booking label (several price-book rows can share one, e.g. the snow variants); the first in price-book order wins.
  const byLabel = new Map<string, (typeof services)[number]>();
  for (const s of services) if (!byLabel.has(s.bookingLabel || s.name)) byLabel.set(s.bookingLabel || s.name, s);
  const list = [...byLabel].map(([label, s]) => ({
    label, description: s.description, price: label === "Snow shovelling" ? "from $30" : s.unitPriceCents != null ? money(s.unitPriceCents) : null,
  }));
  if (!byLabel.has(OTHER)) list.push({ label: OTHER, description: null, price: null }); // the API always takes the catch-all
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Book etc.</h1>
        <p className="mt-1 text-ink-soft">Snow shovelling &amp; odd jobs in Evergreen and SW Calgary. Prices include tax; pay after the job. Every job helps Silas get to electrician school.</p>
      </div>
      <BookingForm services={list} phone={env.phone} mapsKey={mapsKey()} refCode={typeof ref === "string" ? ref.slice(0, 20) : undefined} />
    </div>
  );
}
