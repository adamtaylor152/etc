"use client";
// New/Edit client, laid out like Jobber's: primary contact, phones (label + receives texts), emails, lead source,
// tags, communication preferences, additional contacts, and (new clients) a property address.
import Link from "next/link";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AddressField } from "./address-field";
import { Button, Card, Field, Notice, inputCls } from "./ui";

type Phone = { number: string; label: string; sms: boolean };
type Email = { address: string; label: string };
type Contact = { id?: string; role: string; firstName: string; lastName: string; phone: string; email: string; isBilling: boolean; receivesTexts: boolean };
export type ClientFormValues = {
  title: string; firstName: string; lastName: string; companyName: string; phones: Phone[]; emails: Email[]; leadSource: string; tags: string; notes: string;
  followUpQuotes: boolean; followUpInvoices: boolean; visitReminders: boolean; marketingOptOut: boolean; smsOptIn: boolean; doNotService: boolean; contacts: Contact[];
};
export const emptyClient: ClientFormValues = {
  title: "", firstName: "", lastName: "", companyName: "", phones: [{ number: "", label: "Mobile", sms: true }], emails: [{ address: "", label: "Main" }],
  leadSource: "", tags: "", notes: "", followUpQuotes: true, followUpInvoices: true, visitReminders: true, marketingOptOut: false, smsOptIn: true, doNotService: false, contacts: [],
};

const sel = inputCls;
const add = "inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-semibold text-blue hover:text-blue-deep";
const del = "grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-red-50 hover:text-red-700";
const group = "mb-1 text-sm font-semibold";
// Repeatable phone / email rows share one grid (type, value, texts, remove). Phones: tighter padding so a full number shows at 390px.
const rowCls = "grid items-center gap-1.5 sm:gap-2 max-sm:[&_input:not([type=checkbox])]:px-2 max-sm:[&_select]:px-1.5";
const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-3 py-2.5 text-sm">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
    <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-ink-soft">{hint}</span>}</span>
  </label>
);
const Hint = ({ children }: { children: React.ReactNode }) => <p className="-mt-2 mb-3 text-xs text-ink-soft">{children}</p>;
const blankContact: Contact = { role: "", firstName: "", lastName: "", phone: "", email: "", isBilling: false, receivesTexts: false };

