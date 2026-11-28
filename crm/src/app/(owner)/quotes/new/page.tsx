// New quote from a request (/quotes/new?request=...) or for a client (?client=...), optionally pre-filled from a
// saved template (&template=...) or another quote (&similar=..., "create similar quote").
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPick } from "@/components/client-pick";
import { Gallery } from "@/components/gallery";
import { QuoteLinesEditor } from "@/components/quote-lines";
import { Button, Card, Field, Input, PageHeader, Textarea, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { templateLines } from "@/server/ops/quotes";
import { clientName } from "@/server/queries";
import { quoteCreate } from "../../quote-actions";

export const metadata = { title: "New quote" };

export default async function NewQuote({ searchParams }: PageProps<"/quotes/new">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const request = sp.request ? await db.request.findFirst({ where: { id: String(sp.request), businessId: bid } }) : null;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const keep = Object.fromEntries(["template", "similar"].flatMap((k) => (one(k) ? [[k, one(k)!]] : [])));
  if (!request && !sp.client) return <ClientPick businessId={bid} base="/quotes/new" keep={keep} q={one("q")} title="New quote" />;
  const client = await db.client.findFirst({ where: { id: request?.clientId ?? String(sp.client ?? ""), businessId: bid }, include: { properties: { where: { archivedAt: null } } } });
  if (!client) notFound();
  const services = await db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } });
  const photos = request ? await db.attachment.findMany({ where: { requestId: request.id, deletedAt: null }, orderBy: { createdAt: "asc" } }) : [];
  const priced = new Map(services.map((s) => [s.bookingLabel ?? s.name, s]));
  // Pre-fill one line per quoted service the client asked for (shovelling already has a fixed-price job).
  const asked = (request?.services ?? []).filter((s) => s !== "Snow shovelling").map((name) => ({ name, description: priced.get(name)?.description, quantity: 1, unitPriceCents: priced.get(name)?.unitPriceCents ?? null, isOptional: false, isSelected: true }));
  const templates = await db.quoteTemplate.findMany({ where: { businessId: bid }, orderBy: { name: "asc" } });
  const tpl = templates.find((t) => t.id === one("template"));
  const like = !tpl && one("similar") ? await db.quote.findFirst({ where: { id: one("similar"), businessId: bid }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } }) : null;
  // A template or a similar quote fills the form; its discount and deposit settings are copied when the quote is created.
  const src = tpl ? { title: tpl.title, message: tpl.message, lines: templateLines(tpl.lines) }
    : like ? { title: like.title, message: like.message, lines: like.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity) })) } : null;
  const lines = src?.lines ?? asked;
  const here = (template: string) => `/quotes/new?${new URLSearchParams({ ...(request ? { request: request.id } : { client: client.id }), template })}`;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New quote" sub={<>For <Link className="font-semibold text-blue" href={`/clients/${client.id}`}>{clientName(client)}</Link>{request && <> · from <Link className="font-semibold text-blue" href={`/requests/${request.id}`}>request #{request.number}</Link></>}{like && <> · like <Link className="font-semibold text-blue" href={`/quotes/${like.id}`}>quote #{like.number}</Link></>}</>} />
      {templates.length > 0 && !like && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-soft">Start from a template:</span>
          {templates.map((t) => <Link key={t.id} href={here(t.id)} className={`rounded-full px-3 py-1 font-semibold ${tpl?.id === t.id ? "bg-navy text-white" : "bg-tint"}`}>{t.name}</Link>)}
        </p>
      )}
      {photos.length > 0 && <Card title="Client's photos" className="mb-4"><Gallery photos={photos} back={`/quotes/new?request=${request!.id}`} controls={false} /></Card>}
      {request?.notes && <Card title="Client's notes" className="mb-4"><p className="whitespace-pre-line text-sm">{request.notes}</p></Card>}
      <Card>
        <form key={tpl?.id ?? like?.id ?? "blank"} action={quoteCreate} className="space-y-4">
          <input type="hidden" name="clientId" value={client.id} />
          {tpl && <input type="hidden" name="templateId" value={tpl.id} />}
          {like && <input type="hidden" name="similarId" value={like.id} />}
          {request && <input type="hidden" name="requestId" value={request.id} />}
          <Field label="Property">
            <select name="propertyId" className={inputCls} defaultValue={request?.propertyId ?? (like?.clientId === client.id ? like.propertyId : null) ?? undefined}>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select>
          </Field>
          <Field label="Title"><Input name="title" required defaultValue={src?.title ?? (lines.map((l) => l.name).join(" + ") || "")} placeholder="e.g. Deck & fence cleaning" /></Field>
          <QuoteLinesEditor lines={lines} services={services.map((s) => ({ name: s.name, description: s.description, unitPriceCents: s.unitPriceCents }))} />
          <Field label="Message to the client (optional)"><Textarea name="message" rows={3} defaultValue={src?.message ?? ""} placeholder="Thanks for the photos! Here's what we'd do…" /></Field>
          {src && <p className="text-sm text-ink-soft">The discount and deposit settings come along too; check them on the next screen. The quote gets a new number and 30 days to respond.</p>}
          <Button>Create quote</Button>
        </form>
      </Card>
    </div>
  );
}
