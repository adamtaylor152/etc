import Link from "next/link";
import { JobBadge, RequestBadge } from "@/components/status";
import { Card, Empty, PageHeader } from "@/components/ui";
import { prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName, jobsWithStatus } from "@/server/queries";

export const metadata = { title: "Today" };

export default async function Dashboard() {
  const bid = await businessId();
  const today = todayLocal();
  const [newRequests, jobs, plans] = await Promise.all([
    db.request.findMany({ where: { businessId: bid, status: "NEW" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    jobsWithStatus({ businessId: bid, closedAt: null }, today),
    db.job.count({ where: { businessId: bid, kind: "SNOW_PLAN", closedAt: null, planPausedAt: null } }),
  ]);
  const count = (s: string) => jobs.filter((j) => j.status === s).length;
  const attention = jobs.filter((j) => ["LATE", "TODAY", "UNSCHEDULED", "REQUIRES_INVOICING"].includes(j.status));

  return (
    <>
      <PageHeader title="Today" sub={prettyDate(today)} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["New requests", newRequests.length, "/requests"],
          ["Today", count("TODAY"), "/jobs?status=TODAY"],
          ["Unscheduled", count("UNSCHEDULED") + count("LATE"), "/jobs?status=UNSCHEDULED"],
          ["Every-snowfall plans", plans, "/jobs?kind=SNOW_PLAN"],
        ].map(([label, n, href]) => (
          <Link key={label} href={String(href)} className="rounded-2xl border border-line bg-white p-4 hover:border-blue">
            <div className="font-display text-3xl font-bold">{n}</div>
            <div className="text-sm text-ink-soft">{label}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Needs attention">
          {attention.length ? (
            <ul className="divide-y divide-line">
              {attention.map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-3">
                    <span><span className="font-semibold">{clientName(j.client)}</span><span className="block text-sm text-ink-soft">{j.title} · {j.property.formatted}</span></span>
                    <JobBadge s={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>All caught up.</Empty>}
        </Card>
        <Card title="New requests" actions={<Link href="/requests" className="text-sm font-semibold text-blue">All</Link>}>
          {newRequests.length ? (
            <ul className="divide-y divide-line">
              {newRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 py-3">
                    <span><span className="font-semibold">#{r.number} {clientName(r.client)}</span><span className="block text-sm text-ink-soft">{r.title} · {prettyDateTime(r.createdAt)}</span></span>
                    <RequestBadge s={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>No new requests.</Empty>}
        </Card>
      </div>
    </>
  );
}
