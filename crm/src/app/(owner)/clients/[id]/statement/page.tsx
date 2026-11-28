// Client statement: lifetime, since the last zero balance, or from a date. Print it, download the PDF, or email it.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
import { loadStatement, parseStatementRange, statementQuery } from "@/server/statement";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { Flash } from "@/components/flash";
import { PrintButton } from "@/components/print-button";
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
  return (
    <div className="mx-auto max-w-3xl">
      <Flash error={sp.error} />
      {typeof sp.sent === "string" && <p className="no-print mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Statement emailed to {sp.sent} with the PDF attached.</p>}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/clients/${id}`} className="font-semibold text-blue">← {clientName(c)}</Link>
        <span className="ml-auto flex gap-1">
          {[["lifetime", "Lifetime"], ["zero", "Since last $0 balance"]].map(([k, l]) => <Link key={k} href={`/clients/${id}/statement?range=${k}`} className={`rounded-full px-3 py-1 font-semibold ${range === k ? "bg-navy text-white" : "bg-white text-ink-soft"}`}>{l}</Link>)}
          <form className="flex gap-1"><input type="hidden" name="range" value="from" /><input type="date" name="from" className="h-8 rounded-lg border border-line px-2" aria-label="From date" /><button className="h-8 rounded-lg border border-line bg-white px-2 font-semibold">From</button></form>
          <PrintButton label="Print" />
          <a href={`/api/export/pdf/statement/${id}?${statementQuery(r)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 font-semibold">PDF</a>
          <form action={statementEmail}><input type="hidden" name="clientId" value={id} /><input type="hidden" name="range" value={r.range} /><input type="hidden" name="from" value={r.from ?? ""} /><button className="h-8 rounded-lg bg-blue px-3 font-semibold text-white">Email statement</button></form>
        </span>
      </div>
      <article className="rounded-lg border border-line bg-white p-8 shadow-card print:border-0 print:shadow-none">
        <header className="mb-6 flex justify-between gap-6">
          <div><p className="font-display text-2xl font-bold">{biz.name}</p><p className="text-sm text-ink-soft">{biz.helpEmail}</p></div>
          <div className="text-right"><p className="font-display text-xl font-bold">Statement</p><p className="text-sm text-ink-soft">{prettyDate(todayLocal())}</p></div>
        </header>
        <p className="mb-4 text-sm"><span className="font-semibold">{clientName(c)}</span><br />{c.properties[0]?.formatted}</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-navy text-left"><th className="py-2">Date</th><th>Description</th><th className="text-right">Charges</th><th className="text-right">Payments</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {since && <tr className="border-b border-line"><td className="py-2 text-ink-soft">{prettyDate(dateOnly(since))}</td><td>Opening balance</td><td /><td /><td className="text-right">{money(st.openingCents)}</td></tr>}
            {st.rows.map((r) => (
              <tr key={r.kind + r.id} className="border-b border-line">
                <td className="py-2 text-ink-soft">{prettyDate(dateOnly(r.date))}</td><td>{r.label}</td>
                <td className="text-right">{r.amountCents > 0 ? money(r.amountCents) : ""}</td><td className="text-right">{r.amountCents < 0 ? money(-r.amountCents) : ""}</td>
                <td className="text-right">{money(r.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4} className="pt-3 text-right font-bold">Balance owing</td><td className="pt-3 text-right font-display text-lg font-bold">{money(st.balanceCents)}</td></tr></tfoot>
        </table>
        {st.balanceCents > 0 && biz.etransferEmail && <p className="mt-6 text-sm">Pay by Interac e-Transfer to <span className="font-semibold">{biz.etransferEmail}</span> (include your invoice number), or cash.</p>}
      </article>
    </div>
  );
}
