import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestBadge } from "@/components/status";
import { RecordPanel } from "@/components/record-panel";
import { Button, Card, Dl, PageHeader } from "@/components/ui";
import { dateOnly, prettyDate, prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { setRequestArchived } from "../../actions";
import { requestPhotos } from "../../photo-actions";
import { Gallery } from "@/components/gallery";

export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const r = await db.request.findFirst({
    where: { id, businessId: bid },
    include: { client: true, property: { include: { community: true } }, jobs: true },
  });
  if (!r) notFound();
  const [photos] = await Promise.all([
    db.attachment.findMany({ where: { businessId: bid, requestId: id, deletedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const archived = r.status === "ARCHIVED";
  return (
    <>
      <PageHeader
        title={<>Request #{r.number} <RequestBadge s={r.status} /></>}
        sub={<>From <Link className="font-semibold text-blue" href={`/clients/${r.clientId}`}>{clientName(r.client)}</Link> · {prettyDateTime(r.createdAt)}</>}
        actions={
          <form action={setRequestArchived}>
            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="archive" value={archived ? "0" : "1"} />
            <Button variant="secondary">{archived ? "Unarchive" : "Archive"}</Button>
          </form>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="What they asked for">
            <Dl rows={[
              ["Services", r.services.join("\n")],
              ["Plan", r.snowPlan === "EVERY_SNOWFALL" ? "Every snowfall" : r.snowPlan === "ONE_TIME" ? "One-time visit" : null],
              ["Ice melt", r.iceMelt ? "Yes" : null],
              ["When", r.preferredDate ? prettyDate(dateOnly(r.preferredDate)) : r.snowPlan === "EVERY_SNOWFALL" ? "After every snowfall" : "As soon as possible"],
              ["Estimate", r.estimateText],
              ["Payment", r.preferredPayment === "ETRANSFER" ? "e-Transfer" : r.preferredPayment === "CASH" ? "Cash" : null],
              ["Address", r.property ? <a className="text-blue" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.property.formatted)}`}>{r.property.formatted}</a> : null],
              ["Community", r.property?.community?.name ?? (r.property ? "Unknown (no map pin)" : null)],
              ["Access", r.accessNotes],
              ["Notes", r.notes],
            ]} />
          </Card>
          <Card title="Photos" actions={
            <form action={requestPhotos}><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="back" value={`/requests/${r.id}`} />
              <Button variant="secondary">{sp.sent === "photos" ? "Sent ✓ Send again" : "Ask client for photos"}</Button></form>
          }>
            {photos.length ? <Gallery photos={photos} back={`/requests/${r.id}`} /> : <p className="text-sm text-ink-soft">No photos yet. Quote requests get a &quot;send us photos&quot; link in their confirmation email.</p>}
          </Card>
          <Card title="Jobs from this request">
            {r.jobs.length ? (
              <ul className="divide-y divide-line">
                {r.jobs.map((j) => <li key={j.id}><Link href={`/jobs/${j.id}`} className="block py-2.5 font-semibold text-blue">Job #{j.number}: {j.title}</Link></li>)}
              </ul>
            ) : <p className="text-sm text-ink-soft">This needs a quote.</p>}
            <span className="mt-3 flex flex-wrap gap-2">
              <Link href={`/quotes/new?request=${r.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-sm font-semibold text-white">Convert to quote</Link>
              <Link href={`/jobs/new?request=${r.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Convert to job</Link>
            </span>
          </Card>
        </div>
        <RecordPanel businessId={bid} target={{ requestId: r.id }} clientId={r.clientId} path={`/requests/${r.id}`} />
      </div>
    </>
  );
}
