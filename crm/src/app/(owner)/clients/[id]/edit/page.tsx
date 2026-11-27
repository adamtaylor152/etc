import { notFound } from "next/navigation";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { DetailHeader } from "@/components/detail-header";
import { communityOptions, LEAD_SOURCES, mapsKey, PHONE_LABELS, TITLES } from "@/server/clients";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { clientSave } from "../../../client-actions";

export const metadata = { title: "Edit client" };

export default async function EditClient({ params, searchParams }: PageProps<"/clients/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const c = await db.client.findFirst({ where: { id, businessId: bid }, include: { contacts: { orderBy: { createdAt: "asc" } } } });
  if (!c) notFound();
  const phones = Array.isArray(c.phones) && c.phones.length ? (c.phones as ClientFormValues["phones"]) : c.phone ? [{ number: c.phone, label: "Mobile", sms: true }] : [{ number: "", label: "Mobile", sms: true }];
  const emails = Array.isArray(c.emails) && c.emails.length ? (c.emails as ClientFormValues["emails"]) : [{ address: c.email, label: "Main" }];
  const initial: ClientFormValues = {
    title: c.title ?? "", firstName: c.firstName, lastName: c.lastName, companyName: c.companyName ?? "", phones, emails,
    leadSource: c.leadSource ?? "", tags: c.tags.join(", "), notes: c.notes ?? "", followUpQuotes: c.followUpQuotes, followUpInvoices: c.followUpInvoices,
    visitReminders: c.visitReminders, marketingOptOut: c.marketingOptOut, smsOptIn: c.smsOptIn,
    contacts: c.contacts.map((x) => ({ id: x.id, role: x.role ?? "", firstName: x.firstName, lastName: x.lastName, phone: x.phone ?? "", email: x.email ?? "", isBilling: x.isBilling, receivesTexts: x.receivesTexts })),
  };
  return (
    <>
      <DetailHeader back={{ href: `/clients/${id}`, label: clientName(c) }} title={`Edit ${clientName(c)}`} />
      <ClientForm action={clientSave} id={id} initial={initial} isNew={false} mapsKey={mapsKey()} communities={await communityOptions(bid)}
        leadSources={LEAD_SOURCES} phoneLabels={PHONE_LABELS} titles={TITLES} error={typeof sp.error === "string" ? sp.error : undefined} />
    </>
  );
}
