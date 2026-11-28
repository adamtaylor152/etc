// Client statement: lifetime, since the last zero balance, or from a date. Print it, download the PDF, or email it.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Mail } from "lucide-react";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
import { loadStatement, parseStatementRange, statementQuery } from "@/server/statement";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { PrintButton } from "@/components/print-button";
import { Button, Notice, btn } from "@/components/ui";
import { statementEmail } from "../../../billing-extras-actions";

export const metadata = { title: "Statement" };

export default async function Statement({ params, searchParams }: PageProps<"/clients/[id]/statement">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const r = parseStatementRange(sp), range = r.range;
  const loaded = await loadStatement(await businessId(), id, r);
  if (!loaded) notFound();
  const { client: c, biz, since, st } = loaded;
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-blue/30 bg-blue/8 font-semibold text-blue-deep" : "border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:text-navy"}`;
  const th = "py-2 text-xs font-medium text-ink-soft";
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print">
        <DetailHeader back={{ href: `/clients/${id}`, label: clientName(c) }} title="Statement" sub="Print, download or email it."
          actions={<>
            {/* PrintButton is shared and styled for another page: dress it as a secondary button here. */}
            <span className="contents [&_button]:h-auto [&_button]:min-h-10 [&_button]:border [&_button]:border-line [&_button]:bg-white [&_button]:px-4 [&_button]:text-navy [&_button]:shadow-sm [&_button]:hover:bg-tint"><PrintButton label="Print" /></span>
            <a href={`/api/export/pdf/statement/${id}?${statementQuery(r)}`} target="_blank" rel="noreferrer" className={btn("secondary")}><Download className="-ml-0.5 size-4" aria-hidden />PDF</a>
            <form action={statementEmail}><input type="hidden" name="clientId" value={id} /><input type="hidden" name="range" value={r.range} /><input type="hidden" name="from" value={r.from ?? ""} /><Button><Mail className="-ml-0.5 size-4" aria-hidden />Email statement</Button></form>
          </>} />
        <Flash error={sp.error} />
        {typeof sp.sent === "string" && <Notice tone="good">Statement emailed to {sp.sent} with the PDF attached.</Notice>}
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          <span className="mr-1 text-xs font-medium text-ink-soft">Period</span>
          {[["lifetime", "Lifetime"], ["zero", "Since last $0 balance"]].map(([k, l]) => <Link key={k} href={`/clients/${id}/statement?range=${k}`} aria-current={range === k ? "true" : undefined} className={chip(range === k)}>{l}</Link>)}
          <form className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-3.5 pr-0.5 ${range === "from" ? "border-blue/30 bg-blue/8" : "border-line bg-white"}`}>
            <input type="hidden" name="range" value="from" />
            <label htmlFor="st-from" className={`text-[13px] font-medium ${range === "from" ? "font-semibold text-blue-deep" : "text-ink-soft"}`}>From</label>
            <input id="st-from" type="date" name="from" defaultValue={r.from ?? ""} className="min-h-8 bg-transparent px-1 text-base tabular-nums outline-none sm:text-[13px]" />
            <button className="inline-flex min-h-8 items-center rounded-full border border-line bg-white px-3 text-[13px] font-semibold hover:bg-tint">Show</button>
          </form>
        </div>
      </div>
      <article className="rounded-xl border border-line bg-white p-5 shadow-card sm:p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 flex flex-wrap justify-between gap-x-6 gap-y-3">
          <div><p className="font-display text-2xl font-semibold">{biz.name}</p><p className="text-sm text-ink-soft">{biz.helpEmail}</p></div>
          <div className="text-right max-sm:text-left"><h2 className="font-display text-xl font-semibold">Statement</h2><p className="text-sm text-ink-soft tabular-nums">{prettyDate(todayLocal())}</p></div>
        </header>
        <p className="mb-5 text-sm"><span className="font-semibold">{clientName(c)}</span><br />{c.properties[0]?.formatted}</p>
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[30rem] text-sm">
            <thead><tr className="border-b border-navy text-left"><th className={`${th} pr-3`}>Date</th><th className={`${th} pr-3`}>Description</th><th className={`${th} text-right`}>Charges</th><th className={`${th} pl-3 text-right`}>Payments</th><th className={`${th} pl-3 text-right`}>Balance</th></tr></thead>
            <tbody className="divide-y divide-line-soft">
              {since && <tr><td className="whitespace-nowrap py-2.5 pr-3 text-ink-soft">{prettyDate(dateOnly(since))}</td><td>Opening balance</td><td /><td /><td className="text-right">{cad(st.openingCents)}</td></tr>}
              {st.rows.map((r) => (
                <tr key={r.kind + r.id}>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-ink-soft">{prettyDate(dateOnly(r.date))}</td><td className="pr-3">{r.label}</td>
                  <td className="whitespace-nowrap text-right">{r.amountCents > 0 ? cad(r.amountCents) : ""}</td><td className="whitespace-nowrap pl-3 text-right">{r.amountCents < 0 ? cad(-r.amountCents) : ""}</td>
                  <td className="whitespace-nowrap pl-3 text-right">{cad(r.balanceCents)}</td>
                </tr>
              ))}
              {!since && !st.rows.length && <tr><td colSpan={5} className="py-6 text-center text-ink-soft">No invoices or payments in this period.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t border-navy"><td colSpan={4} className="pt-3 text-right font-semibold">Balance owing</td><td className="whitespace-nowrap pl-3 pt-3 text-right font-display text-xl font-semibold">{cad(st.balanceCents)}</td></tr></tfoot>
          </table>
        </div>
        {st.balanceCents > 0 && biz.etransferEmail && <p className="mt-6 max-w-[70ch] text-sm">Pay by Interac e-Transfer to <span className="font-semibold">{biz.etransferEmail}</span> (include your invoice number), or cash.</p>}
      </article>
    </div>
  );
}
