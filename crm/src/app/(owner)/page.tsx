// Home: what is happening right now (storm, today's route), what needs the owner (to do), then money and pipeline.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Suspense } from "react";
import { Banknote, Check, ChevronRight, ClipboardList, FileText, Hammer, Inbox, MessageSquare, Receipt } from "lucide-react";
import { SnowBanner } from "@/components/snow-banner";
import { Card, Empty } from "@/components/ui";
import { addDays, dateOnly, localDayStart, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { autoPayInTrouble } from "@/server/billing/autopay";
import { clientName, jobsWithStatus } from "@/server/queries";
import { dayProgress } from "@/server/runner";
import { personName, team } from "@/server/schedule";

export const metadata = { title: "Home" };

type TileRow = { label: string; count?: number; value: React.ReactNode; href: string };

/** One workflow tile: the figure that matters most on top, the rest as aligned rows. Tiles in a row share a height. */
function WorkCard({ title, icon, color, href, lead, rows }: { title: string; icon: React.ReactNode; color: string; href: string; lead: TileRow; rows: TileRow[] }) {
  const n = (c?: number) => (c == null ? null : <span className="ml-1 tabular-nums text-ink-soft">({c})</span>);
  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-white shadow-card">
      <h2 className="font-display text-[0.95rem] font-semibold">
        <Link href={href} className="flex min-h-12 items-center gap-2.5 rounded-t-xl px-4 pt-1 hover:text-blue-deep">
          <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${color}`} aria-hidden>{icon}</span>{title}
          <ChevronRight className="ml-auto size-4 text-ink-faint" strokeWidth={1.75} aria-hidden />
        </Link>
      </h2>
      <Link href={lead.href} className="block px-4 pb-3.5 pt-1.5 hover:bg-tint">
        <span className="block text-sm font-medium">{lead.label}{n(lead.count)}</span>
        <span className="mt-1 block font-display text-[1.7rem] font-semibold leading-none tabular-nums">{lead.value}</span>
      </Link>
      <ul className="mt-auto divide-y divide-line-soft border-t border-line-soft text-sm">
        {rows.map((r) => (
          <li key={r.label}>
            <Link href={r.href} className="flex min-h-10 items-center justify-between gap-3 px-4 py-1.5 hover:bg-tint">
              <span className="min-w-0 truncate text-ink-soft">{r.label}{n(r.count)}</span>
              <span className="shrink-0 text-right font-semibold tabular-nums">{r.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const onDark = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 sm:min-h-10";

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
    db.visit.findMany({ where: { businessId: bid, scheduledDate: toDbDate(today), state: { not: "CANCELLED" } }, include: { job: { include: { client: true } }, property: true, assignees: { include: { user: true } } }, orderBy: [{ startAt: "asc" }, { property: { routeSort: "asc" } }] }),
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

  // The words carry the meaning; a red count marks the ones that are already wrong (late, past due, failed).
  const todoAll: { n: number; label: string; href: string; icon: typeof Inbox; tone?: "red" }[] = [
    { n: cnt(requests, (r) => r.status === "NEW"), label: "new requests to review", href: "/requests", icon: Inbox },
    { n: cnt(quotes, (q) => q.status === "APPROVED"), label: "approved quotes to turn into jobs", href: "/quotes?status=APPROVED", icon: FileText },
    { n: cnt(quotes, (q) => q.status === "CHANGES_REQUESTED"), label: "quotes with changes requested", href: "/quotes?status=CHANGES_REQUESTED", icon: FileText },
    { n: jcount("LATE"), label: "late visits", href: "/jobs?status=LATE", icon: Hammer, tone: "red" },
    { n: jcount("UNSCHEDULED") + jcount("ACTION_REQUIRED"), label: "jobs with nothing scheduled", href: "/jobs?status=UNSCHEDULED", icon: Hammer },
    { n: jcount("REQUIRES_INVOICING"), label: "jobs to invoice", href: "/billing", icon: Receipt },
    { n: cnt(invoices, isPastDue), label: "past-due invoices", href: "/invoices?tab=PAST_DUE", icon: Receipt, tone: "red" },
    { n: cnt(invoices, autoPayInTrouble), label: "failed auto-payments", href: "/billing", icon: Receipt, tone: "red" },
    { n: tasksOpen, label: "tasks due", href: "/tasks", icon: ClipboardList },
    { n: depositsWaiting, label: "deposits waiting", href: "/invoices?status=AWAITING_PAYMENT", icon: Banknote },
    { n: toMatch, label: "payments to match", href: "/payments/unmatched", icon: Banknote },
    { n: unread, label: "unread texts", href: "/messages", icon: MessageSquare },
  ];
  const todo = todoAll.filter((t) => t.n > 0);
  const hour = Number(new Date().toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", hourCycle: "h23" }));
  const pct = appts.length ? Math.round((100 * done) / appts.length) : 0;
  const owingCents = owing.reduce((n, i) => n + i.totalCents - i.amountPaidCents, 0);
  const seg = "inline-flex min-h-9 items-center rounded-md px-3 text-sm font-semibold";

  return (
    <>
      {/* The one hero on this page: right now. A storm (or snow on the way) sits beside today's route. */}
      <div className="mb-6 rounded-xl bg-navy p-5 text-white shadow-card sm:p-6">
        <p className="text-sm font-medium text-white/70"><time dateTime={today}>{prettyDate(today)}</time></p>
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight sm:text-[2rem]">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}</h1>
        <div className="mt-5 grid gap-x-8 gap-y-6 border-t border-white/12 pt-5 lg:has-[[data-snow]]:grid-cols-2">
          <Suspense fallback={null}><SnowBanner businessId={bid} /></Suspense>
          <section aria-label="Today's route" className="@container flex min-w-0 flex-col max-lg:[[data-snow]+&]:border-t max-lg:[[data-snow]+&]:border-white/12 max-lg:[[data-snow]+&]:pt-5 lg:[[data-snow]+&]:border-l lg:[[data-snow]+&]:border-white/12 lg:[[data-snow]+&]:pl-8">
            <div className="grid gap-x-10 gap-y-4 @2xl:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-sky">Today&apos;s route</p>
                {appts.length ? (
                  <>
                    <p className="mt-2 font-display text-[1.7rem] font-semibold leading-none tabular-nums">{done} of {appts.length} <span className="text-base font-medium text-white/70">done · {appts.length - done} to go</span></p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Today's progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                    </div>
                  </>
                ) : <p className="mt-2 text-base text-white/80">Nothing on the schedule today.</p>}
              </div>
              {progress.length > 0 && (
                <ul className="space-y-2 self-end text-sm">
                  {progress.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5">
                      <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/40" style={{ background: p.color ?? "#94a3b8" }} aria-hidden />
                      <span className="w-24 truncate font-medium">{p.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden><span className="block h-full rounded-full bg-sky" style={{ width: `${(p.done / p.total) * 100}%` }} /></span>
                      <span className="w-20 text-right tabular-nums text-white/80">{p.done} of {p.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              {progress.length > 0 && <Link href="/run" className={onDark}>Open my route</Link>}
              <Link href="/schedule" className={onDark}>Open the schedule</Link>
            </div>
          </section>
        </div>
      </div>

      <Card className="mb-5" title="Needs you" actions={todo.length > 0 ? <span className="text-xs font-medium tabular-nums text-ink-soft">{todo.length} thing{todo.length === 1 ? "" : "s"}</span> : undefined}>
        {todo.length ? (
          <ul className="-mx-2 -mb-1 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-tint">
                  <span className={`w-9 shrink-0 text-right font-display text-lg font-semibold leading-none tabular-nums ${t.tone === "red" ? "text-red-700" : ""}`}>{t.n}</span>
                  <t.icon className="size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1 leading-snug">{t.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="flex items-center gap-2 text-sm text-ink-soft"><Check className="size-4 text-emerald-700" strokeWidth={1.75} aria-hidden />All caught up. Nothing is waiting on you.</p>}
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WorkCard title="Requests" href="/requests" color="bg-orange-100 text-orange-800" icon={<Inbox className="size-4" strokeWidth={1.75} />}
          lead={{ label: "New", value: cnt(requests, (r) => r.status === "NEW"), href: "/requests" }}
          rows={[
            { label: "Assessment booked", value: cnt(requests, (r) => r.status === "ASSESSMENT_SCHEDULED"), href: "/requests" },
            { label: "Waiting 3+ days", value: cnt(requests, (r) => r.status === "NEW" && r.createdAt < stale), href: "/requests" },
          ]} />
        <WorkCard title="Quotes" href="/quotes" color="bg-rose-100 text-rose-800" icon={<FileText className="size-4" strokeWidth={1.75} />}
          lead={{ label: "Approved", count: cnt(quotes, (q) => q.status === "APPROVED"), value: cad(sum(quotes, (q) => q.status === "APPROVED", (q) => q.totalCents)), href: "/quotes?status=APPROVED" }}
          rows={[
            { label: "Awaiting response", count: cnt(quotes, (q) => q.status === "AWAITING_RESPONSE"), value: cad(sum(quotes, (q) => q.status === "AWAITING_RESPONSE", (q) => q.totalCents)), href: "/quotes?status=AWAITING_RESPONSE" },
            { label: "Changes requested", value: cnt(quotes, (q) => q.status === "CHANGES_REQUESTED"), href: "/quotes?status=CHANGES_REQUESTED" },
            { label: "Drafts", value: cnt(quotes, (q) => q.status === "DRAFT"), href: "/quotes?status=DRAFT" },
          ]} />
        <WorkCard title="Jobs" href="/jobs" color="bg-emerald-100 text-emerald-800" icon={<Hammer className="size-4" strokeWidth={1.75} />}
          lead={{ label: "Requires invoicing", count: jcount("REQUIRES_INVOICING"), value: cad(unbilled._sum.totalCents ?? 0), href: "/billing" }}
          rows={[
            { label: "Active", value: jobs.filter((j) => j.status !== "ARCHIVED").length, href: "/jobs" },
            { label: "Late", value: jcount("LATE"), href: "/jobs?status=LATE" },
            { label: "Action required", value: jcount("ACTION_REQUIRED") + jcount("UNSCHEDULED"), href: "/jobs?status=ACTION_REQUIRED" },
          ]} />
        <WorkCard title="Invoices" href="/invoices" color="bg-blue/10 text-blue-deep" icon={<Receipt className="size-4" strokeWidth={1.75} />}
          lead={{ label: "Awaiting payment", count: owing.length, value: cad(owingCents), href: "/invoices" }}
          rows={[
            { label: "Past due", count: cnt(invoices, isPastDue), value: cad(sum(invoices, isPastDue, (i) => i.totalCents - i.amountPaidCents)), href: "/invoices?tab=PAST_DUE" },
            { label: "Drafts", value: cnt(invoices, (i) => i.status === "DRAFT"), href: "/invoices?tab=DRAFT" },
          ]} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Today's appointments" actions={
          <div className="flex gap-1 rounded-lg bg-tint p-1" role="group" aria-label="Group by">
            <Link href="/" aria-current={!byPerson ? "true" : undefined} className={`${seg} ${!byPerson ? "bg-white text-navy shadow-sm" : "text-ink-soft hover:text-navy"}`}>Visits</Link>
            <Link href="/?view=people" aria-current={byPerson ? "true" : undefined} className={`${seg} ${byPerson ? "bg-white text-navy shadow-sm" : "text-ink-soft hover:text-navy"}`}>People</Link>
          </div>
        }>
          {groups.length ? (
            <>
              <p className="-mt-1 mb-2 text-xs tabular-nums text-ink-soft">{appts.length} total · {done} done · {appts.length - done} remaining</p>
              {groups.map((g) => (
                <details key={g.label} open={g.label !== "Completed"} className="border-t border-line-soft">
                  <summary className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-navy">
                    {g.color && <span className="size-2 rounded-full" style={{ background: g.color }} aria-hidden />}{g.label}<span className="tabular-nums">({g.list.length})</span>
                  </summary>
                  <ul className="divide-y divide-line-soft pb-2">
                    {g.list.map((a) => (
                      <li key={a.key}>
                        <Link href={a.href} className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 hover:bg-tint">
                          <span className={`grid size-5 shrink-0 place-items-center rounded-full ${a.done ? "bg-emerald-600 text-white" : "border-[1.5px] border-ink-faint/60"}`} aria-hidden>{a.done && <Check className="size-3" strokeWidth={2.5} />}</span>
                          <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-ink-soft">{a.time}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate font-semibold ${a.done ? "text-ink-soft" : ""}`}>{a.title}{a.done && <span className="sr-only"> (done)</span>}</span>
                            <span className="block truncate text-xs text-ink-soft">{a.sub}</span>
                          </span>
                          <span className="flex shrink-0 -space-x-1">{a.people.map((p) => <span key={p.id} title={p.name} aria-label={p.name} role="img" className="grid size-6 place-items-center rounded-full border-2 border-white text-[10px] font-semibold text-white" style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</span>)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </>
          ) : <Empty action={<Link href="/schedule" className="text-sm font-semibold text-blue hover:text-blue-deep">Open the schedule</Link>}>Nothing on the schedule today.</Empty>}
        </Card>

        <Card title="Business performance">
          <dl className="divide-y divide-line-soft text-sm">
            <div className="pb-3">
              <dt className="text-xs font-medium text-ink-soft">Receivables</dt>
              <dd className="mt-1 font-display text-[1.7rem] font-semibold leading-none tabular-nums">{cad(owingCents)}</dd>
              <dd className="mt-1.5 text-xs text-ink-soft">from {owingBy.size} client{owingBy.size === 1 ? "" : "s"}</dd>
              {topOwing.length > 0 && (
                <dd className="mt-2">
                  <ul>
                    {topOwing.map((o) => (
                      <li key={o.id}>
                        <Link href={`/clients/${o.id}`} className="-mx-2 flex min-h-9 items-center justify-between gap-3 rounded-lg px-2 hover:bg-tint">
                          <span className="flex min-w-0 items-baseline gap-1.5"><span className="truncate">{o.name}</span>{o.late && <span className="shrink-0 text-xs font-medium text-red-700">past due</span>}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{cad(o.cents)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </dd>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3"><dt className="text-ink-soft">Visits in the next 7 days</dt><dd className="font-display text-lg font-semibold tabular-nums">{weekVisits}</dd></div>
            <div className="flex items-baseline justify-between gap-3 pt-3"><dt className="text-ink-soft">Collected this month</dt><dd className="font-display text-lg font-semibold tabular-nums">{cad((paidThisMonth._sum.amountCents ?? 0) - (paidThisMonth._sum.refundedCents ?? 0))}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
