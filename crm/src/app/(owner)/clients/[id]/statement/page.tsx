// Printable client statement: lifetime, since the last zero balance, or from a date.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ledger } from "@/server/billing/ledger";
import { dateOnly, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Statement" };

export default async function Statement({ params, searchParams }: PageProps<"/clients/[id]/statement">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const c = await db.client.findFirst({ where: { id, businessId: bid }, include: { invoices: true, payments: { include: { invoice: { select: { number: true } } } }, properties: { take: 1, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } } });
  if (!c) notFound();
  const biz = await db.business.findUniqueOrThrow({ where: { id: bid } });
  const range = typeof sp.range === "string" ? sp.range : "lifetime";
  const full = ledger(c.invoices, c.payments);
  let since: Date | undefined;
  if (range === "zero") { const lastZero = [...full.rows].reverse().find((r) => r.balanceCents === 0); since = lastZero ? new Date(lastZero.date.getTime() + 1) : undefined; }
  if (range === "from" && typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) since = localDayStart(sp.from);
  const st = ledger(c.invoices, c.payments, since);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/clients/${id}`} className="font-semibold text-blue">← {clientName(c)}</Link>
        <span className="ml-auto flex gap-1">
          {[["lifetime", "Lifetime"], ["zero", "Since last $0 balance"]].map(([k, l]) => <Link key={k} href={`/clients/${id}/statement?range=${k}`} className={`rounded-full px-3 py-1 font-semibold ${range === k ? "bg-navy text-white" : "bg-white text-ink-soft"}`}>{l}</Link>)}
          <form className="flex gap-1"><input type="hidden" name="range" value="from" /><input type="date" name="from" className="h-8 rounded-lg border border-line px-2" aria-label="From date" /><button className="h-8 rounded-lg border border-line bg-white px-2 font-semibold">From</button></form>
          <PrintButton />
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
