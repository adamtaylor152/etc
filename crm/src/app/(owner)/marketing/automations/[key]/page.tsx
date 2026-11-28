// One automated campaign: on/off, its few numbers, the wording (same blocks as a campaign), who is due right now, and results.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignBlocks } from "@/components/campaign-blocks";
import { DetailHeader } from "@/components/detail-header";
import { Badge } from "@/components/ui";
import { prettyDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { AUTOMATION_KEYS, AUTOMATIONS, AutoConfig, automationStats, getAutomation, renewalList, winBackList, type AutomationKey } from "@/server/ops/automations";
import { RENEW_LINK, type Block } from "@/server/ops/campaigns";
import { clientName } from "@/server/queries";
import { automationSave } from "../../automation-actions";

export const metadata = { title: "Automation" };

export default async function AutomationPage({ params, searchParams }: PageProps<"/marketing/automations/[key]">) {
  await requireOwner();
  const key = (await params).key.toUpperCase() as AutomationKey;
  if (!AUTOMATION_KEYS.includes(key)) notFound();
  const sp = await searchParams;
  const bid = await businessId();
  const c = await getAutomation(bid, key);
  const cfg = AutoConfig.parse(c.audience);
  const [biz, stats, winBack, renewal] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: bid } }), automationStats(c),
    key === "WINBACK" ? winBackList(bid, cfg) : null, key === "RENEWAL" ? renewalList(bid, cfg) : null,
  ]);
  // Who would get it if the hourly run happened now, and (renewals) what each person on the list is waiting for.
  const rows: { id: string; name: string; note: string }[] = winBack
    ? winBack.map((d) => ({ id: d.client.id, name: clientName(d.client), note: `last visit ${prettyDate(d.lastVisitAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }))}` }))
    : renewal!.list.map((d) => ({ id: d.client.id, name: clientName(d.client), note: d.step === "first" ? "first email due now" : d.step === "reminder" ? "reminder due now" : d.reminderSent ? "asked twice, no answer" : d.firstSent ? "asked, waiting" : "not asked yet" }));
  const dueNow = winBack ? winBack.length : renewal!.list.filter((d) => d.step).length;
  const num = "h-9 w-20 rounded-lg border border-line px-2";
  const card = "rounded-lg border border-line bg-white p-4 shadow-card";
  return (
    <>
      <DetailHeader back={{ href: "/marketing", label: "Marketing" }} kind="Automated email" status={<Badge tone={c.automationOn ? "green" : "gray"}>{c.automationOn ? "on" : "off"}</Badge>} title={AUTOMATIONS[key].name} sub={AUTOMATIONS[key].blurb} />
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">Saved.</p>}
      {sp.tested && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">Test sent to the owners&apos; inboxes.</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[["Due right now", dueNow], ["Sent", stats.sent], ["Opened (approx.)", stats.opened], ["Clicked", stats.clicked]].map(([l, v]) => (
          <section key={String(l)} className={card}><h2 className="text-sm font-bold">{l}</h2><p className="mt-2 font-display text-2xl font-bold">{v}</p></section>
        ))}
      </div>
      <form action={automationSave} className="grid gap-5 lg:grid-cols-3">
        <input type="hidden" name="key" value={key} />
        <section className={`${card} space-y-3 lg:col-span-2`}>
          <label className="block text-sm font-semibold">Subject<input name="subject" defaultValue={c.subject ?? ""} className="mt-1 min-h-10 w-full rounded-lg border border-line px-3" /></label>
          <CampaignBlocks initial={c.blocks as Block[]} />
          {key === "RENEWAL" && <p className="text-xs text-ink-soft">Keep {RENEW_LINK} as the button&apos;s link: it becomes each client&apos;s own page, where “Renew my plan” is one tap.</p>}
          {!biz.mailingAddress && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Add your business mailing address in <Link href="/settings" className="font-semibold underline">Settings</Link> before switching this on (Canada&apos;s anti-spam law requires it).</p>}
        </section>
        <section className={`${card} space-y-3 text-sm`}>
          <h2 className="text-base font-bold">When</h2>
          {key === "WINBACK" ? (
            <>
              <label className="flex flex-wrap items-center gap-2">Last visit at least <input name="months" type="number" min={1} max={36} defaultValue={cfg.months} className={num} /> months ago</label>
              <p className="text-ink-soft">Only clients with nothing booked, no quote waiting and no open request, who can get marketing email (consent, not unsubscribed, not bounced). Each client gets it at most once in 12 months.</p>
            </>
          ) : (
            <>
              <label className="flex flex-wrap items-center gap-2">First email <input name="daysBefore" type="number" min={1} max={120} defaultValue={cfg.daysBefore} className={num} /> days before the season starts</label>
              <label className="flex flex-wrap items-center gap-2">One reminder <input name="reminderDays" type="number" min={0} max={60} defaultValue={cfg.reminderDays} className={num} /> days later (0 = none)</label>
              <p className="text-ink-soft">{!renewal!.season ? "No season to renew into yet: add next season in Settings."
                : !renewal!.firstOn ? `No earlier season before ${renewal!.season.name}, so there is nobody to ask.`
                : `For ${renewal!.season.name}: first emails go from ${prettyDate(renewal!.firstOn)} until the season starts. Clients who unsubscribed are skipped, and anyone who renews drops off this list.`}</p>
            </>
          )}
          <button name="next" value="save" className="min-h-10 w-full rounded-lg border border-line font-semibold hover:bg-tint">Save &amp; update the list</button>
          <button name="next" value="test" className="min-h-10 w-full rounded-lg border border-line font-semibold hover:bg-tint">Send a test to the owners</button>
          {c.automationOn
            ? <button name="next" value="off" className="min-h-11 w-full rounded-lg border border-red-200 font-semibold text-red-700 hover:bg-red-50">Switch off</button>
            : <button name="next" value="on" className="min-h-11 w-full rounded-lg bg-blue font-semibold text-white">Switch on{dueNow ? ` (${dueNow} due now)` : ""}</button>}
          <p className="text-xs text-ink-soft">Runs hourly between 9 am and 7 pm. Emails already in the outbox still go out after switching off.</p>
        </section>
      </form>
      <section className={`${card} mt-5`}>
        <h2 className="mb-2 text-base font-bold">{winBack ? `Who would get it right now (${rows.length})` : `Last season's plan clients who haven't renewed (${rows.length})`}</h2>
        <ul className="divide-y divide-line text-sm">
          {rows.slice(0, 100).map((r) => <li key={r.id} className="flex justify-between gap-2 py-2"><Link href={`/clients/${r.id}`} className="font-semibold text-blue">{r.name}</Link><span className="text-ink-soft">{r.note}</span></li>)}
          {rows.length > 100 && <li className="py-2 text-ink-soft">and {rows.length - 100} more</li>}
          {!rows.length && <li className="py-3 text-ink-soft">Nobody right now.</li>}
        </ul>
      </section>
    </>
  );
}
