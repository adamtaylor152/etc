// Marketing dashboard: review requests (ratings, Google clicks, private feedback), referrals and credits, leads by source.
import Link from "next/link";
import { DetailHeader } from "@/components/detail-header";
import { Badge } from "@/components/ui";
import { addDays, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { parseSettings } from "@/server/settings";
import { saveMarketingSettings } from "./actions";

export const metadata = { title: "Marketing" };

export default async function Marketing({ searchParams }: PageProps<"/marketing">) {
  const sp = await searchParams;
  const bid = await businessId();
  const since = localDayStart(addDays(todayLocal(), -90));
  const [biz, reviews, referrals, credits, leads] = await Promise.all([
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
  return (
    <>
      <DetailHeader title="Marketing" sub="Last 90 days. Campaigns are coming next." />
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
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
          <h2 className="mb-2 text-base font-bold">New clients by source</h2>
          <ul className="space-y-1 text-sm">{leads.sort((a, b) => b._count - a._count).map((l) => <li key={l.leadSource ?? "none"} className="flex justify-between"><span>{l.leadSource ?? "Not set"}</span><span className="font-semibold">{l._count}</span></li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="mb-2 text-base font-bold">Settings</h2>
          <form action={saveMarketingSettings} className="space-y-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="reviewRequests" defaultChecked={s.reviewRequests} className="size-4" />Send review requests {!biz.googleReviewUrl && <span className="text-amber-700">(add your Google review link in Settings first)</span>}</label>
            <label className="flex items-center gap-2">Send <input name="reviewDelayHours" type="number" min={1} max={240} defaultValue={s.reviewDelayHours} className="h-9 w-20 rounded-lg border border-line px-2" /> hours after a visit is done (by text if they get texts, otherwise email; once per season)</label>
            <label className="flex items-center gap-2">Referrer gets $<input name="referralReward" type="number" min={0} step="1" defaultValue={s.referralRewardCents / 100} className="h-9 w-20 rounded-lg border border-line px-2" /> credit when the new client&apos;s first invoice is paid</label>
            <label className="flex items-center gap-2">New client gets $<input name="referralDiscount" type="number" min={0} step="1" defaultValue={s.referralDiscountCents / 100} className="h-9 w-20 rounded-lg border border-line px-2" /> off their first invoice</label>
            <button className="min-h-10 rounded-lg bg-blue px-4 font-semibold text-white">Save</button>
          </form>
        </section>
      </div>
    </>
  );
}
