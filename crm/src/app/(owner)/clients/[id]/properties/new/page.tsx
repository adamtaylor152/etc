import { notFound } from "next/navigation";
import { DetailHeader } from "@/components/detail-header";
import { PropertyForm } from "@/components/property-form";
import { communityOptions, mapsKey } from "@/server/clients";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "New property" };

export default async function NewProperty({ params, searchParams }: PageProps<"/clients/[id]/properties/new">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const c = await db.client.findFirst({ where: { id, businessId: bid } });
  if (!c) notFound();
  return (
    <>
      <DetailHeader back={{ href: `/clients/${id}`, label: clientName(c) }} title="New property" />
      <PropertyForm clientId={id} mapsKey={mapsKey()} communities={await communityOptions(bid)} error={typeof sp.error === "string" ? sp.error : undefined} />
    </>
  );
}
