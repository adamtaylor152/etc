// New quote from a request (/quotes/new?request=...) or for a client (?client=...), optionally pre-filled from a
// saved template (&template=...) or another quote (&similar=..., "create similar quote").
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPick } from "@/components/client-pick";
import { Flash } from "@/components/flash";
import { Gallery } from "@/components/gallery";
import { QuoteLinesEditor } from "@/components/quote-lines";
import { DetailHeader } from "@/components/detail-header";
import { Button, Card, Field, Input, Textarea, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { templateLines } from "@/server/ops/quotes";
import { clientName } from "@/server/queries";
import { quoteOptions } from "@/server/status/quote";
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
  const src = tpl ? { title: tpl.title, message: tpl.message, lines: templateLines(tpl.lines), options: quoteOptions(tpl.options) }
    : like ? { title: like.title, message: like.message, lines: like.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity) })), options: quoteOptions(like.options) } : null;
  const lines = src?.lines ?? asked;
  const here = (template: string) => `/quotes/new?${new URLSearchParams({ ...(request ? { request: request.id } : { client: client.id }), template })}`;
  const link = "font-semibold text-blue hover:text-blue-deep";
  return (
    <div className="max-w-3xl">
      <DetailHeader back={request ? { href: `/requests/${request.id}`, label: `Request #${request.number}` } : { href: `/clients/${client.id}`, label: clientName(client) }} title="New quote"
        sub={<>For <Link className={link} href={`/clients/${client.id}`}>{clientName(client)}</Link>{request && <> · from <Link className={link} href={`/requests/${request.id}`}>request #{request.number}</Link></>}{like && <> · like <Link className={link} href={`/quotes/${like.id}`}>quote #{like.number}</Link></>}</>} />
      <Flash error={sp.error} />
      {templates.length > 0 && !like && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Start from a template">
          <span className="mr-1 text-xs font-medium text-ink-soft">Start from a template</span>
          {templates.map((t) => <Link key={t.id} href={here(t.id)} aria-current={tpl?.id === t.id ? "true" : undefined} className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${tpl?.id === t.id ? "border-blue/30 bg-blue/8 font-semibold text-blue-deep" : "border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:text-navy"}`}>{t.name}</Link>)}
        </div>
      )}
      <div className="space-y-5">
        {photos.length > 0 && <Card title="Client's photos"><Gallery photos={photos} back={`/quotes/new?request=${request!.id}`} controls={false} /></Card>}
        {request?.notes && <Card title="Client's notes"><p className="max-w-[70ch] whitespace-pre-line text-sm">{request.notes}</p></Card>}
        <Card>
          <form key={tpl?.id ?? like?.id ?? "blank"} action={quoteCreate} className="space-y-5">
            <input type="hidden" name="clientId" value={client.id} />
            {tpl && <input type="hidden" name="templateId" value={tpl.id} />}
            {like && <input type="hidden" name="similarId" value={like.id} />}
            {request && <input type="hidden" name="requestId" value={request.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title"><Input name="title" required defaultValue={src?.title ?? (lines.map((l) => l.name).join(" + ") || "")} placeholder="e.g. Deck & fence cleaning" /></Field>
              <Field label="Property">
                <select name="propertyId" className={inputCls} defaultValue={request?.propertyId ?? (like?.clientId === client.id ? like.propertyId : null) ?? undefined}>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select>
              </Field>
            </div>
            <div className="border-t border-line-soft pt-5">
              <QuoteLinesEditor lines={lines} options={src?.options} services={services.map((s) => ({ name: s.name, description: s.description, unitPriceCents: s.unitPriceCents }))} />
            </div>
            <Field label="Message to the client (optional)"><Textarea name="message" rows={3} defaultValue={src?.message ?? ""} placeholder="Thanks for the photos! Here's what we'd do…" /></Field>
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3 border-t border-line-soft pt-4">
              <p className="mr-auto max-w-[52ch] text-xs text-ink-soft">{src ? <>The options, discount and deposit settings come along too (line photos don&apos;t); check them on the next screen. The quote gets a new number and 30 days to respond.</> : "Saved as a draft. Discount, deposit and line photos are on the next screen, where you send it."}</p>
              <Link href={request ? `/requests/${request.id}` : `/clients/${client.id}`} className="inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-semibold text-ink-soft hover:text-navy">Cancel</Link>
              <Button>Create quote</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
