import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Button, Card, Field, Input, PageHeader, inputCls } from "@/components/ui";
import { dateOnly } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { env } from "@/server/env";
import { parseSettings, SETTING_LABELS, type ToggleKey } from "@/server/settings";
import { stripeEnabled } from "@/server/stripe";
import { saveAutomations, saveBusiness, savePrice, saveSeason, saveTax } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const biz = await business();
  const settings = parseSettings(biz.settings);
  const [seasons, services, users, area] = await Promise.all([
    db.season.findMany({ where: { businessId: bid }, orderBy: { startsOn: "desc" } }),
    db.service.findMany({ where: { businessId: bid }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { businessId: bid }, orderBy: { email: "asc" } }),
    db.serviceCommunity.findMany({ where: { businessId: bid, active: true }, include: { community: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Settings" actions={<><Link href="/settings/checklists" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Checklists</Link><Link href="/settings/team" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Team &amp; people</Link></>} />
      {sp.saved && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Business">
          <form action={saveBusiness} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input name="name" defaultValue={biz.name} required /></Field>
            <Field label="Legal name" hint="On invoices and the Stripe account (an adult)"><Input name="legalName" defaultValue={biz.legalName ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={biz.phone ?? ""} /></Field>
            <Field label="Help email"><Input name="helpEmail" type="email" defaultValue={biz.helpEmail ?? ""} /></Field>
            <Field label="e-Transfer email" hint="Turn on Autodeposit at your bank"><Input name="etransferEmail" type="email" defaultValue={biz.etransferEmail ?? ""} /></Field>
            <Field label="Website"><Input name="website" defaultValue={biz.website ?? ""} /></Field>
            <div className="sm:col-span-2"><Field label="Google review link" hint="For review requests"><Input name="googleReviewUrl" defaultValue={biz.googleReviewUrl ?? ""} /></Field></div>
            <Field label="Route start (home)"><Input name="depotAddress" defaultValue={biz.depotAddress ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Lat"><Input name="depotLat" defaultValue={biz.depotLat ?? ""} /></Field>
              <Field label="Lng"><Input name="depotLng" defaultValue={biz.depotLng ?? ""} /></Field>
            </div>
            <div className="sm:col-span-2"><Button>Save business</Button></div>
          <Field label="Mailing address" hint="Shown in marketing emails (Canada's anti-spam law requires it)"><Input name="mailingAddress" defaultValue={biz.mailingAddress ?? ""} placeholder="Street, Calgary AB T2Y ..." /></Field>
          </form>
        </Card>

        <Card title="Automations">
          <form action={saveAutomations} className="space-y-3">
            {(Object.keys(SETTING_LABELS) as ToggleKey[]).map((k) => (
              <label key={k} className="flex items-start gap-3">
                <input type="checkbox" name={k} defaultChecked={settings[k]} className="mt-1 size-5 shrink-0" />
                <span><span className="block font-semibold">{SETTING_LABELS[k][0]}</span><span className="text-sm text-ink-soft">{SETTING_LABELS[k][1]}</span></span>
              </label>
            ))}
            <Button>Save automations</Button>
          </form>
        </Card>

        <Card title="GST & payments">
          <form action={saveTax} className="space-y-3">
            <label className="flex items-center gap-3"><input type="checkbox" name="taxRegistered" defaultChecked={biz.taxRegistered} className="size-5" /> <span><b>GST registered</b><span className="block text-sm text-ink-soft">Leave off while under the $30,000 small-supplier threshold: no GST is charged or shown.</span></span></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="GST number"><Input name="taxNumber" defaultValue={biz.taxNumber ?? ""} placeholder="123456789 RT0001" /></Field>
              <Field label="Rate (%)"><Input name="taxRate" type="number" step="0.01" defaultValue={biz.taxRateBps / 100} /></Field>
            </div>
            <label className="flex items-center gap-3"><input type="checkbox" name="pricesIncludeTax" defaultChecked={biz.pricesIncludeTax} className="size-5" /> Prices include GST</label>
            <Field label="Invoice due">
              <select name="terms" defaultValue={biz.defaultPaymentTerms} className={inputCls}>
                <option value="DUE_ON_RECEIPT">On receipt</option><option value="NET_7">7 days</option><option value="NET_15">15 days</option><option value="NET_30">30 days</option>
              </select>
            </Field>
            <p className="text-sm text-ink-soft">Card payments: {stripeEnabled() ? "on (Stripe)" : "off. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to turn on."}</p>
            <Button>Save</Button>
          </form>
        </Card>

        <Card title="Snow seasons">
          <div className="space-y-4">
            {[...seasons, null].map((se) => (
              <form key={se?.id ?? "new"} action={saveSeason} className="grid items-end gap-2 sm:grid-cols-5">
                <input type="hidden" name="id" value={se?.id ?? ""} />
                <div className="sm:col-span-2"><Field label={se ? "Season" : "New season"}><Input name="name" defaultValue={se?.name ?? ""} placeholder="Winter 2027–28" required /></Field></div>
                <Field label="Starts"><Input name="startsOn" type="date" defaultValue={dateOnly(se?.startsOn) ?? ""} required /></Field>
                <Field label="Ends"><Input name="endsOn" type="date" defaultValue={dateOnly(se?.endsOn) ?? ""} required /></Field>
                <div className="flex items-end gap-2"><Field label="Trigger cm"><Input name="defaultTriggerCm" type="number" min={0} max={50} defaultValue={se?.defaultTriggerCm ?? 2} /></Field><Button variant="secondary">Save</Button></div>
              </form>
            ))}
          </div>
        </Card>

        <Card title="Price book" className="lg:col-span-2">
          <div id="prices" className="divide-y divide-line">
            {services.map((sv) => (
              <form key={sv.id} action={savePrice} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <input type="hidden" name="id" value={sv.id} />
                <span className="min-w-48 flex-1 font-semibold">{sv.name}{sv.isAddon && <span className="ml-1 text-xs text-ink-soft">(add-on)</span>}</span>
                <label className="flex items-center gap-1">$<Input name="price" type="number" step="0.01" min={0} defaultValue={sv.unitPriceCents != null ? sv.unitPriceCents / 100 : ""} placeholder="Quote" className="w-28" /></label>
                <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={sv.active} className="size-4" /> active</label>
                <Button variant="secondary">Save</Button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">Prices include tax. New bookings use these; existing jobs keep the price they were booked at. The public booking page&apos;s prices are set on etccrew.ca.</p>
        </Card>

        <Card title="Who can sign in">
          <ul className="space-y-1 text-sm">{users.map((u) => <li key={u.id}>{u.email} <span className="text-ink-soft">{u.lastLoginAt ? "· signed in before" : "· never signed in"}</span></li>)}</ul>
          <p className="mt-2 text-xs text-ink-soft">Set by OWNER_EMAILS on the server ({env.ownerEmails.length} configured). Change it in Coolify and redeploy.</p>
        </Card>

        <Card title="Service area">
          <p className="text-sm">{area.map((a) => a.community.name).join(", ")}</p>
          <p className="mt-2 text-xs text-ink-soft">Routes visit communities in this order (Evergreen first). Addresses outside it still work; they land under &quot;No community&quot; until pinned.</p>
        </Card>
      </div>
    </>
  );
}
