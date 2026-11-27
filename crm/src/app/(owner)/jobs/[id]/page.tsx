import Link from "next/link";
import { notFound } from "next/navigation";
import { JobBadge, VisitBadge } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { Card, Dl, Empty, PageHeader } from "@/components/ui";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName, jobsWithStatus } from "@/server/queries";
import { visitStatus } from "@/server/status/job";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const bid = await businessId();
  const [row] = await jobsWithStatus({ id, businessId: bid });
  if (!row) notFound();
  const job = await db.job.findUniqueOrThrow({
    where: { id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, visits: { orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }] }, season: true, request: true, property: { include: { community: true } } },
  });
  const [notes, events] = await Promise.all([
    db.note.findMany({ where: { businessId: bid, jobId: id }, orderBy: { createdAt: "desc" } }),
    db.activityEvent.findMany({ where: { businessId: bid, jobId: id }, orderBy: { at: "desc" } }),
  ]);
  const today = todayLocal();
  const plan = job.kind === "SNOW_PLAN";
  return (
    <>
      <PageHeader
        title={<>Job #{job.number}: {job.title} <JobBadge s={row.status} /></>}
        sub={<><Link className="font-semibold text-blue" href={`/clients/${job.clientId}`}>{clientName(row.client)}</Link> · {job.property.formatted}</>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Details">
            <Dl rows={[
              ["Kind", plan ? "Every-snowfall plan" : job.kind === "ONE_OFF" ? "One-off" : "Recurring"],
              ["Season", job.season?.name],
              ["Trigger", plan ? `${job.triggerCm ?? job.season?.defaultTriggerCm ?? 2} cm or more` : null],
              ["Price", plan && job.pricePerPushCents != null ? `${money(job.pricePerPushCents)} per push${job.iceMelt ? " + ice melt" : ""}` : null],
              ["Community", job.property.community?.name],
              ["Instructions", job.instructions],
              ["From request", job.request ? <Link className="text-blue" href={`/requests/${job.request.id}`}>#{job.request.number}</Link> : null],
            ]} />
          </Card>
          <Card title="Line items">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {job.lineItems.map((l) => (
                  <tr key={l.id}><td className="py-2">{l.name}</td><td className="py-2 text-right text-ink-soft">{String(l.quantity)} ×</td><td className="py-2 text-right font-semibold">{money(l.unitPriceCents)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-soft">Prices include tax.</p>
          </Card>
          <Card title="Visits">
            {job.visits.length ? (
              <ul className="divide-y divide-line">
                {job.visits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Not scheduled yet"}{v.pushNumber ? ` · push ${v.pushNumber}` : ""}</span>
                    <VisitBadge s={visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, today)} />
                  </li>
                ))}
              </ul>
            ) : <Empty>{plan ? "Visits appear here when a storm starts." : "No visits yet."}</Empty>}
          </Card>
        </div>
        <Timeline notes={notes} events={events} target={{ jobId: job.id, clientId: job.clientId }} path={`/jobs/${job.id}`} />
      </div>
    </>
  );
}
