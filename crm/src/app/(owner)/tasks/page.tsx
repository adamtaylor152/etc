// To-do list: overdue, today, upcoming, no date, done.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { Badge, Button, ButtonLink, Empty, inputCls, PageHeader } from "@/components/ui";
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
      <PageHeader title="Tasks" actions={
        <>
          <form className="flex items-center gap-2">
            <select name="person" defaultValue={who} aria-label="Assigned to" className={inputCls.replace("w-full ", "")}><option value="">Everyone</option>{users.map((u) => <option key={u.id} value={u.id}>{personName(u)}</option>)}</select>
            <Button variant="secondary">Filter</Button>
          </form>
          <ButtonLink href="/tasks/new" variant="primary"><Plus className="size-4" strokeWidth={1.75} aria-hidden />New task</ButtonLink>
        </>
      } />
      <div className="space-y-5">
        {groups.filter(([, list]) => list.length).map(([label, list]) => (
          <section key={label} className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-display text-[0.95rem] font-semibold sm:px-5">
              {label}{label === "Overdue" ? <Badge tone="red">{list.length}</Badge> : <span className="font-sans text-sm font-normal tabular-nums text-ink-soft">({list.length})</span>}
            </h2>
            <ul className="divide-y divide-line-soft">
              {list.map((t) => (
                <li key={t.id} className="flex items-center gap-1 py-1 pl-2 pr-4 hover:bg-tint/60 sm:pl-3 sm:pr-5">
                  <form action={taskDone}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.completedAt ? "0" : "1"} />
                    <button aria-label={t.completedAt ? `Mark not done: ${t.title}` : `Mark done: ${t.title}`} title={t.completedAt ? "Mark not done" : "Mark done"} className="group grid size-11 place-items-center rounded-lg">
                      <span className={`grid size-5 place-items-center rounded-full border-[1.5px] ${t.completedAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-ink-faint/70 text-transparent group-hover:border-emerald-600 group-hover:text-emerald-700"}`}><Check className="size-3" strokeWidth={2.5} aria-hidden /></span>
                    </button>
                  </form>
                  <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 py-1.5">
                    <span className={`block truncate font-semibold ${t.completedAt ? "text-ink-soft" : ""}`}>{t.title}</span>
                    <span className={`block truncate text-xs tabular-nums ${label === "Overdue" ? "text-red-700" : "text-ink-soft"}`}>{[t.date && prettyDate(dateOnly(t.date)), !t.allDay && t.startAt && t.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }), t.clientId && names.get(t.clientId), t.seriesId && "repeats"].filter(Boolean).join(" · ") || "No date"}</span>
                  </Link>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1 max-sm:hidden">{t.assignees.map((a) => <Badge key={a.userId}>{personName(a.user)}</Badge>)}</span>
                  <span className="flex shrink-0 -space-x-1 sm:hidden">{t.assignees.map((a) => <span key={a.userId} role="img" aria-label={personName(a.user)} title={personName(a.user)} className="grid size-6 place-items-center rounded-full border-2 border-white text-[10px] font-semibold text-white" style={{ background: a.user.color }}>{personName(a.user).slice(0, 1).toUpperCase()}</span>)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!tasks.length && <Empty action={<ButtonLink href="/tasks/new"><Plus className="size-4" strokeWidth={1.75} aria-hidden />New task</ButtonLink>}>{who ? "No tasks for this person." : "No tasks yet. Add one here, or click a time on the schedule."}</Empty>}
      </div>
    </>
  );
}
