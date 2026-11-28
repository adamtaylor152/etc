// All expenses, filterable by month and category, with a CSV for the accountant.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { expenseAdd, expenseDelete, expenseUpdate } from "../costing-actions";
import { dateOnly, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { EXPENSE_CATEGORIES } from "@/server/ops/costing";

export const metadata = { title: "Expenses" };

export default async function Expenses({ searchParams }: PageProps<"/expenses">) {
  await requireOwner();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayLocal().slice(0, 7);
  const cat = typeof sp.category === "string" ? sp.category : "";
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const bid = await businessId();
  const rows = await db.expense.findMany({ where: { businessId: bid, date: { gte: toDbDate(`${month}-01`), lt: toDbDate(`${next}-01`) }, ...(cat ? { category: cat } : {}) }, orderBy: { date: "desc" } });
  const jobIds = [...new Set(rows.map((r) => r.jobId).filter((x): x is string => !!x))];
  const jobs = new Map((jobIds.length ? await db.job.findMany({ where: { id: { in: jobIds } } }) : []).map((j) => [j.id, `#${j.number} ${j.title}`]));
  const gst = rows.reduce((n, r) => n + r.gstCents, 0);
  const back = `/expenses?month=${month}`;
  const inp = "min-h-9 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Expenses</h1>
        <a href={`/api/export/expenses?month=${month}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-tint"><Download className="size-4" />CSV for {month}</a>
      </div>
      <section className="rounded-lg border border-line bg-white shadow-card">
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm">
          <input type="month" name="month" defaultValue={month} aria-label="Month" className={inp} />
          <select name="category" defaultValue={cat} aria-label="Category" className={inp}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="min-h-9 rounded-lg border border-line px-3 font-semibold">Show</button>
          <span className="ml-auto font-semibold">Total {money(rows.reduce((n, r) => n + r.amountCents, 0))}{gst > 0 && <span className="font-normal text-ink-soft"> · includes {money(gst)} GST</span>}</span>
        </form>
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-24 text-ink-soft">{prettyDate(dateOnly(r.date))}</span>
              <span className="min-w-40 flex-1"><span className="font-semibold">{r.description}</span> <span className="text-ink-soft">· {r.category}{r.vendor && ` · ${r.vendor}`}</span>
                {r.jobId && <Link href={`/jobs/${r.jobId}`} className="ml-1 text-blue">{jobs.get(r.jobId)}</Link>}
                {r.attachmentId && <a href={`/api/media/${r.attachmentId}/lg`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-blue"><Paperclip className="size-3" />receipt</a>}</span>
              <span className="text-right font-semibold">{money(r.amountCents)}{r.gstCents > 0 && <span className="block text-xs font-normal text-ink-soft">GST {money(r.gstCents)}</span>}</span>
              <details className="order-last basis-full">
                <summary className="cursor-pointer text-xs font-semibold text-blue">Edit</summary>
                <form action={expenseUpdate} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} />
                  <input name="description" required defaultValue={r.description} aria-label="Description" className={`${inp} min-w-52 flex-1`} />
                  <input name="vendor" defaultValue={r.vendor ?? ""} placeholder="Bought from" aria-label="Vendor" className={`${inp} w-36`} />
                  <select name="category" defaultValue={r.category} aria-label="Category" className={inp}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                  <input name="amount" required type="number" step="0.01" min="0.01" defaultValue={(r.amountCents / 100).toFixed(2)} aria-label="Amount" className={`${inp} w-24`} />
                  <input name="gst" type="number" step="0.01" min="0" defaultValue={r.gstCents ? (r.gstCents / 100).toFixed(2) : ""} placeholder="GST" aria-label="GST included" className={`${inp} w-20`} />
                  <input name="date" type="date" required defaultValue={dateOnly(r.date) ?? ""} aria-label="Date" className={inp} />
                  <button className="min-h-9 rounded-lg border border-line px-3 text-sm font-semibold">Save</button>
                </form>
              </details>
              <form action={expenseDelete}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={`/expenses?month=${month}`} /><button aria-label="Delete expense" className="p-1 text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button></form>
            </li>
          ))}
          {!rows.length && <li className="p-6 text-center text-ink-soft">No expenses for this month.</li>}
        </ul>
        <form action={expenseAdd} className="flex flex-wrap items-end gap-2 border-t border-line p-3">
          <input type="hidden" name="back" value={`/expenses?month=${month}`} />
          <input name="description" required placeholder="What (general, not for one job)" aria-label="Description" className={`${inp} min-w-52 flex-1`} />
          <input name="vendor" placeholder="Bought from" aria-label="Vendor" className={`${inp} w-36`} />
          <select name="category" aria-label="Category" className={inp}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input name="amount" required type="number" step="0.01" min="0.01" placeholder="$ paid" aria-label="Amount" className={`${inp} w-24`} />
          <input name="gst" type="number" step="0.01" min="0" placeholder="GST" title="The GST part of what you paid, if any" aria-label="GST included" className={`${inp} w-20`} />
          <input name="date" type="date" defaultValue={todayLocal()} aria-label="Date" className={inp} />
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-blue"><Paperclip className="size-3.5" />Receipt<input type="file" name="receipt" accept="image/*,application/pdf" className="sr-only" /></label>
          <button className="min-h-9 rounded-lg bg-navy px-3 text-sm font-semibold text-white">Add expense</button>
        </form>
      </section>
    </>
  );
}