export function ClientForm({ action, id, initial = emptyClient, isNew, mapsKey, communities, leadSources, phoneLabels, titles, error }: {
  action: (f: FormData) => Promise<void>; id?: string; initial?: ClientFormValues; isNew: boolean; mapsKey?: string;
  communities: { code: string; name: string }[]; leadSources: string[]; phoneLabels: string[]; titles: string[]; error?: string;
}) {
  const [v, setV] = useState(initial);
  const [showContacts, setShowContacts] = useState(initial.contacts.length > 0);
  const payload = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ClientFormValues>(k: K, val: ClientFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const upd = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const property = isNew && String(f.get("p_formatted") ?? "").trim() ? {
      formatted: String(f.get("p_formatted")), lat: num("p_lat"), lng: num("p_lng"), placeId: f.get("p_placeId") || null, postalCode: f.get("p_postalCode") || null,
      communityCode: f.get("p_communityCode") || null, accessNotes: f.get("p_accessNotes") || null, gateCode: f.get("p_gateCode") || null,
    } : undefined;
    payload.current!.value = JSON.stringify({
      ...v, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
      contacts: v.contacts.map((c) => ({ ...c, role: c.role || undefined, phone: c.phone || undefined, email: c.email || undefined })),
      title: v.title || undefined, companyName: v.companyName || undefined, leadSource: v.leadSource || undefined, notes: v.notes || undefined, property,
    });
  }

  return (
    <form action={action} onSubmit={onSubmit}>
      {id && <input type="hidden" name="id" value={id} />}
      <input ref={payload} type="hidden" name="payload" />
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Primary contact">
            <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[5.75rem_minmax(0,1fr)_minmax(0,1fr)]">
              <Field label="Title"><select value={v.title} onChange={(e) => set("title", e.target.value)} className={sel}>{titles.map((t) => <option key={t} value={t}>{t || "None"}</option>)}</select></Field>
              <Field label="First name"><input required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} /></Field>
              <div className="max-sm:col-span-2"><Field label="Last name"><input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} /></Field></div>
            </div>
            <div className="mt-3"><Field label="Company name (optional)"><input value={v.companyName} onChange={(e) => set("companyName", e.target.value)} className={inputCls} /></Field></div>
          </Card>
          <Card title="Contact details">
            <p className={group} id="cf-phones">Phone</p>
            <div className="space-y-2" role="group" aria-labelledby="cf-phones">
              {v.phones.map((p, i) => (
                <div key={i} className={`${rowCls} ${v.phones.length > 1 ? "grid-cols-[5.25rem_minmax(0,1fr)_auto_2.25rem] sm:grid-cols-[5.75rem_minmax(0,1fr)_auto_2.25rem]" : "grid-cols-[5.25rem_minmax(0,1fr)_auto] sm:grid-cols-[5.75rem_minmax(0,1fr)_auto]"}`}>
                  <select aria-label="Phone type" value={p.label} onChange={(e) => set("phones", upd(v.phones, i, { label: e.target.value }))} className={sel}>{phoneLabels.map((l) => <option key={l}>{l}</option>)}</select>
                  <input aria-label="Phone number" type="tel" inputMode="tel" placeholder="403-555-0101" value={p.number} onChange={(e) => set("phones", upd(v.phones, i, { number: e.target.value }))} className={inputCls} />
                  <label className="flex min-h-10 items-center gap-1.5 text-[13px] font-medium sm:pl-1" title="This number can get text messages"><input type="checkbox" checked={p.sms} onChange={(e) => set("phones", upd(v.phones, i, { sms: e.target.checked }))} className="size-4" />Texts</label>
                  {v.phones.length > 1 && <button type="button" onClick={() => set("phones", v.phones.filter((_, j) => j !== i))} aria-label="Remove phone" className={del}><Trash2 className="size-4" aria-hidden /></button>}
                </div>
              ))}
              <button type="button" onClick={() => set("phones", [...v.phones, { number: "", label: "Home", sms: false }])} className={add}><Plus className="size-4" aria-hidden />Add phone</button>
            </div>
            <p className={`${group} mt-4`} id="cf-emails">Email</p>
            <div className="space-y-2" role="group" aria-labelledby="cf-emails">
              {v.emails.map((m, i) => (
                <div key={i} className={`${rowCls} ${v.emails.length > 1 ? "grid-cols-[5.25rem_minmax(0,1fr)_2.25rem] sm:grid-cols-[5.75rem_minmax(0,1fr)_2.25rem]" : "grid-cols-[5.25rem_minmax(0,1fr)] sm:grid-cols-[5.75rem_minmax(0,1fr)]"}`}>
                  <select aria-label="Email type" value={m.label} onChange={(e) => set("emails", upd(v.emails, i, { label: e.target.value }))} className={sel}>{["Main", "Work", "Billing", "Other"].map((l) => <option key={l}>{l}</option>)}</select>
                  <input aria-label="Email" type="email" placeholder="name@example.com" value={m.address} onChange={(e) => set("emails", upd(v.emails, i, { address: e.target.value }))} className={inputCls} />
                  {v.emails.length > 1 && <button type="button" onClick={() => set("emails", v.emails.filter((_, j) => j !== i))} aria-label="Remove email" className={del}><Trash2 className="size-4" aria-hidden /></button>}
                </div>
              ))}
              <button type="button" onClick={() => set("emails", [...v.emails, { address: "", label: "Work" }])} className={add}><Plus className="size-4" aria-hidden />Add email</button>
            </div>
          </Card>
          <Card title="Additional details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Lead source"><select value={v.leadSource} onChange={(e) => set("leadSource", e.target.value)} className={sel}><option value="">Not set</option>{leadSources.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Tags" hint="Separate tags with commas"><input value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="senior, corner lot" className={inputCls} /></Field>
            </div>
            <div className="mt-3"><Field label="Client notes"><textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Things to know about this client" className={inputCls} /></Field></div>
            <div className={`mt-4 rounded-lg border px-3 ${v.doNotService ? "border-red-200 bg-red-50" : "border-line-soft bg-tint/60"}`}>
              <Toggle checked={v.doNotService} onChange={(x) => set("doNotService", x)} label="Do not service" hint="Shows a red warning on this client and their requests. Say why in the notes." />
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          {isNew && (
            <Card title="Property">
              <Hint>Where the work happens. You can add more properties later.</Hint>
              <p className={group}>Address</p>
              <AddressField mapsKey={mapsKey} communities={communities} prefix="p_" required={false} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Gate or door code"><input name="p_gateCode" className={inputCls} /></Field>
                <Field label="Access notes"><input name="p_accessNotes" placeholder="Dog, side gate…" className={inputCls} /></Field>
              </div>
            </Card>
          )}
          <Card title="Communication settings">
            <Hint>Automatic messages this client gets.</Hint>
            <div className="divide-y divide-line-soft">
              <Toggle checked={v.smsOptIn} onChange={(x) => set("smsOptIn", x)} label="Text message updates" hint="On the way, done with photos, invoices (they said yes to texts)" />
              <Toggle checked={v.visitReminders} onChange={(x) => set("visitReminders", x)} label="Visit reminders" hint="The day before a scheduled visit" />
              <Toggle checked={v.followUpQuotes} onChange={(x) => set("followUpQuotes", x)} label="Quote follow-ups" hint="A nudge 3 days after a quote goes unanswered" />
              <Toggle checked={v.followUpInvoices} onChange={(x) => set("followUpInvoices", x)} label="Overdue invoice reminders" hint="At 3 and 10 days past due" />
              <Toggle checked={!v.marketingOptOut} onChange={(x) => set("marketingOptOut", !x)} label="Review requests & plan renewals" />
            </div>
          </Card>
          <Card title="Additional contacts">
            <Hint>Spouse, tenant, property manager…</Hint>
            {showContacts ? (
              <div className="space-y-3">
                {v.contacts.map((c, i) => (
                  <fieldset key={c.id ?? i} className="rounded-lg bg-tint p-3">
                    <legend className="sr-only">Contact {i + 1}</legend>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2">
                        <input aria-label="Role" placeholder="Role (e.g. Spouse)" value={c.role} onChange={(e) => set("contacts", upd(v.contacts, i, { role: e.target.value }))} className={inputCls} />
                        <button type="button" onClick={() => set("contacts", v.contacts.filter((_, j) => j !== i))} aria-label={`Remove contact ${i + 1}`} className={del}><Trash2 className="size-4" aria-hidden /></button>
                      </div>
                      <input aria-label="Contact first name" placeholder="First name" value={c.firstName} onChange={(e) => set("contacts", upd(v.contacts, i, { firstName: e.target.value }))} className={inputCls} />
                      <input aria-label="Contact last name" placeholder="Last name" value={c.lastName} onChange={(e) => set("contacts", upd(v.contacts, i, { lastName: e.target.value }))} className={inputCls} />
                      <input aria-label="Contact phone" type="tel" placeholder="Phone" value={c.phone} onChange={(e) => set("contacts", upd(v.contacts, i, { phone: e.target.value }))} className={inputCls} />
                      <input aria-label="Contact email" type="email" placeholder="Email" value={c.email} onChange={(e) => set("contacts", upd(v.contacts, i, { email: e.target.value }))} className={inputCls} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-medium">
                      <label className="flex min-h-8 items-center gap-1.5"><input type="checkbox" checked={c.isBilling} onChange={(e) => set("contacts", upd(v.contacts, i, { isBilling: e.target.checked }))} className="size-4" />Billing contact</label>
                      <label className="flex min-h-8 items-center gap-1.5"><input type="checkbox" checked={c.receivesTexts} onChange={(e) => set("contacts", upd(v.contacts, i, { receivesTexts: e.target.checked }))} className="size-4" />Gets texts</label>
                    </div>
                  </fieldset>
                ))}
                <button type="button" onClick={() => set("contacts", [...v.contacts, { ...blankContact }])} className={add}><Plus className="size-4" aria-hidden />Add contact</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setShowContacts(true); if (!v.contacts.length) set("contacts", [{ ...blankContact }]); }} className={add}><Plus className="size-4" aria-hidden />Add a contact</button>
            )}
          </Card>
        </div>
      </div>
      <div className="sticky bottom-[4.5rem] z-10 mt-5 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-white/95 p-2.5 shadow-lift backdrop-blur sm:bottom-3">
        <Link href={id ? `/clients/${id}` : "/clients"} className={`mr-auto inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-ink-soft hover:text-navy ${isNew ? "max-sm:hidden" : ""}`}>Cancel</Link>
        {isNew && <Button variant="secondary" name="next" value="another" className="max-sm:flex-1 max-sm:px-2.5">Save and create another</Button>}
        <Button name="next" value="view" className={isNew ? "max-sm:px-3" : ""}>Save client</Button>
      </div>
    </form>
  );
}
