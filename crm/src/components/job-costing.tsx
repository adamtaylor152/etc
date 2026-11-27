// Job costing card: profit bar (revenue − labour − expenses), time entries, expenses, and forms to add both.
import { Paperclip, Trash2 } from "lucide-react";
import { expenseAdd, expenseDelete, timeAdd, timeDelete } from "@/app/(owner)/costing-actions";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { money } from "@/server/money";
import { EXPENSE_CATEGORIES, hm, jobProfit } from "@/server/ops/costing";
import { personName, type Person } from "@/server/schedule";

export async function JobCosting({ businessId, jobId, people, back }: { businessId: string; jobId: string; people: Person[]; back: string }) {
  const p = await jobProfit(businessId, jobId);
  const pct = (c: number) => (p.revenueCents > 0 ? Math.max(0, Math.min(100, (c / p.revenueCents) * 100)) : 0);
  const inp = "min-h-9 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Profit</h2>
        <p className="text-sm"><span className={`font-display text-xl font-bold ${p.profitCents < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(p.profitCents)}</span>{p.marginPct != null && <span className="ml-1 text-ink-soft">({p.marginPct}% margin)</span>}</p>
      </div>
      <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-tint" aria-hidden>
        <span className="bg-amber-500" style={{ width: `${pct(p.labourCents)}%` }} /><span className="bg-red-500" style={{ width: `${pct(p.expenseCents)}%` }} /><span className="bg-emerald-600" style={{ width: `${pct(Math.max(0, p.profitCents))}%` }} />
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><dt className="text-ink-soft">Revenue</dt><dd className="font-semibold">{money(p.revenueCents)}</dd></div>
        <div><dt className="flex items-center gap-1 text-ink-soft"><span className="size-2 rounded-full bg-amber-500" />Labour · {hm(p.minutes)}</dt><dd className="font-semibold">{money(p.labourCents)}</dd></div>
        <div><dt className="flex items-center gap-1 text-ink-soft"><span className="size-2 rounded-full bg-red-500" />Expenses</dt><dd className="font-semibold">{money(p.expenseCents)}</dd></div>
        <div><dt className="flex items-center gap-1 text-ink-soft"><span className="size-2 rounded-full bg-emerald-600" />Profit</dt><dd className="font-semibold">{money(p.profitCents)}</dd></div>
      </dl>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-bold">Time</h3>
          <ul className="mb-2 divide-y divide-line text-sm">
            {p.time.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1"><span className="font-semibold">{personName(t.user)}</span> <span className="text-ink-soft">{prettyDate(t.startedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }))}{t.note && ` · ${t.note}`}</span></span>
                <span>{hm(t.minutes ?? 0)}</span>
                <form action={timeDelete}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value={back} /><button aria-label="Delete time entry" className="text-ink-soft hover:text-red-700"><Trash2 className="size-3.5" /></button></form>
              </li>
            ))}
            {!p.time.length && <li className="py-1.5 text-ink-soft">No time logged. Start a timer on a visit, or add it here.</li>}
          </ul>
          <form action={timeAdd} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="back" value={back} />
            <select name="userId" aria-label="Person" className={inp}>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input name="date" type="date" defaultValue={todayLocal()} aria-label="Date" className={inp} />
            <input name="hours" required placeholder="1.5 or 1:30" aria-label="Hours" className={`${inp} w-24`} />
            <button className="min-h-9 rounded-lg bg-navy px-3 text-sm font-semibold text-white">Add time</button>
          </form>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">Expenses</h3>
          <ul className="mb-2 divide-y divide-line text-sm">
            {p.expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1"><span className="font-semibold">{e.description}</span> <span className="text-ink-soft">{e.category} · {prettyDate(dateOnly(e.date))}</span>
                  {e.attachmentId && <a href={`/api/media/${e.attachmentId}/lg`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-blue"><Paperclip className="size-3" />receipt</a>}</span>
                <span>{money(e.amountCents)}</span>
                <form action={expenseDelete}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><button aria-label="Delete expense" className="text-ink-soft hover:text-red-700"><Trash2 className="size-3.5" /></button></form>
              </li>
            ))}
            {!p.expenses.length && <li className="py-1.5 text-ink-soft">No expenses yet.</li>}
          </ul>
          <form action={expenseAdd} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="back" value={back} />
            <input name="description" required placeholder="What (e.g. 2 bags of salt)" aria-label="Description" className={`${inp} col-span-2`} />
            <select name="category" aria-label="Category" className={inp}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <input name="amount" required type="number" step="0.01" min="0.01" placeholder="$" aria-label="Amount" className={inp} />
            <input name="date" type="date" defaultValue={todayLocal()} aria-label="Date" className={inp} />
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-blue"><Paperclip className="size-3.5" />Receipt<input type="file" name="receipt" accept="image/*,application/pdf" className="sr-only" /></label>
            <button className="col-span-2 min-h-9 rounded-lg bg-navy px-3 text-sm font-semibold text-white">Add expense</button>
          </form>
        </div>
      </div>
    </section>
  );
}
