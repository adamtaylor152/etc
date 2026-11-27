// New quote from a request (/quotes/new?request=...) or for a client (?client=...).
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPick } from "@/components/client-pick";
import { Gallery } from "@/components/gallery";
import { QuoteLinesEditor } from "@/components/quote-lines";
import { Button, Card, Field, Input, PageHeader, Textarea, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { quoteCreate } from "../../quote-actions";

export const metadata = { title: "New quote" };

export default async function NewQuote({ searchParams }: PageProps<"/quotes/new">) {
  const sp = await searchParams;
  const bid = await businessId();
  const request = sp.request ? await db.request.findFirst({ where: { id: String(sp.request), businessId: bid } }) : null;
  if (!request && !sp.client) return <ClientPick businessId={bid} base="/quotes/new" q={typeof sp.q === "string" ? sp.q : undefined} title="New quote" />;
  const client = await db.client.findFirst({ where: { id: request?.clientId ?? String(sp.client ?? ""), businessId: bid }, include: { properties: { where: { archivedAt: null } } } });
  if (!client) notFound();
  const services = await db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } });
  const photos = request ? await db.attachment.findMany({ where: { requestId: request.id, deletedAt: null }, orderBy: { createdAt: "asc" } }) : [];
  const priced = new Map(services.map((s) => [s.bookingLabel ?? s.name, s.unitPriceCents]));
  // Pre-fill one line per quoted service the client asked for (shovelling already has a fixed-price job).
  const lines = (request?.services ?? []).filter((s) => s !== "Snow shovelling").map((name) => ({ name, quantity: 1, unitPriceCents: priced.get(name) ?? null, isOptional: false, isSelected: true }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New quote" sub={<>For <Link className="font-semibold text-blue" href={`/clients/${client.id}`}>{clientName(client)}</Link>{request && <> · from <Link className="font-semibold text-blue" href={`/requests/${request.id}`}>request #{request.number}</Link></>}</>} />
      {photos.length > 0 && <Card title="Client's photos" className="mb-4"><Gallery photos={photos} back={`/quotes/new?request=${request!.id}`} controls={false} /></Card>}
      {request?.notes && <Card title="Client's notes" className="mb-4"><p className="whitespace-pre-line text-sm">{request.notes}</p></Card>}
      <Card>
        <form action={quoteCreate} className="space-y-4">
          <input type="hidden" name="clientId" value={client.id} />
          {request && <input type="hidden" name="requestId" value={request.id} />}
          <Field label="Property">
            <select name="propertyId" className={inputCls} defaultValue={request?.propertyId ?? undefined}>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select>
          </Field>
          <Field label="Title"><Input name="title" required defaultValue={lines.map((l) => l.name).join(" + ") || ""} placeholder="e.g. Deck & fence cleaning" /></Field>
          <QuoteLinesEditor lines={lines} suggestions={services.map((s) => s.name)} />
          <Field label="Message to the client (optional)"><Textarea name="message" rows={3} placeholder="Thanks for the photos! Here's what we'd do…" /></Field>
          <Button>Create quote</Button>
        </form>
      </Card>
    </div>
  );
}
