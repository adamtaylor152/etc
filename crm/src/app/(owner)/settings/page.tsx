// Settings index: every business-wide setting in named sections (jump list on the left), plus the way in to the
// settings that have a page of their own (price book, team, checklists, route, messages & branding).
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, ListChecks, Megaphone, MessageSquareText, Route, Tags, Users } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash } from "@/components/flash";
import { InlineField, Saved, SwitchRow, inlineCls, inlineRow, numCls } from "@/components/settings/fields";
import { SectionNav } from "@/components/settings/section-nav";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, btn, inputCls } from "@/components/ui";
import { dateOnly } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { env } from "@/server/env";
import { parseSettings, SETTING_DAYS, SETTING_LABELS, type ToggleKey } from "@/server/settings";
import { stripeEnabled } from "@/server/stripe";
import { quoteTemplateDelete, quoteTemplateRename, saveAutomations, saveBusiness, saveSchedule, saveSeason, saveTax } from "./actions";

export const metadata = { title: "Settings" };

const SECTIONS = [
  { id: "business", label: "Business" },
  { id: "schedule", label: "Schedule & reminders" },
  { id: "automations", label: "Automations" },
  { id: "quotes", label: "Quotes" },
  { id: "payments", label: "Invoices & payments" },
  { id: "snow", label: "Snow" },
  { id: "team", label: "Team" },
];
/** Which section a `?saved=` value belongs to, so its notice shows there. */
const SAVED_IN: Record<string, string> = { business: "business", schedule: "schedule", automations: "automations", templates: "quotes", tax: "payments", season: "snow" };

const PAGES = [
  { href: "/settings/price-book", label: "Price book", text: "Services and prices for quotes, jobs, invoices and online booking.", icon: Tags },
  { href: "/settings/team", label: "Team", text: "Who can sign in, their working hours, time off and route start.", icon: Users },
  { href: "/settings/checklists", label: "Checklists", text: "What the crew ticks off on a visit before it can be marked done.", icon: ListChecks },
  { href: "/settings/route", label: "Route", text: "The order routes visit communities in, and minutes per stop.", icon: Route },
  { href: "/settings/messages", label: "Messages & branding", text: "Your wording for client emails and texts, logo, colour and quick replies.", icon: MessageSquareText },
  { href: "/marketing", label: "Reviews & referrals", text: "Review request timing, referral credits, missed calls and skipped-visit notices.", icon: Megaphone },
];

// The automation switches, grouped by what they affect. A switch that isn't listed here still shows, under "Other".
const AUTOMATION_GROUPS: { title: string; keys: ToggleKey[] }[] = [
  { title: "Visits", keys: ["visitReminders", "reminderMorningOf", "clientReschedule", "onMyWayEmail", "visitDoneEmail", "smsUpdates", "skipNotice", "stormHeadsUp"] },
  { title: "Quotes", keys: ["quoteFollowUp", "quoteFollowUp2"] },
  { title: "Invoices & payments", keys: ["autoSendVisitInvoices", "allowPartialPayments", "tipsEnabled", "autoPay", "lateFee"] },
  { title: "Reviews & marketing", keys: ["reviewRequests", "reviewFollowUp", "missedCallText"] },
  { title: "You and the team", keys: ["snowAlert", "dailyDigest", "assignmentAlerts"] },
];

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";

