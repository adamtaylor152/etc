import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { hm, jobProfit } from "@/server/ops/costing";
import { team } from "@/server/schedule";
// Reports: money in by month, what sells, where the work is, storms, quotes, tuition.
// Single-series horizontal bars (one hue), every row labelled with its value.
import { Amount } from "@/components/billing/money";
import { Bars } from "@/components/reports/bars";
import { RangeBar, rangeLabel } from "@/components/reports/range-bar";
import { Card, PageHeader, Stat } from "@/components/ui";
import { instants, parseRange, PRESETS, REPORTS } from "@/server/reports";
import { TZ, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";

export const metadata = { title: "Reports" };

// The tabular reports, grouped by what the owner is asking about. Anything not listed lands under "More".
const GROUPS: [string, string[]][] = [
  ["Money", ["aged-receivables", "payments", "invoices", "gst", "gst-paid"]],
  ["Work", ["jobs", "quotes", "plan-profit", "community-profit", "materials"]],
  ["Clients", ["client-balances", "lead-source"]],
  ["Team", ["timesheets"]],
];

/** Server-side "now" math kept out of the component body. */
function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }

const monthKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).slice(0, 7);
const monthLabel = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" });

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  await requireOwner();
  const r = parseRange(await searchParams, todayLocal(), "12m");
  const when = instants(r);
  const bid = await businessId();
  const today = todayLocal();
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
    db.payment.findMany({ where: { businessId: bid, receivedAt: when }, include: { invoice: { select: { propertyId: true } } } }),
    db.invoiceLineItem.findMany({ where: { invoice: { businessId: bid, status: { in: ["PAID", "AWAITING_PAYMENT"] }, issuedOn: { gte: toDbDate(r.from), lte: toDbDate(r.to) } } }, select: { name: true, totalCents: true } }),
    db.season.findFirst({ where: { businessId: bid, startsOn: { lte: toDbDate(today) }, endsOn: { gte: toDbDate(today) } }, include: { events: { include: { visits: { select: { state: true } }, invoices: { select: { totalCents: true, status: true } } } } } }),
    db.quote.groupBy({ by: ["status"], where: { businessId: bid, sentAt: when }, _count: true }),
    db.visit.count({ where: { businessId: bid, state: "COMPLETED", completedAt: when } }),
  ]);

  // Money in by month (last 12).
  const byMonth = new Map<string, number>();
  // Every month the range touches (at most 36), so empty months still show.
  for (let k = r.from.slice(0, 7), n = 0; k <= r.to.slice(0, 7) && n < 36; n++) { byMonth.set(k, 0); const [y, m] = k.split("-").map(Number); k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
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

  const grouped = new Set(GROUPS.flatMap(([, keys]) => keys));
  const rest = Object.keys(REPORTS).filter((k) => !grouped.has(k));
  const index = [...GROUPS, ...(rest.length ? [["More", rest] as [string, string[]]] : [])].map(([name, keys]) => [name, keys.filter((k) => REPORTS[k])] as const).filter(([, keys]) => keys.length);
  const period = rangeLabel(r.from, r.to);

  return (
    <>
      <PageHeader title="Reports" sub={`${period}, unless a card says otherwise. Card fees aren't subtracted.`} />
      <RangeBar base="/reports" presets={PRESETS} range={r} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money in" value={cad(total)} sub="payments received, after refunds" />
        <Stat label="Visits done" value={visitsDone.toLocaleString("en-CA")} sub="completed in the period" />
        <Stat label="Quotes approved" value={sent ? `${Math.round((100 * won) / sent)}%` : "–"} sub={sent ? `${won} of ${sent} sent` : "no quotes sent in the period"} />
        <Stat label="Storms this season" value={String(storms.length)} sub={season?.name ?? "no season running"} />
      </div>

      <Card title="Detailed reports" className="no-print mb-5">
        <nav aria-label="Detailed reports" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {index.map(([name, keys]) => (
            <div key={name}>
              <h3 className="mb-1 border-b border-line pb-1.5 text-xs font-medium text-ink-soft">{name}</h3>
              <ul>
                {keys.map((k) => (
                  <li key={k}>
                    <Link href={`/reports/${k}${REPORTS[k].ranged ? `?from=${r.from}&to=${r.to}` : ""}`} className="group -mx-2 flex min-h-11 items-start gap-2 rounded-lg px-2 py-2 hover:bg-tint">
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-blue group-hover:text-blue-deep">{REPORTS[k].title}</span><span className="block text-xs text-ink-soft">{REPORTS[k].sub}</span></span>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Money in by month"><Bars rows={[...byMonth].map(([k, v]) => [monthLabel(k), v])} empty="No payments in this period." /></Card>
        <Card title="Invoiced by service"><Bars rows={top(byService)} empty="No invoices issued in this period." /></Card>
        <Card title="Money in by community"><Bars rows={top(byCommunity)} empty="No payments in this period." /></Card>
        <Card title={`Storms · ${season?.name ?? "no season"}`}>
          {storms.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs font-medium text-ink-soft"><th scope="col" className="pb-2 font-medium">Storm</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Snow (cm)</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Visits done</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Invoiced</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {storms.map((e) => (
                    <tr key={e.id}><td className="py-2">{e.name}</td><td className="py-2 pl-3 text-right tabular-nums">{e.measuredCm ?? <span className="text-ink-soft"><span className="sm:hidden" aria-hidden>–</span><span className="sr-only sm:not-sr-only">not measured</span></span>}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{e.visits.filter((v) => v.state === "COMPLETED").length} of {e.visits.filter((v) => v.state !== "CANCELLED").length}</td>
                      <td className="py-2 pl-3 text-right"><Amount cents={e.invoices.filter((i) => i.status !== "VOID").reduce((a, i) => a + i.totalCents, 0)} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-ink-soft">No storms yet this season.</p>}
        </Card>
        <Card title="Hours by person · past 30 days">
          <Bars rows={hours.map((h) => [h.name, h.minutes])} format={hm} empty="No time tracked yet. Start timers on visits." />
        </Card>
        <Card title="Profit by job · past 90 days">
          {profits.length ? (
            <ul className="divide-y divide-line-soft text-sm">
              {profits.map((p) => (
                <li key={p.id}>
                  <Link href={`/jobs/${p.id}`} className="group flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate group-hover:text-blue-deep"><span className="tabular-nums text-ink-soft">#{p.number}</span> {p.title}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {p.marginPct != null && <span className="text-xs tabular-nums text-ink-soft">{p.marginPct}% margin</span>}
                      <span className={`w-24 text-right ${p.profitCents < 0 ? "text-red-700" : ""}`}><Amount cents={p.profitCents} className="font-medium" />{p.profitCents < 0 && <span className="sr-only"> loss</span>}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">Profit shows once jobs have time or expenses logged.</p>}
        </Card>
      </div>
    </>
  );
}
