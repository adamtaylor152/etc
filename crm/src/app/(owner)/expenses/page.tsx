// All expenses, filterable by month and category, with a CSV for the accountant.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { Amount } from "@/components/billing/money";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash } from "@/components/flash";
import { FilePicker } from "@/components/file-picker";
import { Button, Card, Field, PageHeader, btn, inputCls } from "@/components/ui";
import { expenseAdd, expenseDelete, expenseUpdate } from "../costing-actions";
import { dateOnly, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { EXPENSE_CATEGORIES } from "@/server/ops/costing";

export const metadata = { title: "Expenses" };

// One grid for the add row and the inline edit form, so the same field sits in the same place in both.
const GRID = "grid grid-cols-2 items-end gap-x-2 gap-y-3 lg:grid-cols-[minmax(11rem,1fr)_9rem_9.5rem_6.5rem_6rem_9.5rem]";

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
  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  const back = `/expenses?month=${month}`;
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <PageHeader title="Expenses" sub="What the business spent that isn't tied to one job. Job costs are added on the job."
        actions={<a href={`/api/export/expenses?month=${month}`} className={btn("secondary")}><Download className="size-4" strokeWidth={1.75} aria-hidden />Download {monthName} CSV</a>} />
      <Flash error={sp.error} />

      <Card title="Add an expense" className="mb-5">
        <form action={expenseAdd}>
          <input type="hidden" name="back" value={`/expenses?month=${month}`} />
          <div className={GRID}>
            <div className="col-span-2 lg:col-span-1"><Field label="What it was"><input name="description" required placeholder="General, not for one job" className={inputCls} /></Field></div>
            <Field label="Bought from"><input name="vendor" placeholder="Optional" className={inputCls} /></Field>
            <Field label="Category"><select name="category" className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Paid ($)"><input name="amount" required type="number" step="0.01" min="0.01" inputMode="decimal" placeholder="0.00" className={`${inputCls} text-right tabular-nums`} /></Field>
            <div title="The GST part of what you paid, if any"><Field label="GST in it ($)"><input name="gst" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" className={`${inputCls} text-right tabular-nums`} /></Field></div>
            <div className="col-span-2 lg:col-span-1"><Field label="Date"><input name="date" type="date" defaultValue={todayLocal()} className={inputCls} /></Field></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <FilePicker name="receipt" accept="image/*,application/pdf" label="Attach receipt" hint="Optional. A photo or PDF." />
            <Button>Add expense</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0!">
        <form className="flex flex-wrap items-end gap-2 border-b border-line p-3 sm:px-4">
          <Field label="Month"><input type="month" name="month" defaultValue={month} className={`${inputCls} w-auto!`} /></Field>
          <Field label="Category"><select name="category" defaultValue={cat} className={`${inputCls} w-auto!`}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Button variant="secondary">Show</Button>
          <div className="ml-auto text-right">
            <div className="text-xs font-medium text-ink-soft">Total{cat ? ` · ${cat}` : ""} · {monthName}</div>
            <Amount cents={total} className="font-display text-xl font-semibold" />
            {gst > 0 && <div className="text-xs tabular-nums text-ink-soft">includes {money(gst)} GST</div>}
          </div>
        </form>
        {rows.length ? (
          <ul className="divide-y divide-line-soft text-sm">
            {rows.map((r) => (
              <li key={r.id} className="px-3 py-3 sm:px-4">
                <div className="flex items-start gap-3">
                  <span className="hidden w-24 shrink-0 whitespace-nowrap tabular-nums text-ink-soft sm:block">{prettyDate(dateOnly(r.date))}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{r.description}</span>
                    <span className="block text-xs text-ink-soft">
                      <span className="tabular-nums sm:hidden">{prettyDate(dateOnly(r.date))} · </span>{r.category}{r.vendor && ` · ${r.vendor}`}
                      {r.jobId && <> · <Link href={`/jobs/${r.jobId}`} className="font-medium text-blue hover:text-blue-deep">{jobs.get(r.jobId)}</Link></>}
                      {r.attachmentId && <> · <a href={`/api/media/${r.attachmentId}/lg`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-blue hover:text-blue-deep"><Paperclip className="size-3" strokeWidth={1.75} aria-hidden />Receipt</a></>}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <Amount cents={r.amountCents} className="font-semibold" />
                    {r.gstCents > 0 && <span className="block text-xs tabular-nums text-ink-soft">GST {money(r.gstCents)}</span>}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-start gap-x-3 sm:pl-27">
                  <details className="min-w-0 flex-1 open:basis-full">
                    <summary className="inline-flex min-h-8 items-center text-xs font-semibold text-blue hover:text-blue-deep">Edit</summary>
                    <form action={expenseUpdate} className="mt-2 rounded-lg bg-tint p-3">
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} />
                      <div className={GRID}>
                        <div className="col-span-2 lg:col-span-1"><Field label="What it was"><input name="description" required defaultValue={r.description} className={inputCls} /></Field></div>
                        <Field label="Bought from"><input name="vendor" defaultValue={r.vendor ?? ""} className={inputCls} /></Field>
                        <Field label="Category"><select name="category" defaultValue={r.category} className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
                        <Field label="Paid ($)"><input name="amount" required type="number" step="0.01" min="0.01" inputMode="decimal" defaultValue={(r.amountCents / 100).toFixed(2)} className={`${inputCls} text-right tabular-nums`} /></Field>
                        <Field label="GST in it ($)"><input name="gst" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={r.gstCents ? (r.gstCents / 100).toFixed(2) : ""} placeholder="0.00" className={`${inputCls} text-right tabular-nums`} /></Field>
                        <div className="col-span-2 lg:col-span-1"><Field label="Date"><input name="date" type="date" required defaultValue={dateOnly(r.date) ?? ""} className={inputCls} /></Field></div>
                      </div>
                      <div className="mt-3 flex justify-end"><Button variant="secondary">Save changes</Button></div>
                    </form>
                  </details>
                  <form action={expenseDelete}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={`/expenses?month=${month}`} /><ConfirmButton message={`Delete "${r.description}"?`} aria-label={`Delete expense: ${r.description}`} className="inline-flex size-8 items-center justify-center rounded-md text-ink-soft hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" strokeWidth={1.75} aria-hidden /></ConfirmButton></form>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-10 text-center text-sm text-ink-soft">No expenses{cat ? ` in ${cat}` : ""} for {monthName}. Add one above, or pick another month.</p>}
      </Card>
    </>
  );
}
