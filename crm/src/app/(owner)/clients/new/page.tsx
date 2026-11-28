import { requireOwner } from "@/server/auth";
import { ClientForm } from "@/components/client-form";
import { DetailHeader } from "@/components/detail-header";
import { communityOptions, LEAD_SOURCES, mapsKey, PHONE_LABELS, TITLES } from "@/server/clients";
import { businessId } from "@/server/db";
import { clientSave } from "../../client-actions";

export const metadata = { title: "New client" };

export default async function NewClient({ searchParams }: PageProps<"/clients/new">) {
  await requireOwner();
  const sp = await searchParams;
  return (
    <>
      <DetailHeader back={{ href: "/clients", label: "Clients" }} title="New client" sub={sp.saved ? "Saved. Add the next one." : undefined} />
      <ClientForm action={clientSave} isNew mapsKey={mapsKey()} communities={await communityOptions(await businessId())}
        leadSources={LEAD_SOURCES} phoneLabels={PHONE_LABELS} titles={TITLES} error={typeof sp.error === "string" ? sp.error : undefined} />
    </>
  );
}
