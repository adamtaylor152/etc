// Day agenda for the next two weeks, plus late and unscheduled visits. (Full calendar views come in M7.)
import Link from "next/link";
import { VisitBadge } from "@/components/status";
import { Card, Empty, PageHeader } from "@/components/ui";
import { addDays, dateOnly, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { visitStatus } from "@/server/status/job";

export const metadata = { title: "Schedule" };

export default async function Schedule() {
  const bid = await businessId();
  const today = todayLocal();
  const end = addDays(today, 14);
  const visits = await db.visit.findMany({
    where: {
      businessId: bid, state: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] }, job: { closedAt: null },
      OR: [{ scheduledDate: null }, { scheduledDate: { lte: toDbDate(end) } }],
    },
    include: { job: { include: { client: true } }, property: { include: { community: true } } },
    orderBy: [{ scheduledDate: "asc" }, { routeSort: "asc" }],
  });
  const buckets = new Map<string, typeof visits>();
  for (const v of visits) {
    const d = dateOnly(v.scheduledDate);
    const key = !d ? "unscheduled" : d < today ? "late" : d;
    buckets.set(key, [...(buckets.get(key) ?? []), v]);
  }
  const days = Array.from({ length: 15 }, (_, i) => addDays(today, i));
  const sections: [string, string, typeof visits][] = [
    ["late", "Late", buckets.get("late") ?? []],
    ...days.map((d): [string, string, typeof visits] => [d, d === today ? `Today · ${prettyDate(d)}` : prettyDate(d), buckets.get(d) ?? []]),
    ["unscheduled", "Not scheduled yet", buckets.get("unscheduled") ?? []],
  ];
  return (
    <>
      <PageHeader title="Schedule" sub="Next two weeks. Snow-plan visits appear when a storm starts." />
      <div className="space-y-4">
        {sections.filter(([k, , list]) => list.length || k === today).map(([k, label, list]) => (
          <Card key={k} title={label} actions={/^\d/.test(k) && list.length > 0 && <Link className="text-sm font-semibold text-blue" href={`/routes?date=${k}`}>Route</Link>}>
            {list.length ? (
              <ul className="divide-y divide-line">
                {list.map((v) => (
                  <li key={v.id}>
                    <Link href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0"><span className="font-semibold">{clientName(v.job.client)}</span>
                        <span className="block truncate text-ink-soft">{v.job.title} · {v.property.formatted}</span></span>
                      <VisitBadge s={visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, today)} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>Nothing booked.</Empty>}
          </Card>
        ))}
      </div>
    </>
  );
}
