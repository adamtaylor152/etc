// Booking page served by the CRM itself (prices from the price book). etccrew.ca/book.html keeps working too;
// both post to the same endpoint. Point etccrew.ca's "Book" links here once the Python endpoint is retired.
import { BookingForm } from "@/components/booking-form";
import { bookingMenu } from "@/server/booking/create";
import { mapsKey } from "@/server/clients";
import { businessId } from "@/server/db";
import { env } from "@/server/env";

// Prices come from the database, so render per request (never prerendered at build time, when the DB may be empty).
export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Book · etc. snow shovelling & odd jobs" }, robots: { index: true, follow: true } };

export default async function Book({ searchParams }: PageProps<"/book">) {
  const ref = (await searchParams).ref; // referral links: /book?ref=CODE
  const { list } = await bookingMenu(await businessId());
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
