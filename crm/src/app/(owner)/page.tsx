// Home (Jobber layout): workflow cards, today's appointments (by visit or by person), to-do list, business performance.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Banknote, Check, ClipboardList, FileText, Hammer, Inbox, MessageSquare, Receipt } from "lucide-react";
import { SnowBanner } from "@/components/snow-banner";
import { addDays, dateOnly, localDayStart, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName, jobsWithStatus } from "@/server/queries";
import { dayProgress } from "@/server/runner";
import { personName, team } from "@/server/schedule";

export const metadata = { title: "Home" };

function WorkCard({ title, icon, color, href, rows }: { title: string; icon: React.ReactNode; color: string; href: string; rows: { label: string; value: React.ReactNode; href: string; strong?: boolean }[] }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <Link href={href} className="mb-3 flex items-center gap-2 text-sm font-bold"><span className={`grid size-7 place-items-center rounded-full ${color}`}>{icon}</span>{title}<ArrowRight className="ml-auto size-4 text-ink-soft" /></Link>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => <li key={r.label}><Link href={r.href} className="flex justify-between gap-2 hover:text-blue"><span className="text-ink-soft">{r.label}</span><span className={r.strong ? "font-bold" : "font-semibold"}>{r.value}</span></Link></li>)}
      </ul>
    </section>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  await requireOwner();
  const sp = await searchParams;
  const byPerson = sp.view === "people";
  const bid = await businessId();
  const today = todayLocal();
  const monthStart = localDayStart(`${today.slice(0, 7)}-01`);
  const weekEnd = addDays(today, 7);
  const progress = await dayProgress(bid, today);
  const [requests, quotes, jobs, invoices, unbilled, visitsToday, tasksToday, tasksOpen, toMatch, unread, paidThisMonth, weekVisits, people] = await Promise.all([
    db.request.findMany({ where: { businessId: bid, status: { in: ["NEW", "ASSESSMENT_SCHEDULED"] } }, select: { status: true, createdAt: true, assessmentAt: true } }),
    db.quote.findMany({ where: { businessId: bid, status: { in: ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED"] } }, select: { status: true, totalCents: true } }),
    jobsWithStatus({ businessId: bid, closedAt: null }, today),
    db.invoice.findMany({ where: { businessId: bid, status: { in: ["DRAFT", "AWAITING_PAYMENT"] } }, include: { client: true } }),
    db.visitCharge.aggregate({ where: { businessId: bid, invoiceLineItemId: null }, _sum: { totalCents: true } }),
    db.visit.findMany({ where: { businessId: bid, scheduledDate: toDbDate(today), state: { not: "CANCELLED" } }, include: { job: { include: { client: true } }, property: true, assignees: { include: { user: true } } }, orderBy: [{ startAt: "asc" }, { routeSort: "asc" }] }),
    db.task.findMany({ where: { businessId: bid, date: toDbDate(today) }, include: { assignees: { include: { user: true } } }, orderBy: { startAt: "asc" } }),
    db.task.count({ where: { businessId: bid, kind: "TASK", completedAt: null, date: { lte: toDbDate(today) } } }),
    db.unmatchedPayment.count({ where: { businessId: bid, status: "OPEN" } }),
    db.textMessage.count({ where: { businessId: bid, direction: "IN", readAt: null } }),
    db.payment.aggregate({ where: { businessId: bid, receivedAt: { gte: monthStart } }, _sum: { amountCents: true, refundedCents: true } }),
    db.visit.count({ where: { businessId: bid, state: "SCHEDULED", scheduledDate: { gte: toDbDate(today), lte: toDbDate(weekEnd) } } }),
    team(bid),
  ]);
  const cnt = <T,>(l: T[], f: (x: T) => boolean) => l.filter(f).length;
  const depositsWaiting = invoices.filter((i) => i.kind === "DEPOSIT" && i.status === "AWAITING_PAYMENT").length;
  const sum = <T,>(l: T[], f: (x: T) => boolean, v: (x: T) => number) => l.filter(f).reduce((n, x) => n + v(x), 0);
  const stale = localDayStart(addDays(today, -3));
  const isPastDue = (i: (typeof invoices)[number]) => i.status === "AWAITING_PAYMENT" && !!i.dueOn && dateOnly(i.dueOn)! < today;
  const owing = invoices.filter((i) => i.status === "AWAITING_PAYMENT");
  const owingBy = new Map<string, { name: string; id: string; cents: number; late: boolean }>();
  for (const i of owing) {
    const cur = owingBy.get(i.clientId) ?? { name: clientName(i.client), id: i.clientId, cents: 0, late: false };
    cur.cents += i.totalCents - i.amountPaidCents; cur.late ||= isPastDue(i);
    owingBy.set(i.clientId, cur);
  }
  const topOwing = [...owingBy.values()].sort((a, b) => Number(b.late) - Number(a.late) || b.cents - a.cents).slice(0, 3);
  const jcount = (s: string) => jobs.filter((j) => j.status === s).length;

  type Appt = { key: string; title: string; sub: string; href: string; done: boolean; time: string; people: { id: string; name: string; color: string }[] };
  const appts: Appt[] = [
    ...visitsToday.map((v) => ({
      key: v.id, title: `${clientName(v.job.client)} · ${v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title}`, sub: v.property.formatted.split(",")[0], href: `/visits/${v.id}`,
      done: v.state === "COMPLETED" || v.state === "SKIPPED", time: v.startAt && !v.anytime ? v.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }) : "Any time",
      people: v.assignees.map((a) => ({ id: a.user.id, name: personName(a.user), color: a.user.color })),
    })),
    ...tasksToday.map((t) => ({
      key: t.id, title: t.title, sub: t.kind === "EVENT" ? "Event" : "Task", href: `/tasks/${t.id}`, done: !!t.completedAt,
      time: !t.allDay && t.startAt ? t.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }) : "Any time",
      people: t.assignees.map((a) => ({ id: a.user.id, name: personName(a.user), color: a.user.color })),
    })),
  ];
  const done = appts.filter((a) => a.done).length;
  const groups = byPerson
    ? [...people.map((p) => ({ label: p.name, color: p.color, list: appts.filter((a) => a.people.some((x) => x.id === p.id)) })), { label: "Unassigned", color: "#94a3b8", list: appts.filter((a) => !a.people.length) }].filter((g) => g.list.length)
    : [{ label: "Remaining", color: "", list: appts.filter((a) => !a.done) }, { label: "Completed", color: "", list: appts.filter((a) => a.done) }].filter((g) => g.list.length);

  const todo = [
    { n: cnt(requests, (r) => r.status === "NEW"), label: "new requests to review", href: "/requests", icon: <Inbox className="size-4 text-orange-700" /> },
    { n: cnt(quotes, (q) => q.status === "APPROVED"), label: "approved quotes to turn into jobs", href: "/quotes?status=APPROVED", icon: <FileText className="size-4 text-rose-700" /> },
    { n: cnt(quotes, (q) => q.status === "CHANGES_REQUESTED"), label: "quotes with changes requested", href: "/quotes?status=CHANGES_REQUESTED", icon: <FileText className="size-4 text-rose-700" /> },
    { n: jcount("LATE"), label: "late visits", href: "/jobs?status=LATE", icon: <Hammer className="size-4 text-red-700" /> },
    { n: jcount("UNSCHEDULED") + jcount("ACTION_REQUIRED"), label: "jobs with nothing scheduled", href: "/jobs?status=UNSCHEDULED", icon: <Hammer className="size-4 text-emerald-700" /> },
    { n: jcount("REQUIRES_INVOICING"), label: "jobs to invoice", href: "/billing", icon: <Receipt className="size-4 text-blue" /> },
    { n: cnt(invoices, isPastDue), label: "past-due invoices", href: "/invoices?tab=PAST_DUE", icon: <Receipt className="size-4 text-red-700" /> },
    { n: tasksOpen, label: "tasks due", href: "/tasks", icon: <ClipboardList className="size-4 text-navy" /> },
    { n: depositsWaiting, label: "deposits waiting", href: "/invoices?status=AWAITING_PAYMENT", icon: <Banknote className="size-4 text-blue" /> },
    { n: toMatch, label: "payments to match", href: "/payments/unmatched", icon: <Banknote className="size-4 text-amber-700" /> },
    { n: unread, label: "unread texts", href: "/messages", icon: <MessageSquare className="size-4 text-indigo-700" /> },
  ].filter((t) => t.n > 0);
  const hour = Number(new Date().toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", hourCycle: "h23" }));

  return (
    <>
      <div className="mb-5">
        <p className="text-sm font-semibold text-ink-soft">{prettyDate(today)}</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}</h1>
      </div>
      <Suspense fallback={null}><SnowBanner businessId={bid} /></Suspense>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WorkCard title="Requests" href="/requests" color="bg-orange-100 text-orange-800" icon={<Inbox className="size-4" />} rows={[
          { label: "New", value: cnt(requests, (r) => r.status === "NEW"), href: "/requests", strong: true },
          { label: "Assessment booked", value: cnt(requests, (r) => r.status === "ASSESSMENT_SCHEDULED"), href: "/requests" },
          { label: "Waiting 3+ days", value: cnt(requests, (r) => r.status === "NEW" && r.createdAt < stale), href: "/requests" },
        ]} />
        <WorkCard title="Quotes" href="/quotes" color="bg-rose-100 text-rose-800" icon={<FileText className="size-4" />} rows={[
          { label: `Approved (${cnt(quotes, (q) => q.status === "APPROVED")})`, value: money(sum(quotes, (q) => q.status === "APPROVED", (q) => q.totalCents)), href: "/quotes?status=APPROVED", strong: true },
          { label: `Awaiting response (${cnt(quotes, (q) => q.status === "AWAITING_RESPONSE")})`, value: money(sum(quotes, (q) => q.status === "AWAITING_RESPONSE", (q) => q.totalCents)), href: "/quotes?status=AWAITING_RESPONSE" },
          { label: "Changes requested", value: cnt(quotes, (q) => q.status === "CHANGES_REQUESTED"), href: "/quotes?status=CHANGES_REQUESTED" },
          { label: "Drafts", value: cnt(quotes, (q) => q.status === "DRAFT"), href: "/quotes?status=DRAFT" },
        ]} />
        <WorkCard title="Jobs" href="/jobs" color="bg-emerald-100 text-emerald-800" icon={<Hammer className="size-4" />} rows={[
          { label: `Requires invoicing (${jcount("REQUIRES_INVOICING")})`, value: money(unbilled._sum.totalCents ?? 0), href: "/billing", strong: true },
          { label: "Active", value: jobs.filter((j) => j.status !== "ARCHIVED").length, href: "/jobs" },
          { label: "Late", value: jcount("LATE"), href: "/jobs?status=LATE" },
          { label: "Action required", value: jcount("ACTION_REQUIRED") + jcount("UNSCHEDULED"), href: "/jobs?status=ACTION_REQUIRED" },
        ]} />
        <WorkCard title="Invoices" href="/invoices" color="bg-blue/10 text-blue" icon={<Receipt className="size-4" />} rows={[
          { label: `Awaiting payment (${owing.length})`, value: money(owing.reduce((n, i) => n + i.totalCents - i.amountPaidCents, 0)), href: "/invoices", strong: true },
          { label: `Past due (${cnt(invoices, isPastDue)})`, value: money(sum(invoices, isPastDue, (i) => i.totalCents - i.amountPaidCents)), href: "/invoices?tab=PAST_DUE" },
          { label: "Drafts", value: cnt(invoices, (i) => i.status === "DRAFT"), href: "/invoices?tab=DRAFT" },
        ]} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-white p-4 shadow-card lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Today&apos;s appointments</h2>
              <p className="text-xs text-ink-soft">{appts.length} total · {done} done · {appts.length - done} remaining</p>
            </div>
            <div className="flex gap-1 rounded-lg bg-tint p-1 text-xs font-semibold">
              <Link href="/" className={`rounded-md px-2.5 py-1 ${!byPerson ? "bg-white shadow-sm" : "text-ink-soft"}`}>Visits</Link>
              <Link href="/?view=people" className={`rounded-md px-2.5 py-1 ${byPerson ? "bg-white shadow-sm" : "text-ink-soft"}`}>People</Link>
            </div>
          </div>
          {progress.length > 0 && (
            <div className="mb-3 space-y-1.5 rounded-lg bg-tint p-3">
              {progress.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate font-semibold">{p.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full" style={{ width: `${(p.done / p.total) * 100}%`, background: p.color ?? "#0f766e" }} /></span>
                  <span className="w-10 text-right tabular-nums text-ink-soft">{p.done}/{p.total}</span>
                </div>
              ))}
              <Link href="/run" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue">Open my route <ArrowRight className="size-3" /></Link>
            </div>
          )}
          {groups.length ? groups.map((g) => (
            <div key={g.label} className="mb-3 last:mb-0">
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">{g.color && <span className="size-2 rounded-full" style={{ background: g.color }} />}{g.label} ({g.list.length})</h3>
              <ul className="divide-y divide-line">
                {g.list.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 py-2.5">
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full ${a.done ? "bg-emerald-600 text-white" : "border-2 border-line"}`}>{a.done && <Check className="size-3.5" />}</span>
                      <span className="w-16 shrink-0 text-xs font-semibold text-ink-soft">{a.time}</span>
                      <span className="min-w-0 flex-1"><span className={`block truncate font-semibold ${a.done ? "text-ink-soft line-through" : ""}`}>{a.title}</span><span className="block truncate text-xs text-ink-soft">{a.sub}</span></span>
                      <span className="flex -space-x-1">{a.people.map((p) => <span key={p.id} title={p.name} className="grid size-6 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white" style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</span>)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )) : <p className="py-6 text-center text-sm text-ink-soft">Nothing on the schedule today. <Link href="/schedule" className="font-semibold text-blue">Open the schedule</Link></p>}
        </section>

        <div className="space-y-5">
          <section className="rounded-lg border border-line bg-white p-4 shadow-card">
            <h2 className="mb-2 text-base font-bold">To do</h2>
            {todo.length ? (
              <ul className="space-y-1">
                {todo.map((t) => <li key={t.label}><Link href={t.href} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-tint">{t.icon}<span className="font-bold">{t.n}</span><span className="text-ink-soft">{t.label}</span></Link></li>)}
              </ul>
            ) : <p className="text-sm text-ink-soft">All caught up. 🎉</p>}
          </section>
          <section className="rounded-lg border border-line bg-white p-4 shadow-card">
            <h2 className="mb-3 text-base font-bold">Business performance</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-ink-soft">Receivables</dt>
                <dd className="font-display text-xl font-bold">{money(owing.reduce((n, i) => n + i.totalCents - i.amountPaidCents, 0))} <span className="text-sm font-normal text-ink-soft">from {owingBy.size} client{owingBy.size === 1 ? "" : "s"}</span></dd>
                {topOwing.map((o) => <dd key={o.id}><Link href={`/clients/${o.id}`} className="flex justify-between text-xs hover:text-blue"><span>{o.name}{o.late && <span className="ml-1 text-red-700">past due</span>}</span><span className="font-semibold">{money(o.cents)}</span></Link></dd>)}
              </div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Visits in the next 7 days</dt><dd className="font-display text-xl font-bold">{weekVisits}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Collected this month</dt><dd className="font-display text-xl font-bold">{money((paidThisMonth._sum.amountCents ?? 0) - (paidThisMonth._sum.refundedCents ?? 0))}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
