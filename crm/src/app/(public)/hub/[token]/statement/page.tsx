// Client statement from the hub (same ledger as the owner's statement).
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { textLink } from "@/components/public/kit";
import { PrintLink } from "@/components/public/print-link";
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
  const amount = (cents: number) => (cents < 0 ? `−${money(-cents)}` : money(cents));
  return (
    <>
      <p className="no-print mb-2"><Link href={`/hub/${token}`} className={textLink}><ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />Back to your page</Link></p>
      <article className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div><h1 className="font-display text-2xl font-semibold leading-tight">Statement</h1><p className="mt-1 text-ink-soft">{clientName(c)}</p></div>
          <p className="text-right text-sm text-ink-soft"><span className="block font-display text-base font-semibold text-navy">{biz.name}</span><span className="tabular-nums">{prettyDate(todayLocal())}</span></p>
        </header>
        <div className="mb-4 rounded-lg bg-tint p-3.5">
          <p className="text-sm font-medium text-ink-soft">Balance owing</p>
          <p className="mt-1 font-display text-[2rem] font-semibold leading-none tabular-nums">{money(st.balanceCents)}</p>
        </div>
        {st.rows.length ? (
          <>
            {/* Phones: one stacked row per entry. Wider (and on paper): the ledger table. */}
            <ul className="divide-y divide-line-soft border-t border-line-soft sm:hidden print:hidden">
              {st.rows.map((r) => (
                <li key={r.kind + r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0"><span className="block font-medium">{r.label}</span><span className="block text-sm text-ink-soft tabular-nums">{prettyDate(dateOnly(r.date))}</span></span>
                  <span className="shrink-0 text-right tabular-nums"><span className="block font-semibold">{amount(r.amountCents)}</span><span className="block text-sm text-ink-soft">Balance {money(r.balanceCents)}</span></span>
                </li>
              ))}
            </ul>
            <table className="hidden w-full sm:table print:table">
              <thead><tr className="border-b border-line text-left text-xs font-medium text-ink-soft"><th className="py-2 font-medium">Date</th><th className="font-medium">Description</th><th className="text-right font-medium">Amount</th><th className="text-right font-medium">Balance</th></tr></thead>
              <tbody>{st.rows.map((r) => <tr key={r.kind + r.id} className="border-b border-line-soft"><td className="py-2.5 pr-3 whitespace-nowrap text-ink-soft">{prettyDate(dateOnly(r.date))}</td><td className="pr-3">{r.label}</td><td className="text-right">{amount(r.amountCents)}</td><td className="pl-3 text-right">{money(r.balanceCents)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3} className="pt-3 text-right font-semibold">Balance owing</td><td className="pt-3 pl-3 text-right font-display text-lg font-semibold">{money(st.balanceCents)}</td></tr></tfoot>
            </table>
          </>
        ) : <p className="text-ink-soft">Nothing on your account yet. Invoices and payments will be listed here.</p>}
      </article>
      <p className="no-print mt-4 text-center"><PrintLink /></p>
    </>
  );
}
