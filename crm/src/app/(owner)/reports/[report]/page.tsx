// One tabular report (see src/server/reports.ts): date range, totals row, CSV download. Prints as a plain report.
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { cad } from "@/components/billing/money";
import { DetailHeader } from "@/components/detail-header";
import { PrintReportButton } from "@/components/reports/print-button";
import { RangeBar, Segmented, dateLabel, rangeLabel } from "@/components/reports/range-bar";
import { ButtonLink, Card, Empty, btn } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { parseRange, PRESETS, reportSeason, REPORTS, totals, type Kind } from "@/server/reports";

// Print: no app chrome, no card, the whole table (not a scroll box), header row repeated on each page. A wide table
// (seven columns or more) turns the page on its side so every column fits; cells wrap instead of running off the edge.
const printCss = (cols: number) => `
@media print {
  @page { margin: 14mm 12mm;${cols >= 7 ? " size: landscape;" : ""} }
  div:has(> #main) { padding-left: 0 !important; }
  #main { max-width: none !important; padding: 0 !important; }
  .report-card { border: 0 !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
  .report-scroll { max-height: none !important; overflow: visible !important; }
  .report-table { font-size: ${cols >= 12 ? "7.5pt" : cols >= 7 ? "8.5pt" : "9.5pt"}; }
  .report-table th, .report-table td { position: static !important; background: transparent !important; padding: 3pt ${cols >= 12 ? "2.5pt" : "4pt"} !important; min-width: 0 !important; max-width: none !important; }
  .report-table th { white-space: normal !important; vertical-align: bottom; font-size: inherit !important; }
  .report-table td.report-long { white-space: normal !important; }
  .report-table thead { display: table-header-group; }
  .report-table tfoot { display: table-row-group; }
  .report-table tr { break-inside: avoid; }
}`;

export async function generateMetadata({ params }: PageProps<"/reports/[report]">) {
  const { report } = await params;
  return { title: REPORTS[report]?.title ?? "Report" };
}

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
  // Stored codes read as words on screen ("AWAITING_PAYMENT" -> "Awaiting payment"); the CSV keeps the raw values.
  const words = (v: string) => (v === "ETRANSFER" ? "e-Transfer" : v === "ONE_OFF" ? "One-off"
    : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : /^([A-Z]{4,}|[A-Z]+(_[A-Z]+)+)$/.test(v) ? v[0] + v.slice(1).toLowerCase().replaceAll("_", " ") : v);
  const show = (v: string | number | null, k: Kind) => (v == null ? "" : k === "money" ? cad(v as number) : k === "num" ? (v as number).toLocaleString("en-CA") : words(String(v)));
  const cell = (k: Kind) => (k === "text" ? "text-left" : "whitespace-nowrap text-right tabular-nums");
  // Dates, numbers and short labels keep to one line; anything longer may wrap, so a nine-column report fits a laptop.
  const short = (v: string | number | null) => typeof v === "string" && (v.length <= 16 || !/\s/.test(v));
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId }, select: { name: true, legalName: true } });
  const scope = def.ranged ? rangeLabel(r.from, r.to) : picked?.season ? picked.season.name : `As of ${dateLabel(todayLocal())}`;
  return (
    <>
      <style>{printCss(t.columns.length)}</style>
      <div className="no-print">
        <DetailHeader back={{ href: "/reports", label: "Reports" }} title={def.title} sub={def.sub}
          actions={<>
            <PrintReportButton />
            <a href={`/api/export/report/${report}${qs}`} className={btn("secondary")}><Download className="size-4" strokeWidth={1.75} aria-hidden />Download CSV</a>
          </>} />
        {def.ranged && <RangeBar base={`/reports/${report}`} presets={PRESETS} range={r} />}
        {picked && picked.seasons.length > 1 && (
          <div className="mb-5">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Season</span>
            <Segmented label="Season" items={picked.seasons.map((s) => ({ href: `/reports/${report}?season=${s.id}`, label: s.name, active: picked.season?.id === s.id }))} />
          </div>
        )}
      </div>
      {/* What the printed page opens with: the report, what it covers, when it was run. */}
      <header className="mb-4 hidden border-b-2 border-navy pb-3 print:block">
        <p className="text-xs font-semibold">{biz.legalName ?? biz.name}</p>
        <h1 className="font-display text-2xl font-semibold">{def.title}</h1>
        <p className="mt-1 text-sm font-medium">{scope}</p>
        <p className="text-xs text-ink-soft">{def.sub} Printed {dateLabel(todayLocal())}.</p>
      </header>
      {t.rows.length ? (
        <Card className="report-card overflow-hidden p-0!">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 print:hidden">
            <h2 className="font-display text-[0.95rem] font-semibold">{scope}</h2>
            <span className="text-xs tabular-nums text-ink-soft">{t.rows.length.toLocaleString("en-CA")} row{t.rows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="report-scroll relative max-h-[70vh] overflow-auto">
            <table className={`report-table w-full border-separate border-spacing-0 ${t.columns.length >= 12 ? "text-xs [&_td]:px-1.5! [&_th]:px-1.5! [&_td]:min-w-0! [&_td]:whitespace-normal!" : "text-sm"}`}>
              <thead>
                <tr>{t.columns.map(([l, k], j) => <th key={l} scope="col" className={`sticky top-0 z-10 ${t.columns.length >= 10 ? "align-bottom whitespace-normal!" : "whitespace-nowrap"} border-b border-line bg-white px-3 py-2.5 shadow-[0_1px_0_var(--color-line)] text-xs font-medium text-ink-soft first:pl-4 last:pr-4 ${cell(k)} ${j === 0 ? "left-0 z-20" : ""}`}>{l}</th>)}</tr>
              </thead>
              <tbody>
                {t.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-tint/60">
                    {row.map((v, j) => <td key={j} className={`border-b border-line-soft px-3 py-2 align-top first:pl-4 last:pr-4 ${cell(t.columns[j][1])} ${j === 0 ? "sticky left-0 max-w-[45vw] bg-white font-medium sm:max-w-none" : ""} ${t.columns[j][1] === "money" && v === 0 ? "text-ink-soft" : ""} ${typeof v !== "string" ? "" : short(v) ? "whitespace-nowrap" : "report-long min-w-36"}`}>{show(v, t.columns[j][1])}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>{sums.map((s, j) => <td key={j} className={`border-t-2 border-navy bg-tint px-3 py-2.5 font-semibold first:pl-4 last:pr-4 ${cell(t.columns[j][1])} ${j === 0 ? "sticky left-0" : ""}`}>{j === 0 ? `Total (${t.rows.length.toLocaleString("en-CA")})` : show(s, t.columns[j][1])}</td>)}</tr>
              </tfoot>
            </table>
          </div>
          {t.note && <p className="max-w-[70ch] border-t border-line-soft px-4 py-3 text-xs text-ink-soft print:border-0 print:px-0">{t.note}</p>}
        </Card>
      ) : (
        <>
          <Empty action={<ButtonLink href="/reports">Back to reports</ButtonLink>}>Nothing to show{def.ranged ? ` for ${scope}. Try a wider period` : ""}.</Empty>
          {t.note && <p className="mt-3 max-w-[70ch] text-xs text-ink-soft">{t.note}</p>}
        </>
      )}
    </>
  );
}
