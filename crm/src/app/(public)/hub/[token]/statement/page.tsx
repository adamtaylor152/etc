// Client statement from the hub (same ledger as the owner's statement).
import { notFound } from "next/navigation";
import { ledger } from "@/server/billing/ledger";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { peekToken } from "@/server/tokens";

export const metadata = { title: { absolute: "Your statement · etc." }, robots: { index: false } };

export default async function HubStatement({ params }: PageProps<"/hub/[token]/statement">) {
  const { token } = await params;
  const t = await peekToken(db, token, ["CLIENT_HUB"]);
  if (!t.ok || !t.token.clientId) notFound();
  const c = await db.client.findUniqueOrThrow({ where: { id: t.token.clientId }, include: { invoices: true, payments: { include: { invoice: { select: { number: true } } } } } });
  const biz = await db.business.findUniqueOrThrow({ where: { id: c.businessId } });
  const st = ledger(c.invoices, c.payments);
  return (
    <article className="rounded-2xl border border-line bg-white p-6">
      <header className="mb-4 flex justify-between"><div><p className="font-display text-2xl font-bold">{biz.name}</p><p className="text-sm text-ink-soft">{clientName(c)}</p></div><p className="text-right text-sm text-ink-soft">Statement<br />{prettyDate(todayLocal())}</p></header>
      <table className="w-full text-sm">
        <thead><tr className="border-b-2 border-navy text-left"><th className="py-2">Date</th><th>Description</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
        <tbody>{st.rows.map((r) => <tr key={r.kind + r.id} className="border-b border-line"><td className="py-2 text-ink-soft">{prettyDate(dateOnly(r.date))}</td><td>{r.label}</td><td className="text-right">{r.amountCents < 0 ? `−${money(-r.amountCents)}` : money(r.amountCents)}</td><td className="text-right">{money(r.balanceCents)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3} className="pt-3 text-right font-bold">Balance owing</td><td className="pt-3 text-right font-display text-lg font-bold">{money(st.balanceCents)}</td></tr></tfoot>
      </table>
      <p className="no-print mt-4 text-center"><a href="javascript:print()" className="text-sm font-semibold text-blue">Print or save as PDF</a></p>
    </article>
  );
}
