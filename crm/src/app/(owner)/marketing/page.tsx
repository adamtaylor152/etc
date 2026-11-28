// Marketing dashboard: review requests (ratings, Google clicks, private feedback), referrals and credits, leads by source.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { DetailHeader } from "@/components/detail-header";
import { Badge } from "@/components/ui";
import { addDays, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { AUTOMATION_KEYS, AUTOMATIONS } from "@/server/ops/automations";
import { parseSettings } from "@/server/settings";
import { saveMarketingSettings } from "./actions";

export const metadata = { title: "Marketing" };

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
  const card = "rounded-lg border border-line bg-white p-4 shadow-card";
  const num = "h-9 w-20 rounded-lg border border-line px-2";
  const hours = Array.from({ length: 25 }, (_, h) => h), hourLabel = (h: number) => (h === 0 || h === 24 ? "midnight" : h === 12 ? "noon" : `${h % 12} ${h < 12 ? "am" : "pm"}`);
  return (
    <>
      <DetailHeader title="Marketing" sub="Last 90 days." actions={<Link href="/marketing/campaigns" className="inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-sm font-semibold text-white">Campaigns</Link>} />
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <section className={card}><h2 className="text-sm font-bold">Review requests sent</h2><p className="mt-2 font-display text-2xl font-bold">{reviews.length}</p><p className="text-xs text-ink-soft">{rated.length} rated · avg {avg}★</p></section>
        <section className={card}><h2 className="text-sm font-bold">Went to Google</h2><p className="mt-2 font-display text-2xl font-bold">{reviews.filter((r) => r.googleClickedAt).length}</p><p className="text-xs text-ink-soft">clicked “Leave a Google review”</p></section>
        <section className={card}><h2 className="text-sm font-bold">Referrals</h2><p className="mt-2 font-display text-2xl font-bold">{referrals.length}</p><p className="text-xs text-ink-soft">{referrals.filter((r) => r.status !== "PENDING").length} qualified</p></section>
        <section className={card}><h2 className="text-sm font-bold">Credits issued</h2><p className="mt-2 font-display text-2xl font-bold">{money(credits._sum.amountCents ?? 0)}</p><p className="text-xs text-ink-soft">all time</p></section>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 text-base font-bold">Recent ratings & feedback</h2>
          <ul className="divide-y divide-line text-sm">
            {reviews.slice(0, 15).map((r) => (
              <li key={r.id} className="py-2"><Link href={`/clients/${r.clientId}`} className="font-semibold text-blue">{names.get(r.clientId)}</Link> <span className="text-ink-soft">· {prettyDate(r.sentAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }))} · {r.channel === "SMS" ? "text" : "email"}</span>
                <span className="ml-2">{r.rating ? <span className={r.rating >= 4 ? "text-amber-500" : "text-red-700"}>{"★".repeat(r.rating)}</span> : <span className="text-ink-soft">no answer</span>}</span>
                {r.feedback && <p className="mt-1 rounded bg-tint p-2 text-ink-soft">“{r.feedback}”</p>}</li>
            ))}
            {!reviews.length && <li className="py-3 text-ink-soft">None yet. Turn on review requests below.</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="mb-2 text-base font-bold">Referrals</h2>
          <ul className="divide-y divide-line text-sm">
            {referrals.slice(0, 15).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2"><span><Link href={`/clients/${r.referrerId}`} className="font-semibold text-blue">{names.get(r.referrerId)}</Link> referred <Link href={`/clients/${r.refereeId}`} className="text-blue">{names.get(r.refereeId)}</Link></span>
                <Badge tone={r.status === "REWARDED" ? "green" : r.status === "QUALIFIED" ? "blue" : "gray"}>{r.status === "PENDING" ? "Booked" : r.status === "QUALIFIED" ? "Credit issued" : "Credit used"}</Badge></li>
            ))}
            {!referrals.length && <li className="py-3 text-ink-soft">No referrals yet. Each client&apos;s share link is in their client hub and on their client page.</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="mb-2 text-base font-bold">Automated emails</h2>
          <ul className="divide-y divide-line text-sm">
            {AUTOMATION_KEYS.map((k) => {
              const a = autos.find((x) => x.automation === k);
              return (
                <li key={k}><Link href={`/marketing/automations/${k.toLowerCase()}`} className="flex items-center justify-between gap-3 py-2 hover:bg-tint">
                  <span><span className="font-semibold text-blue">{AUTOMATIONS[k].name}</span><span className="block text-xs text-ink-soft">{AUTOMATIONS[k].blurb}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">{a?._count.recipients ? `${a._count.recipients} reached` : ""}<Badge tone={a?.automationOn ? "green" : "gray"}>{a?.automationOn ? "on" : "off"}</Badge></span>
                </Link></li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">Open one to see who would get it, edit the wording and switch it on. Unanswered quotes are nudged by quote follow-ups (Settings).</p>
        </section>
        <section className={card}>
          <h2 className="mb-2 text-base font-bold">New clients by source</h2>
          <ul className="space-y-1 text-sm">{leads.sort((a, b) => b._count - a._count).map((l) => <li key={l.leadSource ?? "none"} className="flex justify-between"><span>{l.leadSource ?? "Not set"}</span><span className="font-semibold">{l._count}</span></li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="mb-2 text-base font-bold">Settings</h2>
          <form action={saveMarketingSettings} className="space-y-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="reviewRequests" defaultChecked={s.reviewRequests} className="size-4" />Send review requests {!biz.googleReviewUrl && <span className="text-amber-700">(add your Google review link in Settings first)</span>}</label>
            <label className="flex flex-wrap items-center gap-2">Send <input name="reviewDelayHours" type="number" min={1} max={240} defaultValue={s.reviewDelayHours} className={num} /> hours after a visit is done (by text if they get texts, otherwise email)</label>
            <label className="flex flex-wrap items-center gap-2">Ask <select name="reviewTrigger" defaultValue={s.reviewTrigger} className="h-9 rounded-lg border border-line bg-white px-2"><option value="first">after the first job of the season (once per 6 months)</option><option value="every">after every job, but at most once per…</option></select>
              <input name="reviewCapMonths" type="number" min={1} max={36} defaultValue={s.reviewCapMonths} aria-label="Months between asks" className={num} /> months <span className="text-ink-soft">(the number is for “every job”)</span></label>
            <label className="flex flex-wrap items-center gap-2">Never ask a client who rated us in the last <input name="reviewRatedMonths" type="number" min={1} max={60} defaultValue={s.reviewRatedMonths} className={num} /> months</label>
            <label className="flex flex-wrap items-center gap-2"><input type="checkbox" name="reviewFollowUp" defaultChecked={s.reviewFollowUp} className="size-4" />Remind once after <input name="reviewFollowUpDays" type="number" min={1} max={30} defaultValue={s.reviewFollowUpDays} className={num} /> days if they haven&apos;t rated</label>
            <label className="flex items-center gap-2">Referrer gets $<input name="referralReward" type="number" min={0} step="1" defaultValue={s.referralRewardCents / 100} className="h-9 w-20 rounded-lg border border-line px-2" /> credit when the new client&apos;s first invoice is paid</label>
            <label className="flex items-center gap-2">New client gets $<input name="referralDiscount" type="number" min={0} step="1" defaultValue={s.referralDiscountCents / 100} className="h-9 w-20 rounded-lg border border-line px-2" /> off their first invoice</label>
            <h3 className="border-t border-line pt-3 font-bold">Missed calls</h3>
            <label className="flex flex-wrap items-center gap-2"><input type="checkbox" name="missedCallText" defaultChecked={s.missedCallText} className="size-4" />Text back a caller nobody answered, between
              <select name="missedCallFromHour" defaultValue={s.missedCallFromHour} aria-label="From" className="h-9 rounded-lg border border-line bg-white px-2">{hours.slice(0, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select> and
              <select name="missedCallToHour" defaultValue={s.missedCallToHour} aria-label="To" className="h-9 rounded-lg border border-line bg-white px-2">{hours.slice(1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></label>
            <p className="text-xs text-ink-soft">“Sorry we missed your call! Reply here by text, or book at…” Once per number per day, never to a number that texted STOP, and a “Call back” task lands on today. A call missed outside those hours gets its text when they start. Calls your phone&apos;s voicemail picked up count as answered, so they get no text.</p>
            <h3 className="border-t border-line pt-3 font-bold">Skipped visits</h3>
            <label className="flex items-center gap-2"><input type="checkbox" name="skipNotice" defaultChecked={s.skipNotice} className="size-4" />Tell the client (text and email) when a visit is skipped because:</label>
            <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">{([["BLOCKED_BY_CAR", "a car was in the way"], ["NO_ACCESS", "we couldn’t get in"], ["WEATHER", "the weather"]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="skipNoticeReasons" value={k} defaultChecked={s.skipNoticeReasons.includes(k)} className="size-4" />{l}</label>)}</div>
            <p className="text-xs text-ink-soft">Says what happened, that there&apos;s no charge, and what to do next. Never sent for “already clear”, “below trigger”, “client cancelled” or “other”. Goes 3 minutes after the skip; reopening the visit in that time stops it.</p>
            <button className="min-h-10 rounded-lg bg-blue px-4 font-semibold text-white">Save</button>
          </form>
        </section>
      </div>
    </>
  );
}
