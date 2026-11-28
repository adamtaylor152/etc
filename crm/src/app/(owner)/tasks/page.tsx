// To-do list: overdue, today, upcoming, no date, done.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui";
import { addDays, dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { personName } from "@/server/schedule";
import { taskDone } from "../schedule-actions";

export const metadata = { title: "Tasks" };

export default async function Tasks({ searchParams }: PageProps<"/tasks">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const today = todayLocal();
  const who = typeof sp.person === "string" ? sp.person : "";
  const tasks = await db.task.findMany({
    where: { businessId: bid, kind: "TASK", ...(who ? { assignees: { some: { userId: who } } } : {}), OR: [{ completedAt: null }, { completedAt: { gte: new Date(`${addDays(today, -14)}T00:00:00Z`) } }] },
    include: { assignees: { include: { user: true } } }, orderBy: [{ date: { sort: "asc", nulls: "last" } }, { startAt: "asc" }], take: 500,
  });
  const clientIds = [...new Set(tasks.map((t) => t.clientId).filter((x): x is string => !!x))];
  const names = new Map((clientIds.length ? await db.client.findMany({ where: { id: { in: clientIds } } }) : []).map((c) => [c.id, clientName(c)]));
  const users = await db.user.findMany({ where: { businessId: bid, active: true } });
  const groups: [string, typeof tasks][] = [
    ["Overdue", tasks.filter((t) => !t.completedAt && t.date && dateOnly(t.date)! < today)],
    ["Today", tasks.filter((t) => !t.completedAt && dateOnly(t.date) === today)],
    ["Upcoming", tasks.filter((t) => !t.completedAt && t.date && dateOnly(t.date)! > today).slice(0, 60)],
    ["No date", tasks.filter((t) => !t.completedAt && !t.date)],
    ["Done (last 2 weeks)", tasks.filter((t) => t.completedAt)],
  ];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Tasks</h1>
        <div className="flex gap-2">
          <form className="flex items-center"><select name="person" defaultValue={who} className="h-10 rounded-lg border border-line bg-white px-2 text-sm"><option value="">Everyone</option>{users.map((u) => <option key={u.id} value={u.id}>{personName(u)}</option>)}</select><button className="ml-1 h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold">Filter</button></form>
          <Link href="/tasks/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue px-4 text-sm font-semibold text-white"><Plus className="size-4" />New task</Link>
        </div>
      </div>
      <div className="space-y-5">
        {groups.filter(([, list]) => list.length).map(([label, list]) => (
          <section key={label} className="rounded-lg border border-line bg-white shadow-card">
            <h2 className={`border-b border-line px-4 py-2.5 text-sm font-bold ${label === "Overdue" ? "text-red-700" : ""}`}>{label} <span className="font-normal text-ink-soft">({list.length})</span></h2>
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <form action={taskDone}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.completedAt ? "0" : "1"} />
                    <button aria-label={t.completedAt ? "Mark not done" : "Mark done"} className={`grid size-6 place-items-center rounded-full border-2 ${t.completedAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-line hover:border-emerald-600"}`}><Check className="size-3.5" /></button>
                  </form>
                  <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                    <span className={`font-semibold ${t.completedAt ? "text-ink-soft line-through" : ""}`}>{t.title}</span>
                    <span className="block truncate text-xs text-ink-soft">{[t.date && prettyDate(dateOnly(t.date)), !t.allDay && t.startAt && t.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }), t.clientId && names.get(t.clientId), t.seriesId && "repeats"].filter(Boolean).join(" · ")}</span>
                  </Link>
                  <span className="flex gap-1">{t.assignees.map((a) => <Badge key={a.userId}>{personName(a.user)}</Badge>)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!tasks.length && <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-ink-soft">No tasks. Add one with New task, or click a time on the schedule.</p>}
      </div>
    </>
  );
}
