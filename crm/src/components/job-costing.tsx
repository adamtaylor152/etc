// Job costing card: profit bar (revenue − labour − expenses), time entries, expenses, and forms to add both.
import { Paperclip, Trash2 } from "lucide-react";
import { expenseAdd, expenseDelete, timeAdd, timeDelete } from "@/app/(owner)/costing-actions";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { cad } from "@/server/money";
import { EXPENSE_CATEGORIES, hm, jobProfit } from "@/server/ops/costing";
import { personName, type Person } from "@/server/schedule";
import { ConfirmButton } from "./confirm-button";
import { Card, btn, inputCls } from "./ui";

export async function JobCosting({ businessId, jobId, people, back }: { businessId: string; jobId: string; people: Person[]; back: string }) {
  const p = await jobProfit(businessId, jobId);
  const pct = (c: number) => (p.revenueCents > 0 ? Math.max(0, Math.min(100, (c / p.revenueCents) * 100)) : 0);
  const inp = `${inputCls} w-auto!`;
  const del = "inline-flex size-9 max-sm:size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-red-50 hover:text-red-700";
  const legend = (dot: string, label: string) => <span className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${dot}`} aria-hidden />{label}</span>;
  return (
    <Card title="Profit" actions={<p className="text-sm tabular-nums"><span className={`font-display text-xl font-semibold ${p.profitCents < 0 ? "text-red-700" : "text-emerald-700"}`}>{cad(p.profitCents)}</span>{p.marginPct != null && <span className="ml-1.5 text-ink-soft">{p.marginPct}% margin</span>}</p>}>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-tint" aria-hidden>
        <span className="bg-amber-500" style={{ width: `${pct(p.labourCents)}%` }} /><span className="bg-red-500" style={{ width: `${pct(p.expenseCents)}%` }} /><span className="bg-emerald-600" style={{ width: `${pct(Math.max(0, p.profitCents))}%` }} />
      </div>
      <dl className="mb-5 grid grid-cols-2 gap-x-3 gap-y-3 text-xs sm:grid-cols-4">
        <div><dt className="font-medium text-ink-soft">Revenue</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{cad(p.revenueCents)}</dd></div>
        <div><dt className="font-medium text-ink-soft">{legend("bg-amber-500", `Labour · ${hm(p.minutes)}`)}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{cad(p.labourCents)}</dd></div>
        <div><dt className="font-medium text-ink-soft">{legend("bg-red-500", "Expenses")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{cad(p.expenseCents)}</dd></div>
        <div><dt className="font-medium text-ink-soft">{legend("bg-emerald-600", "Profit")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{cad(p.profitCents)}</dd></div>
      </dl>
      <div className="grid gap-x-8 gap-y-6 border-t border-line-soft pt-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold">Time</h3>
          <ul className="mb-3 divide-y divide-line-soft text-sm">
            {p.time.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1"><span className="font-semibold">{personName(t.user)}</span> <span className="text-ink-soft">{prettyDate(t.startedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }))}{t.note && ` · ${t.note}`}</span></span>
                <span className="tabular-nums">{hm(t.minutes ?? 0)}</span>
                <form action={timeDelete}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value={back} /><ConfirmButton message="Delete this time entry?" aria-label="Delete time entry" title="Delete time entry" className={del}><Trash2 className="size-4" aria-hidden /></ConfirmButton></form>
              </li>
            ))}
            {!p.time.length && <li className="py-2 text-ink-soft">No time logged. Start a timer on a visit, or add it here.</li>}
          </ul>
          <form action={timeAdd} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="back" value={back} />
            <select name="userId" aria-label="Person" className={`${inp} min-w-0 flex-1`}>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input name="date" type="date" defaultValue={todayLocal()} aria-label="Date" className={inp} />
            <input name="hours" required placeholder="1.5 or 1:30" aria-label="Hours (1.5 or 1:30)" className={`${inp} w-28!`} />
            <button className={btn("secondary")}>Add time</button>
          </form>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Expenses</h3>
          <ul className="mb-3 divide-y divide-line-soft text-sm">
            {p.expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1"><span className="font-semibold">{e.description}</span> <span className="text-ink-soft">{e.category} · {prettyDate(dateOnly(e.date))}</span>
                  {e.attachmentId && <a href={`/api/media/${e.attachmentId}/lg`} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-blue hover:text-blue-deep"><Paperclip className="size-3.5" aria-hidden />Receipt</a>}</span>
                <span className="tabular-nums">{cad(e.amountCents)}</span>
                <form action={expenseDelete}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><ConfirmButton message="Delete this expense?" aria-label="Delete expense" title="Delete expense" className={del}><Trash2 className="size-4" aria-hidden /></ConfirmButton></form>
              </li>
            ))}
            {!p.expenses.length && <li className="py-2 text-ink-soft">No expenses yet.</li>}
          </ul>
          <form action={expenseAdd} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="back" value={back} />
            <input name="description" required placeholder="What (e.g. 2 bags of salt)" aria-label="Description" className={`${inputCls} col-span-2`} />
            <select name="category" aria-label="Category" className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <input name="amount" required type="number" step="0.01" min="0.01" placeholder="Amount ($)" aria-label="Amount in dollars" className={inputCls} />
            <input name="date" type="date" defaultValue={todayLocal()} aria-label="Date" className={inputCls} />
            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-sm font-semibold text-blue-deep hover:border-blue hover:bg-blue/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue"><Paperclip className="size-4" aria-hidden />Attach receipt<input type="file" name="receipt" accept="image/*,application/pdf" className="sr-only" /></label>
            <button className={btn("secondary", "col-span-2")}>Add expense</button>
          </form>
        </div>
      </div>
    </Card>
  );
}
