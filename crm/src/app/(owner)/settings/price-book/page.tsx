// Settings → Price book: the products & services behind line-item pickers, the online booking list and snow pricing.
import { ArrowDown, ArrowUp } from "lucide-react";
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { Badge, Button, Field, Input, Textarea, inputCls } from "@/components/ui";
import type { Service } from "@/generated/prisma/client";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { CATEGORIES, SNOW_KEYS, UNITS } from "@/server/ops/price-book";
import { serviceArchive, serviceMove, serviceSave } from "./actions";

export const metadata = { title: "Price book" };

const check = "flex items-center gap-1.5 text-sm";

function ServiceForm({ sv, checklists }: { sv?: Service; checklists: { id: string; name: string }[] }) {
  const dollars = (c?: number | null) => (c != null ? c / 100 : "");
  return (
    <form action={serviceSave} className="grid gap-3 sm:grid-cols-4">
      {sv && <input type="hidden" name="id" value={sv.id} />}
      <div className="sm:col-span-2"><Field label="Name" hint="Shown on quotes, jobs and invoices"><Input name="name" required maxLength={120} defaultValue={sv?.name} /></Field></div>
      <Field label="Category"><select name="category" defaultValue={sv?.category ?? "OTHER"} className={inputCls}>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Checklist"><select name="checklistTemplateId" defaultValue={sv?.checklistTemplateId ?? ""} className={inputCls}><option value="">None</option>{checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <div className="sm:col-span-4"><Field label="Description" hint="Fills the line description when picked, and shows under the service on the booking page"><Textarea name="description" rows={2} maxLength={500} defaultValue={sv?.description ?? ""} /></Field></div>
      <Field label="Pricing"><select name="pricingMode" defaultValue={sv?.pricingMode ?? "QUOTE"} className={inputCls}><option value="FIXED">Fixed price</option><option value="QUOTE">Quote</option></select></Field>
      <Field label="Unit price ($)" hint="Tax included. Ignored for Quote"><Input name="price" type="number" step="0.01" min={0} defaultValue={dollars(sv?.unitPriceCents)} /></Field>
      <Field label="Unit"><select name="unit" defaultValue={sv?.unit ?? "EACH"} className={inputCls}>{Object.entries(UNITS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Our cost ($ per unit)"><Input name="cost" type="number" step="0.01" min={0} defaultValue={dollars(sv?.unitCostCents)} /></Field>
      <Field label="Usual time (minutes)"><Input name="duration" type="number" step={1} min={1} max={1440} defaultValue={sv?.defaultDurationMin ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Booking label" hint="What the booking form sends. Blank = the name. etccrew.ca's form sends fixed labels, so change one only if the site changes too"><Input name="bookingLabel" maxLength={80} defaultValue={sv?.bookingLabel ?? ""} /></Field></div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-4">
        <label className={check}><input type="checkbox" name="bookable" defaultChecked={sv?.bookable ?? false} className="size-4" />Bookable online</label>
        <label className={check}><input type="checkbox" name="isAddon" defaultChecked={sv?.isAddon} className="size-4" />Add-on</label>
        <label className={check}><input type="checkbox" name="taxExempt" defaultChecked={sv?.taxExempt} className="size-4" />Tax exempt</label>
        <label className={check}><input type="checkbox" name="active" defaultChecked={sv?.active ?? true} className="size-4" />Active</label>
        <Button className="ml-auto">{sv ? "Save" : "Add service"}</Button>
      </div>
      {sv && <p className="text-xs text-ink-soft sm:col-span-4">Key <code>{sv.key}</code> (fixed).{SNOW_KEYS.includes(sv.key) && " Online snow bookings are priced from this service's unit price."}</p>}
    </form>
  );
}

export default async function PriceBook({ searchParams }: PageProps<"/settings/price-book">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const [services, checklists] = await Promise.all([
    db.service.findMany({ where: { businessId: bid }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    db.checklistTemplate.findMany({ where: { businessId: bid, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Price book" sub="Products and services for quotes, jobs and invoices. Bookable ones are the list on the online booking page. Prices include tax; existing jobs keep the price they were booked at." />
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
      <div className="max-w-4xl space-y-5">
        <ul className="divide-y divide-line rounded-lg border border-line bg-white shadow-card">
          {services.map((sv, i) => (
            <li key={sv.id} className={`flex items-start gap-2 p-3 ${sv.active ? "" : "bg-tint/50"}`}>
              <form action={serviceMove} className="flex flex-col pt-0.5">
                <input type="hidden" name="id" value={sv.id} />
                <button name="dir" value="up" disabled={!sv.active || i === 0} aria-label={`Move ${sv.name} up`} className="text-ink-soft disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button name="dir" value="down" disabled={!sv.active || !services[i + 1]?.active} aria-label={`Move ${sv.name} down`} className="text-ink-soft disabled:opacity-30"><ArrowDown className="size-4" /></button>
              </form>
              <details className="min-w-0 flex-1" open={sp.open === sv.id}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className={`font-semibold ${sv.active ? "" : "text-ink-soft line-through"}`}>{sv.name}</span>
                  <span className="text-ink-soft">{sv.unitPriceCents != null ? `${money(sv.unitPriceCents)} ${UNITS[sv.unit]}` : "Quote"}</span>
                  {sv.defaultDurationMin != null && <span className="text-ink-soft">· {sv.defaultDurationMin} min</span>}
                  {sv.unitCostCents != null && <span className="text-ink-soft">· cost {money(sv.unitCostCents)}</span>}
                  {sv.active && sv.bookable && <Badge tone="blue">Bookable</Badge>}
                  {sv.isAddon && <Badge>Add-on</Badge>}
                  {sv.taxExempt && <Badge>Tax exempt</Badge>}
                  {!sv.active && <Badge>Archived</Badge>}
                </summary>
                <div className="mt-3"><ServiceForm sv={sv} checklists={checklists} /></div>
              </details>
              <form action={serviceArchive}>
                <input type="hidden" name="id" value={sv.id} />
                <input type="hidden" name="active" value={sv.active ? "0" : "1"} />
                <button className="text-sm font-semibold text-blue">{sv.active ? "Archive" : "Restore"}</button>
              </form>
            </li>
          ))}
        </ul>
        <section className="rounded-lg border border-dashed border-line bg-white p-4">
          <h2 className="mb-3 text-base font-bold">New service</h2>
          <ServiceForm checklists={checklists} />
        </section>
        <p className="text-xs text-ink-soft">Archived services drop out of pickers and the booking page but stay on past quotes, jobs and invoices; nothing is ever deleted. The tax-exempt flag, cost and usual time are recorded here but don&apos;t change invoices or scheduling yet.</p>
      </div>
    </>
  );
}