function Group({ id, title, sub, children }: { id: string; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <h2 id={`${id}-h`} className="font-display text-lg font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 max-w-[70ch] text-sm text-ink-soft">{sub}</p>}
      <div className="mt-3 space-y-5">{children}</div>
    </section>
  );
}
const H3 = ({ children }: { children: ReactNode }) => <h3 className="font-display text-[0.95rem] font-semibold">{children}</h3>;

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const biz = await business();
  const settings = parseSettings(biz.settings);
  const [seasons, users, area, templates] = await Promise.all([
    db.season.findMany({ where: { businessId: bid }, orderBy: { startsOn: "desc" } }),
    db.user.findMany({ where: { businessId: bid }, orderBy: { email: "asc" } }),
    db.serviceCommunity.findMany({ where: { businessId: bid, active: true }, include: { community: true }, orderBy: { sortOrder: "asc" } }),
    db.quoteTemplate.findMany({ where: { businessId: bid }, orderBy: { name: "asc" } }),
  ]);
  const saved = one(sp.saved);
  const allKeys = Object.keys(SETTING_LABELS) as ToggleKey[];
  const grouped = new Set(AUTOMATION_GROUPS.flatMap((g) => g.keys));
  const rest = allKeys.filter((k) => !grouped.has(k));
  const groups = [...AUTOMATION_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => k in SETTING_LABELS) })), ...(rest.length ? [{ title: "Other", keys: rest }] : [])];
  const cards = stripeEnabled();

  const toggle = (k: ToggleKey) => {
    const days = k in SETTING_DAYS ? SETTING_DAYS[k as keyof typeof SETTING_DAYS] : null;
    return (
      <SwitchRow key={k} name={k} defaultChecked={settings[k]} label={SETTING_LABELS[k][0]} description={SETTING_LABELS[k][1]}>
        {days && <InlineField>{k === "lateFee" ? "Add it" : "Send"} <input name={days} type="number" min={1} max={60} defaultValue={settings[days]} className={numCls} /> {k === "lateFee" ? "days past due" : "days after the quote is sent"}</InlineField>}
        {k === "lateFee" && <InlineField>Fee: $<input name="lateFeeDollars" type="number" min={0} max={1000} step="0.01" defaultValue={(settings.lateFeeCents / 100).toFixed(2)} aria-label="Flat late fee" className={`${inlineCls} w-24`} /> plus <input name="lateFeePercent" type="number" min={0} max={25} step="0.5" defaultValue={settings.lateFeeBps / 100} aria-label="Percent of balance" className={numCls} /> % of what is owing</InlineField>}
        {k === "autoPay" && (
          <>
            <InlineField>Wait <input name="autoPayGraceDays" type="number" min={0} max={14} defaultValue={settings.autoPayGraceDays} aria-label="Auto-pay: days between the invoice email and the charge" className={numCls} /> days between the invoice email and the charge</InlineField>
            <p className="text-xs text-ink-soft">{cards ? "Time for the client to object. 0 = charged the same day. Never before the invoice is due." : "Needs card payments (Stripe) turned on."}</p>
          </>
        )}
      </SwitchRow>
    );
  };

  return (
    <>
      <PageHeader title="Settings" sub="How the business runs: what clients are told and when, how you get paid, and who can sign in." />
      <Flash error={sp.error} />

      <nav aria-label="More settings" className="mb-6 grid overflow-hidden rounded-xl border border-line bg-white shadow-card sm:grid-cols-2 xl:grid-cols-3">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="group -mb-px -mr-px flex min-h-16 items-center gap-3 border-b border-r border-line-soft px-4 py-3 hover:bg-tint">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tint text-ink-soft group-hover:bg-white"><p.icon className="size-[18px]" strokeWidth={1.75} aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{p.label}</span><span className="block text-xs text-ink-soft">{p.text}</span></span>
            <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
          </Link>
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-8">
        <SectionNav sections={SECTIONS} pages={PAGES.map(({ href, label }) => ({ href, label }))} focus={SAVED_IN[saved]} />

        <div className="max-w-[54rem] space-y-10">
          <Group id="business" title="Business" sub="Your name and contact details, as clients see them on emails, quotes and invoices.">
            <Card>
              <Saved when={saved === "business"} />
              <form action={saveBusiness} className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><Input name="name" defaultValue={biz.name} required /></Field>
                <Field label="Legal name" hint="On invoices and the Stripe account (an adult)"><Input name="legalName" defaultValue={biz.legalName ?? ""} /></Field>
                <Field label="Phone"><Input name="phone" defaultValue={biz.phone ?? ""} /></Field>
                <Field label="Help email"><Input name="helpEmail" type="email" defaultValue={biz.helpEmail ?? ""} /></Field>
                <Field label="Website"><Input name="website" defaultValue={biz.website ?? ""} /></Field>
                <Field label="e-Transfer email" hint="Turn on Autodeposit at your bank"><Input name="etransferEmail" type="email" defaultValue={biz.etransferEmail ?? ""} /></Field>
                <div className="sm:col-span-2"><Field label="Google review link" hint="For review requests"><Input name="googleReviewUrl" defaultValue={biz.googleReviewUrl ?? ""} /></Field></div>
                <div className="sm:col-span-2"><Field label="Mailing address" hint="Shown in marketing emails (Canada's anti-spam law requires it)"><Input name="mailingAddress" defaultValue={biz.mailingAddress ?? ""} placeholder="Street, Calgary AB T2Y ..." /></Field></div>
                <Field label="Route start (home)" hint="Routes and ETAs run from here unless a person has their own start"><Input name="depotAddress" defaultValue={biz.depotAddress ?? ""} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude"><Input name="depotLat" defaultValue={biz.depotLat ?? ""} inputMode="decimal" className="tabular-nums" /></Field>
                  <Field label="Longitude"><Input name="depotLng" defaultValue={biz.depotLng ?? ""} inputMode="decimal" className="tabular-nums" /></Field>
                </div>
                <div className="pt-1 sm:col-span-2"><Button>Save business</Button></div>
              </form>
            </Card>
          </Group>

          <Group id="schedule" title="Schedule & reminders" sub="When visit reminders go out, and the arrival windows clients can pick.">
            <Card>
              <Saved when={saved === "schedule"} />
              <form action={saveSchedule} className="space-y-5">
                <div className="space-y-2">
                  <H3>Visit reminders</H3>
                  <div className={inlineRow}>
                    Remind clients <input name="reminderDaysBefore" type="number" min={1} max={7} defaultValue={settings.reminderDaysBefore} aria-label="Days before" className={`${inlineCls} w-16`} /> day(s) before, at
                    <select name="reminderHour" defaultValue={settings.reminderHour} aria-label="Hour" className={inlineCls}>
                      {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h % 12 || 12} {h < 12 ? "am" : "pm"}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-ink-soft">Reminders are switched on and off under <a href="#automations" className="font-medium text-blue hover:underline">Automations</a>.</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <H3>Arrival windows</H3>
                    <p className="text-sm text-ink-soft">Offered in online booking and as one-tap times on the schedule forms.</p>
                  </div>
                  <div className="hidden grid-cols-[1fr_8rem_8rem] gap-2 text-xs font-medium text-ink-soft sm:grid"><span>Name</span><span>From</span><span>To</span></div>
                  <div className="space-y-3 sm:space-y-2">
                    {[...settings.arrivalWindows, ...Array.from({ length: Math.max(0, 6 - settings.arrivalWindows.length) }, () => ({ key: "", label: "", from: "", to: "" }))].map((w, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8rem_8rem]">
                        <input type="hidden" name="winKey" value={w.key} />
                        <Input name="winLabel" defaultValue={w.label} placeholder={w.key ? undefined : "Add a window"} maxLength={20} aria-label={`Window ${i + 1} name`} className="col-span-2 sm:col-span-1" />
                        <Input name="winFrom" type="time" defaultValue={w.from} aria-label={`Window ${i + 1} from`} className="tabular-nums" />
                        <Input name="winTo" type="time" defaultValue={w.to} aria-label={`Window ${i + 1} to`} className="tabular-nums" />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-ink-soft">Clear a name to remove that window. Times already booked keep their own start and end.</p>
                </div>
                <Button>Save reminders &amp; windows</Button>
              </form>
            </Card>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <H3>Service area</H3>
                  <p className="mt-1 text-sm">{area.length ? area.map((a) => a.community.name).join(", ") : "No communities yet."}</p>
                  <p className="mt-2 max-w-[70ch] text-xs text-ink-soft">Routes visit communities in this order. Addresses outside it still work; they land under &quot;No community&quot; until pinned.</p>
                </div>
                <Link href="/settings/route" className={btn("secondary")}>Change the order &amp; stop times</Link>
              </div>
            </Card>
          </Group>

          <Group id="automations" title="Automations" sub="What the app does on its own. One Save at the bottom covers every switch in this section.">
            <Card>
              <Saved when={saved === "automations"} />
              <form action={saveAutomations}>
                <div className="divide-y divide-line-soft">
                  {groups.map((g) => (
                    <div key={g.title} role="group" aria-labelledby={`auto-${g.title.replace(/\W+/g, "-")}`} className="py-4 first:pt-0">
                      <h3 id={`auto-${g.title.replace(/\W+/g, "-")}`} className="mb-1 font-display text-[0.95rem] font-semibold">{g.title}</h3>
                      {g.keys.map(toggle)}
                    </div>
                  ))}
                </div>
                <div className="border-t border-line-soft pt-4"><Button>Save automations</Button></div>
              </form>
            </Card>
          </Group>

          <Group id="quotes" title="Quotes" sub="Templates fill a new quote with your usual line items.">
            <Card>
              <Saved when={saved === "templates"} />
              <H3>Quote templates</H3>
              {templates.length > 0 ? (
                <ul className="mt-2 divide-y divide-line-soft">
                  {templates.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <form action={quoteTemplateRename} className="flex min-w-0 flex-1 basis-64 gap-2"><input type="hidden" name="id" value={t.id} /><Input name="name" defaultValue={t.name} required maxLength={80} aria-label="Template name" /><Button variant="secondary">Rename</Button></form>
                      <form action={quoteTemplateDelete}><input type="hidden" name="id" value={t.id} /><ConfirmButton message={`Delete the template "${t.name}"? Quotes already made from it are not affected.`} className={btn("danger")} aria-label={`Delete the template ${t.name}`}>Delete</ConfirmButton></form>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3"><Empty action={<Link href="/quotes" className={btn("secondary")}>Go to quotes</Link>}>No templates yet. Open any quote and choose “Save as template”.</Empty></div>
              )}
              {templates.length > 0 && <p className="mt-3 text-xs text-ink-soft">Open any quote and choose “Save as template”; pick the template when you start a new quote.</p>}
            </Card>
          </Group>

          <Group id="payments" title="Invoices & payments" sub="GST, when invoices fall due and card payments. Late fees, tips and auto-pay are under Automations.">
            <Card>
              <Saved when={saved === "tax"} />
              <form action={saveTax} className="space-y-3">
                <SwitchRow name="taxRegistered" defaultChecked={biz.taxRegistered} label="GST registered" description="Leave off while under the $30,000 small-supplier threshold: no GST is charged or shown." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="GST number"><Input name="taxNumber" defaultValue={biz.taxNumber ?? ""} placeholder="123456789 RT0001" /></Field>
                  <Field label="Rate (%)"><Input name="taxRate" type="number" step="0.01" defaultValue={biz.taxRateBps / 100} className="tabular-nums" /></Field>
                </div>
                <SwitchRow name="pricesIncludeTax" defaultChecked={biz.pricesIncludeTax} label="Prices include GST" description="The prices you enter already have GST in them." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Invoice due">
                    <select name="terms" defaultValue={biz.defaultPaymentTerms} className={inputCls}>
                      <option value="DUE_ON_RECEIPT">On receipt</option><option value="NET_7">7 days</option><option value="NET_15">15 days</option><option value="NET_30">30 days</option>
                    </select>
                  </Field>
                  <div>
                    <span className="mb-1 block text-sm font-semibold">Card payments</span>
                    <div className="flex min-h-10 flex-wrap items-center gap-2 text-sm"><Badge tone={cards ? "green" : "gray"}>{cards ? "On (Stripe)" : "Off"}</Badge>{!cards && <span className="text-xs text-ink-soft">Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to turn on.</span>}</div>
                  </div>
                </div>
                <div className="pt-1"><Button>Save GST &amp; payments</Button></div>
              </form>
            </Card>
          </Group>

          <Group id="snow" title="Snow" sub="A season is the stretch a snow plan covers. The trigger is the snowfall, in centimetres, that calls for a clearing.">
            <Card>
              <Saved when={saved === "season"} />
              <H3>Seasons</H3>
              <div className="divide-y divide-line-soft">
                {[...seasons, null].map((se) => (
                  <form key={se?.id ?? "new"} action={saveSeason} className="grid items-end gap-3 py-4 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_6rem_auto]">
                    <input type="hidden" name="id" value={se?.id ?? ""} />
                    <Field label={se ? "Season" : "New season"}><Input name="name" defaultValue={se?.name ?? ""} placeholder="Winter 2027–28" required /></Field>
                    <Field label="Starts"><Input name="startsOn" type="date" defaultValue={dateOnly(se?.startsOn) ?? ""} required className="tabular-nums" /></Field>
                    <Field label="Ends"><Input name="endsOn" type="date" defaultValue={dateOnly(se?.endsOn) ?? ""} required className="tabular-nums" /></Field>
                    <Field label="Trigger (cm)"><Input name="defaultTriggerCm" type="number" min={0} max={50} defaultValue={se?.defaultTriggerCm ?? 2} className="tabular-nums" /></Field>
                    <div><Button variant="secondary">{se ? "Save" : "Add season"}</Button></div>
                  </form>
                ))}
              </div>
            </Card>
          </Group>

          <Group id="team" title="Team" sub="Everyone who can sign in with an email link.">
            <Card>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <H3>Who can sign in</H3>
                <Link href="/settings/team" className={btn("secondary")}>Manage the team</Link>
              </div>
              <ul className="divide-y divide-line-soft">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="min-w-0 break-all font-medium">{u.email}</span>
                    <Badge tone={u.lastLoginAt ? "green" : "gray"}>{u.lastLoginAt ? "Signed in before" : "Never signed in"}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-soft">Set by OWNER_EMAILS on the server ({env.ownerEmails.length} configured). Change it in Coolify and redeploy.</p>
            </Card>
          </Group>
        </div>
      </div>
    </>
  );
}
