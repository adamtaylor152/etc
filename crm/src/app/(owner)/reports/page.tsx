import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { hm, jobProfit } from "@/server/ops/costing";
import { team } from "@/server/schedule";
// Reports: money in by month, what sells, where the work is, storms, quotes, tuition.
// Single-series horizontal bars (one hue), every row labelled with its value; hover shows the exact figure.
import { Card, PageHeader } from "@/components/ui";
import { TZ, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";

export const metadata = { title: "Reports" };

function Bars({ rows, format = money, empty }: { rows: [string, number][]; format?: (n: number) => string; empty: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map(([label, v]) => (
        <li key={label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-sm" title={`${label}: ${format(v)}`}>
          <span className="truncate text-ink-soft">{label}</span>
          <span className="h-4 rounded-r bg-tint"><span className="block h-4 rounded-r bg-blue" style={{ width: v > 0 ? `${Math.max(2, (100 * v) / max)}%` : 0 }} /></span>
          <span className="min-w-14 text-right font-semibold tabular-nums">{format(v)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Server-side "now" math kept out of the component body. */
function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }

const monthKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).slice(0, 7);
const monthLabel = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" });

export default async function Reports() {
  await requireOwner();
  const bid = await businessId();
  const today = todayLocal();
  const yearAgo = daysAgo(365);
  const since30 = daysAgo(30), since90 = daysAgo(90);
  const [timeRows, people, costedJobs] = await Promise.all([
    db.timeEntry.groupBy({ by: ["userId"], where: { businessId: bid, startedAt: { gte: since30 }, endedAt: { not: null } }, _sum: { minutes: true } }),
    team(bid),
    Promise.all([
      db.expense.findMany({ where: { businessId: bid, jobId: { not: null }, date: { gte: since90 } }, select: { jobId: true }, distinct: ["jobId"] }),
      db.timeEntry.findMany({ where: { businessId: bid, jobId: { not: null }, startedAt: { gte: since90 } }, select: { jobId: true }, distinct: ["jobId"] }),
    ]).then(([a, b]) => db.job.findMany({ where: { businessId: bid, id: { in: [...new Set([...a, ...b].map((r) => r.jobId!))] } }, select: { id: true, number: true, title: true }, take: 15 })),
  ]);
  const hours = people.map((p) => ({ ...p, minutes: timeRows.find((r) => r.userId === p.id)?._sum.minutes ?? 0 })).filter((h) => h.minutes > 0);
  const profits = (await Promise.all(costedJobs.map(async (j) => ({ ...j, ...(await jobProfit(bid, j.id)) })))).sort((a, b) => b.profitCents - a.profitCents);
  const [payments, lines, season, quotes, visitsDone] = await Promise.all([
    db.payment.findMany({ where: { businessId: bid, receivedAt: { gte: yearAgo } }, include: { invoice: { select: { propertyId: true } } } }),
    db.invoiceLineItem.findMany({ where: { invoice: { businessId: bid, status: { in: ["PAID", "AWAITING_PAYMENT"] }, issuedOn: { gte: yearAgo } } }, select: { name: true, totalCents: true } }),
    db.season.findFirst({ where: { businessId: bid, startsOn: { lte: toDbDate(today) }, endsOn: { gte: toDbDate(today) } }, include: { events: { include: { visits: { select: { state: true } }, invoices: { select: { totalCents: true, status: true } } } } } }),
    db.quote.groupBy({ by: ["status"], where: { businessId: bid, sentAt: { not: null } }, _count: true }),
    db.visit.count({ where: { businessId: bid, state: "COMPLETED", completedAt: { gte: yearAgo } } }),
  ]);

  // Money in by month (last 12).
  const byMonth = new Map<string, number>();
  for (let i = 11; i >= 0; i--) { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); byMonth.set(monthKey(d), 0); }
  for (const p of payments) { const k = monthKey(p.receivedAt); if (byMonth.has(k)) byMonth.set(k, byMonth.get(k)! + p.amountCents - p.refundedCents); }
  const total = [...byMonth.values()].reduce((a, b) => a + b, 0);

  // What sells (invoice lines, storm suffixes folded together).
  const byService = new Map<string, number>();
  for (const l of lines) { const name = l.name.split(" · ")[0]; byService.set(name, (byService.get(name) ?? 0) + l.totalCents); }

  // Where the money comes from (community of the invoiced property).
  const props = await db.property.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.invoice.propertyId).filter((x): x is string => !!x))] } }, include: { community: true } });
  const commOf = new Map(props.map((p) => [p.id, p.community?.name ?? "No community"]));
  const byCommunity = new Map<string, number>();
  for (const p of payments) { const c = commOf.get(p.invoice.propertyId ?? "") ?? "No community"; byCommunity.set(c, (byCommunity.get(c) ?? 0) + p.amountCents - p.refundedCents); }

  const top = (m: Map<string, number>, n = 10) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  const sent = quotes.reduce((a, q) => a + q._count, 0);
  const won = quotes.filter((q) => q.status === "APPROVED" || q.status === "CONVERTED").reduce((a, q) => a + q._count, 0);
  const storms = season?.events.filter((e) => e.status !== "CANCELLED") ?? [];

  return (
    <>
      <PageHeader title="Reports" sub="Last 12 months unless noted. Card fees aren't subtracted." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Money in (12 mo)", money(total)], ["Visits done (12 mo)", String(visitsDone)], ["Quotes approved", sent ? `${Math.round((100 * won) / sent)}%` : "–"], ["Storms this season", String(storms.length)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-white p-4"><div className="font-display text-3xl font-bold">{v}</div><div className="text-sm text-ink-soft">{l}</div></div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Hours by person · past 30 days">
          {hours.length ? <ul className="space-y-1.5 text-sm">{hours.map((h) => <li key={h.name} className="flex justify-between"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: h.color }} />{h.name}</span><span className="font-semibold">{hm(h.minutes)}</span></li>)}</ul> : <p className="text-sm text-ink-soft">No time tracked yet. Start timers on visits.</p>}
        </Card>
        <Card title="Profit by job · past 90 days">
          {profits.length ? (
            <ul className="divide-y divide-line text-sm">
              {profits.map((p) => <li key={p.id}><Link href={`/jobs/${p.id}`} className="flex justify-between gap-2 py-1.5"><span className="truncate">#{p.number} {p.title}</span><span className={`font-semibold ${p.profitCents < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(p.profitCents)}{p.marginPct != null && <span className="ml-1 font-normal text-ink-soft">{p.marginPct}%</span>}</span></Link></li>)}
            </ul>
          ) : <p className="text-sm text-ink-soft">Profit shows once jobs have time or expenses logged.</p>}
        </Card>
        <Card title="Money in by month"><Bars rows={[...byMonth].map(([k, v]) => [monthLabel(k), v])} empty="No payments yet." /></Card>
        <Card title="Invoiced by service"><Bars rows={top(byService)} empty="No invoices yet." /></Card>
        <Card title="Money in by community"><Bars rows={top(byCommunity)} empty="No payments yet." /></Card>
        <Card title={`Storms · ${season?.name ?? "no season"}`}>
          {storms.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-ink-soft"><th className="pb-1">Storm</th><th className="pb-1 text-right">cm</th><th className="pb-1 text-right">Done</th><th className="pb-1 text-right">Invoiced</th></tr></thead>
              <tbody className="divide-y divide-line">
                {storms.map((e) => (
                  <tr key={e.id}><td className="py-1.5">{e.name}</td><td className="text-right">{e.measuredCm ?? "?"}</td>
                    <td className="text-right">{e.visits.filter((v) => v.state === "COMPLETED").length}/{e.visits.filter((v) => v.state !== "CANCELLED").length}</td>
                    <td className="text-right">{money(e.invoices.filter((i) => i.status !== "VOID").reduce((a, i) => a + i.totalCents, 0))}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-ink-soft">No storms yet this season.</p>}
        </Card>
      </div>
    </>
  );
}
