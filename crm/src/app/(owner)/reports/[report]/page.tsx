// One tabular report (see src/server/reports.ts): date range, totals row, CSV download.
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailHeader } from "@/components/detail-header";
import { Button, Card, Input } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { money } from "@/server/money";
import { parseRange, PRESETS, reportSeason, REPORTS, totals, type Kind } from "@/server/reports";

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const user = await requireOwner();
  const { report } = await params;
  const def = REPORTS[report];
  if (!def) notFound();
  const sp = await searchParams;
  const r = parseRange(sp);
  // Snow plan reports are per season, not per date range.
  const picked = def.seasonal ? await reportSeason(user.businessId, typeof sp.season === "string" ? sp.season : undefined) : null;
  const t = await def.run(user.businessId, { ...r, season: picked?.season?.id });
  const sums = totals(t);
  const qs = def.ranged ? `?from=${r.from}&to=${r.to}` : picked?.season ? `?season=${picked.season.id}` : "";
  const show = (v: string | number | null, k: Kind) => (v == null ? "" : k === "money" ? money(v as number) : String(v));
  return (
    <>
      <DetailHeader back={{ href: "/reports", label: "Reports" }} title={def.title} sub={def.sub}
        actions={<a href={`/api/export/report/${report}${qs}`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Download CSV</a>} />
      {def.ranged && (
        <form className="no-print mb-4 flex flex-wrap items-end gap-2 text-sm">
          {Object.entries(PRESETS).map(([k, label]) => <Link key={k} href={`/reports/${report}?range=${k}`} className={`rounded-full border px-3 py-1.5 font-semibold ${r.preset === k ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>{label}</Link>)}
          <label className="ml-2">From<Input type="date" name="from" defaultValue={r.from} /></label>
          <label>To<Input type="date" name="to" defaultValue={r.to} /></label>
          <Button variant="secondary">Show</Button>
        </form>
      )}
      {picked && picked.seasons.length > 1 && (
        <p className="no-print mb-4 flex flex-wrap gap-2 text-sm">
          {picked.seasons.map((s) => <Link key={s.id} href={`/reports/${report}?season=${s.id}`} className={`rounded-full border px-3 py-1.5 font-semibold ${picked.season?.id === s.id ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>{s.name}</Link>)}
        </p>
      )}
      <Card>
        {t.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-ink-soft">{t.columns.map(([l, k]) => <th key={l} className={`whitespace-nowrap pb-2 pr-3 ${k === "text" ? "" : "text-right"}`}>{l}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {t.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className={`py-1.5 pr-3 ${t.columns[j][1] === "text" ? "" : "text-right tabular-nums"}`}>{show(v, t.columns[j][1])}</td>)}</tr>)}
              </tbody>
              <tfoot className="border-t-2 border-navy font-semibold">
                <tr>{sums.map((s, j) => <td key={j} className={`pt-2 pr-3 ${t.columns[j][1] === "text" ? "" : "text-right tabular-nums"}`}>{j === 0 ? `Total (${t.rows.length})` : show(s, t.columns[j][1])}</td>)}</tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="text-sm text-ink-soft">Nothing to show{def.ranged ? " for these dates" : ""}.</p>}
        {t.note && <p className="mt-3 text-xs text-ink-soft">{t.note}</p>}
      </Card>
    </>
  );
}
