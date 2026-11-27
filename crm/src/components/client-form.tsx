"use client";
// New/Edit client, laid out like Jobber's: primary contact, phones (label + receives texts), emails, lead source,
// tags, communication preferences, additional contacts, and (new clients) a property address.
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AddressField } from "./address-field";

type Phone = { number: string; label: string; sms: boolean };
type Email = { address: string; label: string };
type Contact = { id?: string; role: string; firstName: string; lastName: string; phone: string; email: string; isBilling: boolean; receivesTexts: boolean };
export type ClientFormValues = {
  title: string; firstName: string; lastName: string; companyName: string; phones: Phone[]; emails: Email[]; leadSource: string; tags: string; notes: string;
  followUpQuotes: boolean; followUpInvoices: boolean; visitReminders: boolean; marketingOptOut: boolean; smsOptIn: boolean; contacts: Contact[];
};
export const emptyClient: ClientFormValues = {
  title: "", firstName: "", lastName: "", companyName: "", phones: [{ number: "", label: "Mobile", sms: true }], emails: [{ address: "", label: "Main" }],
  leadSource: "", tags: "", notes: "", followUpQuotes: true, followUpInvoices: true, visitReminders: true, marketingOptOut: false, smsOptIn: true, contacts: [],
};

const inp = "min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-base outline-none focus:border-blue focus:ring-2 focus:ring-blue/20";
const sel = "min-h-10 rounded-lg border border-line bg-white px-2 text-sm";
const Section = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <section className="rounded-lg border border-line bg-white p-4 shadow-card sm:p-5">
    <h2 className="text-base font-bold">{title}</h2>{hint && <p className="mb-3 text-xs text-ink-soft">{hint}</p>}<div className={hint ? "" : "mt-3"}>{children}</div>
  </section>
);
const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-3 py-1.5 text-sm">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4" />
    <span><span className="font-semibold">{label}</span>{hint && <span className="block text-xs text-ink-soft">{hint}</span>}</span>
  </label>
);

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
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      {id && <input type="hidden" name="id" value={id} />}
      <input ref={payload} type="hidden" name="payload" />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="Primary contact">
            <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2">
              <select aria-label="Title" value={v.title} onChange={(e) => set("title", e.target.value)} className={sel}>{titles.map((t) => <option key={t} value={t}>{t || "Title"}</option>)}</select>
              <input aria-label="First name" placeholder="First name" required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} className={inp} />
              <input aria-label="Last name" placeholder="Last name" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} className={inp} />
            </div>
            <input aria-label="Company name" placeholder="Company name (optional)" value={v.companyName} onChange={(e) => set("companyName", e.target.value)} className={`${inp} mt-2`} />
          </Section>
          <Section title="Contact details">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Phone</p>
            <div className="space-y-2">
              {v.phones.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select aria-label="Phone type" value={p.label} onChange={(e) => set("phones", upd(v.phones, i, { label: e.target.value }))} className={sel}>{phoneLabels.map((l) => <option key={l}>{l}</option>)}</select>
                  <input aria-label="Phone number" type="tel" inputMode="tel" placeholder="403-555-0101" value={p.number} onChange={(e) => set("phones", upd(v.phones, i, { number: e.target.value }))} className={`${inp} min-w-0 flex-1`} />
                  <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={p.sms} onChange={(e) => set("phones", upd(v.phones, i, { sms: e.target.checked }))} className="size-4" />Texts</label>
                  {v.phones.length > 1 && <button type="button" onClick={() => set("phones", v.phones.filter((_, j) => j !== i))} aria-label="Remove phone" className="p-1 text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button>}
                </div>
              ))}
              <button type="button" onClick={() => set("phones", [...v.phones, { number: "", label: "Home", sms: false }])} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add phone</button>
            </div>
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Email</p>
            <div className="space-y-2">
              {v.emails.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select aria-label="Email type" value={m.label} onChange={(e) => set("emails", upd(v.emails, i, { label: e.target.value }))} className={sel}>{["Main", "Work", "Billing", "Other"].map((l) => <option key={l}>{l}</option>)}</select>
                  <input aria-label="Email" type="email" placeholder="name@example.com" value={m.address} onChange={(e) => set("emails", upd(v.emails, i, { address: e.target.value }))} className={`${inp} min-w-0 flex-1`} />
                  {v.emails.length > 1 && <button type="button" onClick={() => set("emails", v.emails.filter((_, j) => j !== i))} aria-label="Remove email" className="p-1 text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button>}
                </div>
              ))}
              <button type="button" onClick={() => set("emails", [...v.emails, { address: "", label: "Work" }])} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add email</button>
            </div>
          </Section>
          <Section title="Additional details">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Lead source
                <select value={v.leadSource} onChange={(e) => set("leadSource", e.target.value)} className={`${sel} mt-1 w-full`}><option value="">—</option>{leadSources.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <label className="text-sm font-semibold">Tags
                <input value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="senior, corner lot" className={`${inp} mt-1`} />
              </label>
            </div>
            <label className="mt-3 block text-sm font-semibold">Client notes
              <textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Things to know about this client" className={`${inp} mt-1`} />
            </label>
          </Section>
        </div>
        <div className="space-y-4">
          {isNew && (
            <Section title="Property" hint="Where the work happens. You can add more properties later.">
              <AddressField mapsKey={mapsKey} communities={communities} prefix="p_" required={false} />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input name="p_gateCode" placeholder="Gate / door code" className={inp} />
                <input name="p_accessNotes" placeholder="Access notes (dog, side gate…)" className={inp} />
              </div>
            </Section>
          )}
          <Section title="Communication settings" hint="Automatic messages this client gets.">
            <Toggle checked={v.smsOptIn} onChange={(x) => set("smsOptIn", x)} label="Text message updates" hint="On the way, done with photos, invoices (they said yes to texts)" />
            <Toggle checked={v.visitReminders} onChange={(x) => set("visitReminders", x)} label="Visit reminders" hint="The day before a scheduled visit" />
            <Toggle checked={v.followUpQuotes} onChange={(x) => set("followUpQuotes", x)} label="Quote follow-ups" hint="A nudge 3 days after a quote goes unanswered" />
            <Toggle checked={v.followUpInvoices} onChange={(x) => set("followUpInvoices", x)} label="Overdue invoice reminders" hint="At 3 and 10 days past due" />
            <Toggle checked={!v.marketingOptOut} onChange={(x) => set("marketingOptOut", !x)} label="Review requests & plan renewals" />
          </Section>
          <Section title="Additional contacts" hint="Spouse, tenant, property manager…">
            {showContacts ? (
              <div className="space-y-3">
                {v.contacts.map((c, i) => (
                  <div key={c.id ?? i} className="space-y-2 rounded-lg border border-line p-3">
                    <div className="flex gap-2">
                      <input aria-label="Role" placeholder="Role (e.g. Spouse)" value={c.role} onChange={(e) => set("contacts", upd(v.contacts, i, { role: e.target.value }))} className={inp} />
                      <button type="button" onClick={() => set("contacts", v.contacts.filter((_, j) => j !== i))} aria-label="Remove contact" className="p-1 text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input aria-label="Contact first name" placeholder="First name" value={c.firstName} onChange={(e) => set("contacts", upd(v.contacts, i, { firstName: e.target.value }))} className={inp} />
                      <input aria-label="Contact last name" placeholder="Last name" value={c.lastName} onChange={(e) => set("contacts", upd(v.contacts, i, { lastName: e.target.value }))} className={inp} />
                      <input aria-label="Contact phone" type="tel" placeholder="Phone" value={c.phone} onChange={(e) => set("contacts", upd(v.contacts, i, { phone: e.target.value }))} className={inp} />
                      <input aria-label="Contact email" type="email" placeholder="Email" value={c.email} onChange={(e) => set("contacts", upd(v.contacts, i, { email: e.target.value }))} className={inp} />
                    </div>
                    <div className="flex gap-4 text-xs font-semibold">
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.isBilling} onChange={(e) => set("contacts", upd(v.contacts, i, { isBilling: e.target.checked }))} className="size-4" />Billing contact</label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.receivesTexts} onChange={(e) => set("contacts", upd(v.contacts, i, { receivesTexts: e.target.checked }))} className="size-4" />Gets texts</label>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => set("contacts", [...v.contacts, { role: "", firstName: "", lastName: "", phone: "", email: "", isBilling: false, receivesTexts: false }])} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add contact</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setShowContacts(true); if (!v.contacts.length) set("contacts", [{ role: "", firstName: "", lastName: "", phone: "", email: "", isBilling: false, receivesTexts: false }]); }} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add a contact</button>
            )}
          </Section>
        </div>
      </div>
      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-lg border border-line bg-white/95 p-3 shadow-card backdrop-blur sm:bottom-2">
        {isNew && <button name="next" value="another" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Save and create another</button>}
        <button name="next" value="view" className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white hover:bg-blue/90">Save client</button>
      </div>
    </form>
  );
}
