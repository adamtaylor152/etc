// One automated campaign: on/off, its few numbers, the wording (same blocks as a campaign), who is due right now, and results.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignBlocks } from "@/components/campaign-blocks";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { InlineField, numCls } from "@/components/settings/fields";
import { Badge, Button, Card, Empty, Field, Input, Notice, Stat, btn } from "@/components/ui";
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
  return (
    <>
      <DetailHeader back={{ href: "/marketing", label: "Marketing" }} kind="Automated email" status={<Badge tone={c.automationOn ? "green" : "gray"}>{c.automationOn ? "On" : "Off"}</Badge>} title={AUTOMATIONS[key].name} sub={AUTOMATIONS[key].blurb} />
      <Flash error={sp.error} />
      {sp.saved && <Notice tone="good">Saved.</Notice>}
      {sp.tested && <Notice tone="good">Test sent to the owners&apos; inboxes.</Notice>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Due right now" value={dueNow} tone={dueNow && !c.automationOn ? "warn" : undefined} sub={dueNow && !c.automationOn ? "waiting: this is switched off" : undefined} />
        <Stat label="Sent" value={stats.sent} />
        <Stat label="Opened (approx.)" value={stats.opened} />
        <Stat label="Clicked" value={stats.clicked} />
      </div>
      <form action={automationSave} className="space-y-5">
        <input type="hidden" name="key" value={key} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="When it sends" actions={<Badge tone={c.automationOn ? "green" : "gray"}>{c.automationOn ? "Switched on" : "Switched off"}</Badge>}>
            <div className="space-y-3 text-sm">
              {key === "WINBACK" ? (
                <>
                  <InlineField>Last visit at least <input name="months" type="number" min={1} max={36} defaultValue={cfg.months} className={numCls} /> months ago</InlineField>
                  <p className="max-w-[70ch] text-ink-soft">Only clients with nothing booked, no quote waiting and no open request, who can get marketing email (consent, not unsubscribed, not bounced). Each client gets it at most once in 12 months.</p>
                </>
              ) : (
                <>
                  <InlineField>First email <input name="daysBefore" type="number" min={1} max={120} defaultValue={cfg.daysBefore} className={numCls} /> days before the season starts</InlineField>
                  <InlineField>One reminder <input name="reminderDays" type="number" min={0} max={60} defaultValue={cfg.reminderDays} className={numCls} /> days later (0 = none)</InlineField>
                  <p className="max-w-[70ch] text-ink-soft">{!renewal!.season ? "No season to renew into yet: add next season in Settings."
                    : !renewal!.firstOn ? `No earlier season before ${renewal!.season.name}, so there is nobody to ask.`
                    : `For ${renewal!.season.name}: first emails go from ${prettyDate(renewal!.firstOn)} until the season starts. Clients who unsubscribed are skipped, and anyone who renews drops off this list.`}</p>
                </>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" name="next" value="save">Save &amp; update the list</Button>
                <Button variant="secondary" name="next" value="test">Send a test to the owners</Button>
                {c.automationOn
                  ? <button name="next" value="off" className={btn("danger")}>Switch off</button>
                  : <Button name="next" value="on">Switch on{dueNow ? ` (${dueNow} due now)` : ""}</Button>}
              </div>
              <p className="text-xs text-ink-soft">Runs hourly between 9 am and 7 pm. Emails already in the outbox still go out after switching off.</p>
            </div>
          </Card>

          <Card title={winBack ? "Who would get it right now" : "Last season's plan clients who haven't renewed"} actions={<span className="text-sm tabular-nums text-ink-soft">{rows.length}</span>}>
            {rows.length > 0 ? (
              <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto text-sm">
                {rows.slice(0, 100).map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-x-3 py-2"><Link href={`/clients/${r.id}`} className="font-semibold text-blue hover:underline">{r.name}</Link><span className="tabular-nums text-ink-soft">{r.note}</span></li>)}
                {rows.length > 100 && <li className="py-2 text-ink-soft">and {rows.length - 100} more</li>}
              </ul>
            ) : <Empty>Nobody right now. People appear here as they come due.</Empty>}
          </Card>
        </div>

        <Card title="Email">
          <div className="space-y-4">
            <div className="max-w-2xl"><Field label="Subject"><Input name="subject" defaultValue={c.subject ?? ""} /></Field></div>
            <CampaignBlocks initial={c.blocks as Block[]} />
            {key === "RENEWAL" && <p className="text-xs text-ink-soft">Keep {RENEW_LINK} as the button&apos;s link: it becomes each client&apos;s own page, where “Renew my plan” is one tap.</p>}
            {!biz.mailingAddress && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950">Add your business mailing address in <Link href="/settings#business" className="underline">Settings</Link> before switching this on (Canada&apos;s anti-spam law requires it).</p>}
            <div><Button variant="secondary" name="next" value="save">Save email</Button></div>
          </div>
        </Card>
      </form>
    </>
  );
}
