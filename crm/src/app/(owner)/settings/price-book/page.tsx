// Settings → Price book: the products & services behind line-item pickers, the online booking list and snow pricing.
import { ArrowDown, ArrowUp, ChevronDown, Plus } from "lucide-react";
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Saved } from "@/components/settings/fields";
import { Badge, Button, Card, Empty, Field, Input, Textarea, btn, inputCls } from "@/components/ui";
import type { Service } from "@/generated/prisma/client";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { CATEGORIES, SNOW_KEYS, UNITS } from "@/server/ops/price-book";
import { serviceArchive, serviceMove, serviceSave } from "./actions";

export const metadata = { title: "Price book" };

const check = "flex min-h-10 items-center gap-2 text-sm font-medium";
// One set of columns for the header and every row, so the figures line up down the page.
const COLS = "sm:grid sm:grid-cols-[minmax(0,1fr)_3.5rem] lg:grid-cols-[minmax(0,1fr)_5.5rem_5rem_5rem_5.5rem_5.5rem_3.5rem] sm:items-center sm:gap-3";
const moveBtn = "grid size-8 place-items-center rounded-md border border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:bg-tint hover:text-navy disabled:border-line-soft disabled:bg-transparent disabled:text-ink-faint/50";

function ServiceForm({ sv, checklists }: { sv?: Service; checklists: { id: string; name: string }[] }) {
  const dollars = (c?: number | null) => (c != null ? c / 100 : "");
  return (
    <form action={serviceSave} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {sv && <input type="hidden" name="id" value={sv.id} />}
      <div className="sm:col-span-2"><Field label="Name" hint="Shown on quotes, jobs and invoices"><Input name="name" required maxLength={120} defaultValue={sv?.name} /></Field></div>
      <Field label="Category"><select name="category" defaultValue={sv?.category ?? "OTHER"} className={inputCls}>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Checklist"><select name="checklistTemplateId" defaultValue={sv?.checklistTemplateId ?? ""} className={inputCls}><option value="">None</option>{checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <div className="sm:col-span-2 lg:col-span-4"><Field label="Description" hint="Fills the line description when picked, and shows under the service on the booking page"><Textarea name="description" rows={2} maxLength={500} defaultValue={sv?.description ?? ""} /></Field></div>
      <Field label="Pricing"><select name="pricingMode" defaultValue={sv?.pricingMode ?? "QUOTE"} className={inputCls}><option value="FIXED">Fixed price</option><option value="QUOTE">Quote</option></select></Field>
      <Field label="Unit price ($)" hint="Tax included. Ignored for Quote"><Input name="price" type="number" step="0.01" min={0} defaultValue={dollars(sv?.unitPriceCents)} className="tabular-nums" /></Field>
      <Field label="Unit"><select name="unit" defaultValue={sv?.unit ?? "EACH"} className={inputCls}>{Object.entries(UNITS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Our cost ($ per unit)"><Input name="cost" type="number" step="0.01" min={0} defaultValue={dollars(sv?.unitCostCents)} className="tabular-nums" /></Field>
      <Field label="Usual time (minutes)"><Input name="duration" type="number" step={1} min={1} max={1440} defaultValue={sv?.defaultDurationMin ?? ""} className="tabular-nums" /></Field>
      <div className="sm:col-span-2 lg:col-span-3"><Field label="Booking label" hint="What the booking form sends. Blank = the name. etccrew.ca's form sends fixed labels, so change one only if the site changes too"><Input name="bookingLabel" maxLength={80} defaultValue={sv?.bookingLabel ?? ""} /></Field></div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 sm:col-span-2 lg:col-span-4">
        <label className={check}><input type="checkbox" name="bookable" defaultChecked={sv?.bookable ?? false} className="size-5" />Bookable online</label>
        <label className={check}><input type="checkbox" name="isAddon" defaultChecked={sv?.isAddon} className="size-5" />Add-on</label>
        <label className={check}><input type="checkbox" name="taxExempt" defaultChecked={sv?.taxExempt} className="size-5" />Tax exempt</label>
        <label className={check}><input type="checkbox" name="active" defaultChecked={sv?.active ?? true} className="size-5" />Active</label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-4">
        <Button>{sv ? "Save service" : "Add service"}</Button>
        {sv && <p className="text-xs text-ink-soft">Key <code className="rounded bg-white px-1 py-0.5 text-navy">{sv.key}</code> (fixed).{SNOW_KEYS.includes(sv.key) && " Online snow bookings are priced from this service's unit price."}</p>}
      </div>
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
  // Rows stay in the order pickers and the booking page use (the arrows change it), so the category is a column,
  // not a group; archived services sit together at the end under their own heading.
  const category = (sv: Service) => CATEGORIES[sv.category as keyof typeof CATEGORIES] ?? sv.category;
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Price book" sub="Products and services for quotes, jobs and invoices. Bookable ones are the list on the online booking page. Prices include tax; existing jobs keep the price they were booked at."
        actions={<a href="#new" className={btn("primary")}><Plus className="size-4" aria-hidden />New service</a>} />
      <Flash error={sp.error} />
      <Saved when={!!sp.saved} />
      <div className="max-w-5xl space-y-5">
        {services.length === 0 ? <Empty action={<a href="#new" className={btn("secondary")}>Add your first service</a>}>No services yet. Add what you sell and it shows up in quote, job and invoice line pickers.</Empty> : (
          <section className="overflow-hidden rounded-xl border border-line bg-white shadow-card" aria-label="Services">
            <div className={`hidden border-b border-line py-2 pl-[5.75rem] pr-[6.25rem] text-xs font-medium text-ink-soft ${COLS}`}>
              <span>Service</span><span className="hidden lg:block">Category</span><span className="hidden text-right lg:block">Usual time</span><span className="hidden text-right lg:block">Our cost</span><span className="hidden text-right lg:block">Price</span><span className="hidden lg:block">Unit</span><span />
            </div>
            <ul>
              {services.map((sv, i) => {
                const firstArchived = !sv.active && (i === 0 || services[i - 1].active);
                const price = sv.unitPriceCents != null ? money(sv.unitPriceCents) : null;
                return (
                  <li key={sv.id} className="border-b border-line-soft last:border-b-0">
                    {firstArchived && <h2 className="border-b border-line-soft bg-tint px-4 py-2 text-xs font-medium text-ink-soft">Archived: kept on past quotes, jobs and invoices, hidden from pickers and booking</h2>}
                    <div className="relative">
                      {sv.active && (
                        <form action={serviceMove} className="absolute left-3 top-3 flex gap-1">
                          <input type="hidden" name="id" value={sv.id} />
                          <button name="dir" value="up" disabled={i === 0} aria-label={`Move ${sv.name} up`} title="Move up" className={moveBtn}><ArrowUp className="size-4" aria-hidden /></button>
                          <button name="dir" value="down" disabled={!services[i + 1]?.active} aria-label={`Move ${sv.name} down`} title="Move down" className={moveBtn}><ArrowDown className="size-4" aria-hidden /></button>
                        </form>
                      )}
                      <details className="group" open={sp.open === sv.id}>
                        <summary className={`list-none min-h-14 cursor-pointer py-3 pl-[5.75rem] pr-4 text-sm sm:pr-[6.25rem] hover:bg-tint/60 ${COLS}`}>
                          <span className="block min-w-0"><span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`font-semibold ${sv.active ? "" : "text-ink-soft"}`}>{sv.name}</span>
                            {sv.active && sv.bookable && <Badge tone="blue">Bookable</Badge>}
                            {sv.isAddon && <Badge>Add-on</Badge>}
                            {sv.taxExempt && <Badge>Tax exempt</Badge>}
                            {!sv.active && <Badge>Archived</Badge>}
                          </span>
                          <span className="mt-0.5 block text-ink-soft tabular-nums lg:hidden">
                            {category(sv)} · {price ? `${price} ${UNITS[sv.unit]}` : "Quote"}{sv.defaultDurationMin != null && ` · ${sv.defaultDurationMin} min`}{sv.unitCostCents != null && ` · cost ${money(sv.unitCostCents)}`}
                          </span></span>
                          <span className="hidden text-ink-soft lg:block">{category(sv)}</span>
                          <span className="hidden text-right tabular-nums text-ink-soft lg:block">{sv.defaultDurationMin != null ? `${sv.defaultDurationMin} min` : "—"}</span>
                          <span className="hidden text-right tabular-nums text-ink-soft lg:block">{sv.unitCostCents != null ? money(sv.unitCostCents) : "—"}</span>
                          <span className={`hidden text-right tabular-nums lg:block ${price ? "font-semibold" : "text-ink-soft"}`}>{price ?? "Quote"}</span>
                          <span className="hidden text-ink-soft lg:block">{price ? UNITS[sv.unit] : ""}</span>
                          <span className="mt-1 inline-flex items-center gap-1 font-medium text-blue sm:mt-0 sm:justify-end"><span className="group-open:hidden">Edit</span><span className="hidden group-open:inline">Close</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></span>
                        </summary>
                        <div className="border-t border-line-soft bg-tint p-4 sm:p-5"><ServiceForm sv={sv} checklists={checklists} /></div>
                      </details>
                      <form action={serviceArchive} className="absolute right-3 top-2.5 hidden sm:block">
                        <input type="hidden" name="id" value={sv.id} />
                        <input type="hidden" name="active" value={sv.active ? "0" : "1"} />
                        <button className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-ink-soft hover:bg-tint hover:text-navy" aria-label={`${sv.active ? "Archive" : "Restore"} ${sv.name}`}>{sv.active ? "Archive" : "Restore"}</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div id="new" className="scroll-mt-20">
          <Card title="New service"><ServiceForm checklists={checklists} /></Card>
        </div>
        <p className="max-w-[70ch] text-xs text-ink-soft">Archived services drop out of pickers and the booking page but stay on past quotes, jobs and invoices; nothing is ever deleted. The tax-exempt flag, cost and usual time are recorded here but don&apos;t change invoices or scheduling yet.</p>
      </div>
    </>
  );
}
