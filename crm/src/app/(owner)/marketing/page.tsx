// Marketing dashboard: review requests (ratings, Google clicks, private feedback), referrals and credits, leads by source.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Flash } from "@/components/flash";
import { InlineField, Saved, SwitchRow, inlineCls, numCls } from "@/components/settings/fields";
import { Badge, Button, ButtonLink, Card, Empty, PageHeader, Stat, btn } from "@/components/ui";
import { addDays, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { AUTOMATION_KEYS, AUTOMATIONS } from "@/server/ops/automations";
import { parseSettings } from "@/server/settings";
import { saveMarketingSettings } from "./actions";

export const metadata = { title: "Marketing" };

const H3 = ({ children }: { children: ReactNode }) => <h3 className="mb-1 font-display text-[0.95rem] font-semibold">{children}</h3>;

export default async function Marketing({ searchParams }: PageProps<"/marketing">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const since = localDayStart(addDays(todayLocal(), -90));
  const [autos, biz, reviews, referrals, credits, leads] = await Promise.all([
    db.campaign.findMany({ where: { businessId: bid, automation: { not: null } }, include: { _count: { select: { recipients: true } } } }),
    db.business.findUniqueOrThrow({ where: { id: bid } }),
    db.reviewRequest.findMany({ where: { businessId: bid, sentAt: { gte: since } }, orderBy: { sentAt: "desc" } }),
    db.referral.findMany({ where: { businessId: bid }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.clientCredit.aggregate({ where: { businessId: bid }, _sum: { amountCents: true } }),
    db.client.groupBy({ by: ["leadSource"], where: { businessId: bid, createdAt: { gte: since } }, _count: true }),
  ]);
  const s = parseSettings(biz.settings);
  const rated = reviews.filter((r) => r.rating);
  const avg = rated.length ? (rated.reduce((n, r) => n + r.rating!, 0) / rated.length).toFixed(1) : "—";
  const ids = [...new Set([...referrals.flatMap((r) => [r.referrerId, r.refereeId]), ...reviews.map((r) => r.clientId)])];
  const names = new Map((ids.length ? await db.client.findMany({ where: { id: { in: ids } } }) : []).map((c) => [c.id, clientName(c)]));
  const hours = Array.from({ length: 25 }, (_, h) => h), hourLabel = (h: number) => (h === 0 || h === 24 ? "midnight" : h === 12 ? "noon" : `${h % 12} ${h < 12 ? "am" : "pm"}`);
  const sentOn = (d: Date) => prettyDate(d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }));
  return (
    <>
      <PageHeader title="Marketing" sub="Reviews, referrals and where new clients come from. Last 90 days." actions={<ButtonLink href="/marketing/campaigns">Campaigns</ButtonLink>} />
      <Flash error={sp.error} />
      <Saved when={!!sp.saved} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Review requests sent" value={reviews.length} sub={`${rated.length} rated · average ${avg}${rated.length ? " out of 5" : ""}`} />
        <Stat label="Went to Google" value={reviews.filter((r) => r.googleClickedAt).length} sub="clicked “Leave a Google review”" />
        <Stat label="Referrals" value={referrals.length} sub={`${referrals.filter((r) => r.status !== "PENDING").length} qualified`} />
        <Stat label="Credits issued" value={cad(credits._sum.amountCents ?? 0)} sub="all time" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Recent ratings & feedback">
          {reviews.length > 0 ? (
            <ul className="divide-y divide-line-soft text-sm">
              {reviews.slice(0, 15).map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <Link href={`/clients/${r.clientId}`} className="font-semibold text-blue hover:underline">{names.get(r.clientId)}</Link>
                    {r.rating
                      ? <span className="whitespace-nowrap"><span aria-hidden className={r.rating >= 4 ? "text-amber-600" : "text-red-700"}>{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span> <span className="font-semibold tabular-nums">{r.rating} out of 5</span></span>
                      : <span className="text-ink-soft">No answer yet</span>}
                  </div>
                  <p className="text-xs tabular-nums text-ink-soft">Asked {sentOn(r.sentAt)} by {r.channel === "SMS" ? "text" : "email"}</p>
                  {r.feedback && <p className="mt-1.5 max-w-[70ch] rounded-lg bg-tint px-3 py-2 text-ink-soft">“{r.feedback}”</p>}
                </li>
              ))}
            </ul>
          ) : <Empty action={<a href="#settings" className={btn("secondary")}>Review request settings</a>}>No review requests in the last 90 days. Turn them on and clients are asked after a visit.</Empty>}
        </Card>

        <Card title="Referrals">
          {referrals.length > 0 ? (
            <ul className="divide-y divide-line-soft text-sm">
              {referrals.slice(0, 15).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0"><Link href={`/clients/${r.referrerId}`} className="font-semibold text-blue hover:underline">{names.get(r.referrerId)}</Link> referred <Link href={`/clients/${r.refereeId}`} className="font-medium text-blue hover:underline">{names.get(r.refereeId)}</Link></span>
                  <Badge tone={r.status === "REWARDED" ? "green" : r.status === "QUALIFIED" ? "blue" : "gray"}>{r.status === "PENDING" ? "Booked" : r.status === "QUALIFIED" ? "Credit issued" : "Credit used"}</Badge>
                </li>
              ))}
            </ul>
          ) : <Empty>No referrals yet. Each client&apos;s share link is in their client hub and on their client page.</Empty>}
        </Card>

        <Card title="Automated emails">
          <ul className="divide-y divide-line-soft">
            {AUTOMATION_KEYS.map((k) => {
              const a = autos.find((x) => x.automation === k);
              return (
                <li key={k}>
                  <Link href={`/marketing/automations/${k.toLowerCase()}`} className="group -mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-tint">
                    <span className="min-w-0 flex-1"><span className="block font-semibold group-hover:text-blue-deep">{AUTOMATIONS[k].name}</span><span className="block text-sm text-ink-soft">{AUTOMATIONS[k].blurb}</span></span>
                    <span className="flex shrink-0 flex-col items-end gap-1"><Badge tone={a?.automationOn ? "green" : "gray"}>{a?.automationOn ? "On" : "Off"}</Badge>{a?._count.recipients ? <span className="text-xs tabular-nums text-ink-soft">{a._count.recipients} reached</span> : null}</span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 max-w-[70ch] text-xs text-ink-soft">Open one to see who would get it, edit the wording and switch it on. Unanswered quotes are nudged by quote follow-ups (Settings).</p>
        </Card>

        <Card title="New clients by source">
          {leads.length > 0 ? (
            <ul className="divide-y divide-line-soft text-sm">
              {leads.sort((a, b) => b._count - a._count).map((l) => <li key={l.leadSource ?? "none"} className="flex justify-between gap-3 py-2"><span className={l.leadSource ? "" : "text-ink-soft"}>{l.leadSource ?? "Not set"}</span><span className="font-semibold tabular-nums">{l._count}</span></li>)}
            </ul>
          ) : <Empty>No new clients in the last 90 days.</Empty>}
        </Card>

        <Card title="Reviews, referrals and notices" className="lg:col-span-2">
          <form id="settings" action={saveMarketingSettings} className="scroll-mt-32">
            <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2 [&>*]:min-w-0">
              <div>
                <H3>Review requests</H3>
                <SwitchRow name="reviewRequests" defaultChecked={s.reviewRequests} label="Send review requests" description="By text if they get texts, otherwise email.">
                  {!biz.googleReviewUrl && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-medium text-amber-950">Add your Google review link in <Link href="/settings#business" className="underline">Settings</Link> first.</p>}
                  <InlineField>Send <input name="reviewDelayHours" type="number" min={1} max={240} defaultValue={s.reviewDelayHours} className={numCls} /> hours after a visit is done</InlineField>
                  <InlineField>Ask <select name="reviewTrigger" defaultValue={s.reviewTrigger} className={`${inlineCls} max-w-full`}><option value="first">after the first job of the season (once per 6 months)</option><option value="every">after every job, but at most once per…</option></select>
                    <input name="reviewCapMonths" type="number" min={1} max={36} defaultValue={s.reviewCapMonths} aria-label="Months between asks" className={numCls} /> months <span className="text-ink-soft">(the number is for “every job”)</span></InlineField>
                  <InlineField>Never ask a client who rated us in the last <input name="reviewRatedMonths" type="number" min={1} max={60} defaultValue={s.reviewRatedMonths} className={numCls} /> months</InlineField>
                </SwitchRow>
                <SwitchRow name="reviewFollowUp" defaultChecked={s.reviewFollowUp} label="Remind once" description="One reminder if they haven’t rated.">
                  <InlineField>Remind after <input name="reviewFollowUpDays" type="number" min={1} max={30} defaultValue={s.reviewFollowUpDays} className={numCls} /> days</InlineField>
                </SwitchRow>
                <div className="mt-5 space-y-2">
                  <H3>Referrals</H3>
                  <InlineField>Referrer gets $<input name="referralReward" type="number" min={0} step="1" defaultValue={s.referralRewardCents / 100} className={numCls} /> credit when the new client&apos;s first invoice is paid</InlineField>
                  <InlineField>New client gets $<input name="referralDiscount" type="number" min={0} step="1" defaultValue={s.referralDiscountCents / 100} className={numCls} /> off their first invoice</InlineField>
                </div>
              </div>
              <div>
                <H3>Missed calls</H3>
                <SwitchRow name="missedCallText" defaultChecked={s.missedCallText} label="Text back a caller nobody answered" description="“Sorry we missed your call! Reply here by text, or book at…”">
                  <InlineField>Between
                    <select name="missedCallFromHour" defaultValue={s.missedCallFromHour} aria-label="From" className={inlineCls}>{hours.slice(0, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select> and
                    <select name="missedCallToHour" defaultValue={s.missedCallToHour} aria-label="To" className={inlineCls}>{hours.slice(1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></InlineField>
                  <p className="max-w-[70ch] text-xs text-ink-soft">Once per number per day, never to a number that texted STOP, and a “Call back” task lands on today. A call missed outside those hours gets its text when they start. Calls your phone&apos;s voicemail picked up count as answered, so they get no text.</p>
                </SwitchRow>
                <div className="mt-5">
                  <H3>Skipped visits</H3>
                  <SwitchRow name="skipNotice" defaultChecked={s.skipNotice} label="Tell the client when a visit is skipped" description="By text and email, when it was skipped because:">
                    <div className="flex flex-wrap gap-x-5">
                      {([["BLOCKED_BY_CAR", "a car was in the way"], ["NO_ACCESS", "we couldn’t get in"], ["WEATHER", "the weather"]] as const).map(([k, l]) => <label key={k} className="flex min-h-10 items-center gap-2"><input type="checkbox" name="skipNoticeReasons" value={k} defaultChecked={s.skipNoticeReasons.includes(k)} className="size-5" />{l}</label>)}
                    </div>
                    <p className="max-w-[70ch] text-xs text-ink-soft">Says what happened, that there&apos;s no charge, and what to do next. Never sent for “already clear”, “below trigger”, “client cancelled” or “other”. Goes 3 minutes after the skip; reopening the visit in that time stops it.</p>
                  </SwitchRow>
                </div>
              </div>
            </div>
            <div className="mt-5 border-t border-line-soft pt-4"><Button>Save marketing settings</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
