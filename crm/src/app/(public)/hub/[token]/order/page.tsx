// Order from the client hub: the booking form without "who are you" (the link says who), with their addresses to pick
// from, and "book this again" pre-filled from a past job. Same services, prices and pipeline as /book.
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { bookingMenu } from "@/server/booking/create";
import { OTHER, reorderLabels } from "@/server/booking/validate";
import { mapsKey } from "@/server/clients";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { SIZES } from "@/server/ops/drive-size";
import { peekToken } from "@/server/tokens";
import { hubOrder } from "../actions";

export const metadata = { title: { absolute: "Book a service · etc." } };

export default async function HubOrderPage({ params, searchParams }: PageProps<"/hub/[token]/order">) {
  const { token } = await params;
  const { again } = await searchParams;
  const t = await peekToken(db, token, ["CLIENT_HUB"]);
  if (!t.ok || !t.token.clientId) notFound();
  const c = await db.client.findUniqueOrThrow({
    where: { id: t.token.clientId },
    include: { properties: { where: { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
  });
  const { services, list } = await bookingMenu(c.businessId);
  // "Book this again": only one of this client's own finished one-off jobs.
  const job = typeof again === "string"
    ? await db.job.findFirst({ where: { id: again, clientId: c.id, kind: "ONE_OFF", visits: { some: { state: "COMPLETED" } } }, include: { request: true, lineItems: true } })
    : null;
  const labels = job ? reorderLabels({ requested: job.request?.services ?? [], lines: job.lineItems.map((l) => l.name), title: job.title }, services) : [];
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/hub/${token}`} className="text-sm font-semibold text-blue">← Back to your page</Link>
        <h1 className="mt-1 font-display text-3xl font-bold">{job ? "Book it again" : "Book a service"}</h1>
        <p className="mt-1 text-ink-soft">{job ? `Same as "${job.title}". Change anything you like.` : `Hi ${c.firstName}! Pick what you need and where.`} Prices include tax; pay after the job.</p>
      </div>
      <BookingForm services={list} phone={env.phone} mapsKey={mapsKey()} hub={{
        back: `/hub/${token}`, payment: c.preferredPayment === "CASH" ? "Cash" : "e-Transfer", order: hubOrder.bind(null, token),
        properties: c.properties.map((p) => ({ id: p.id, address: p.formatted, size: p.driveSize ? SIZES[p.driveSize].short : null })),
        ...(job ? { prefill: {
          services: labels, propertyId: c.properties.find((p) => p.id === job.propertyId)?.id,
          note: labels.includes(OTHER) ? `Same as last time: ${job.title}` : undefined,
        } } : {}),
      }} />
    </div>
  );
}
