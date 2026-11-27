import { notFound } from "next/navigation";
import { DetailHeader } from "@/components/detail-header";
import { PropertyForm } from "@/components/property-form";
import { communityOptions, mapsKey } from "@/server/clients";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Edit property" };

export default async function EditProperty({ params, searchParams }: PageProps<"/properties/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const p = await db.property.findFirst({ where: { id, businessId: bid }, include: { client: true } });
  if (!p) notFound();
  return (
    <>
      <DetailHeader back={{ href: `/clients/${p.clientId}`, label: clientName(p.client) }} title="Edit property" sub={p.formatted} />
      <PropertyForm clientId={p.clientId} p={p} mapsKey={mapsKey()} communities={await communityOptions(bid)} error={typeof sp.error === "string" ? sp.error : undefined} />
    </>
  );
}
