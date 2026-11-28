import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestBadge } from "@/components/status";
import { RecordPanel } from "@/components/record-panel";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Button, ButtonLink, Card, Dl, Empty, Input, Notice } from "@/components/ui";
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
  const open = r.status === "NEW" || r.status === "ASSESSMENT_SCHEDULED";
  const link = "font-semibold text-blue hover:text-blue-deep";
  return (
    <>
      <DetailHeader
        back={{ href: "/requests", label: "Requests" }}
        kind={<span className="tabular-nums">Request #{r.number}</span>}
        status={<RequestBadge s={r.status} />}
        title={r.title}
        sub={<>From <Link className={link} href={`/clients/${r.clientId}`}>{clientName(r.client)}</Link> · <span className="tabular-nums">{prettyDateTime(r.createdAt)}</span></>}
        actions={<>
          <ButtonLink href={`/jobs/new?request=${r.id}`}>Convert to job</ButtonLink>
          <ButtonLink href={`/quotes/new?request=${r.id}`} variant={open ? "primary" : "secondary"}>Convert to quote</ButtonLink>
          {archived && (
            <form action={setRequestArchived}>
              <input type="hidden" name="id" value={r.id} /><input type="hidden" name="archive" value="0" />
              <Button>Unarchive</Button>
            </form>
          )}
        </>}
      />
      <Flash error={sp.error} />
      {r.client.doNotService && <Notice tone="bad"><span className="font-semibold">This client is marked “do not service”.</span> Check their notes before quoting or booking.</Notice>}
      {archived && <Notice tone="warn">Archived{r.lostReason ? `: ${r.lostReason}.` : "."} Unarchive it to pick it back up.</Notice>}
      {r.status === "NEW" && <Notice>New request. Next step: send a quote, or book it straight to a job.</Notice>}
      {r.status === "ASSESSMENT_SCHEDULED" && <Notice>Assessment booked{r.assessmentAt ? ` for ${prettyDateTime(r.assessmentAt)}` : ""}: after the visit, send a quote or book the job.</Notice>}
      {sp.sent === "photos" && <Notice tone="good">Photo request sent to {r.client.firstName}.</Notice>}
      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card title="What they asked for">
            <Dl rows={[
              ["Services", r.services.join("\n")],
              ["Plan", r.snowPlan === "EVERY_SNOWFALL" ? "Every snowfall" : r.snowPlan === "ONE_TIME" ? "One-time visit" : null],
              ["Ice melt", r.iceMelt ? "Yes" : null],
              ["When", r.preferredDate ? prettyDate(dateOnly(r.preferredDate)) : r.snowPlan === "EVERY_SNOWFALL" ? "After every snowfall" : "As soon as possible"],
              ["Estimate", r.estimateText],
              ["Payment", r.preferredPayment === "ETRANSFER" ? "e-Transfer" : r.preferredPayment === "CASH" ? "Cash" : null],
              ["Address", r.property ? <a className={link} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.property.formatted)}`}>{r.property.formatted}</a> : null],
              ["Community", r.property?.community?.name ?? (r.property ? "Unknown (no map pin)" : null)],
              ["Access", r.accessNotes],
              ["Notes", r.notes],
            ]} />
          </Card>
          <Card title="Photos" actions={
            <form action={requestPhotos}><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="back" value={`/requests/${r.id}`} />
              <Button variant="secondary">{sp.sent === "photos" ? "Send again" : "Ask client for photos"}</Button></form>
          }>
            {photos.length ? <Gallery photos={photos} back={`/requests/${r.id}`} /> : <p className="max-w-[70ch] text-sm text-ink-soft">No photos yet. Quote requests get a &quot;send us photos&quot; link in their confirmation email.</p>}
          </Card>
          <Card title="Jobs from this request">
            {r.jobs.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {r.jobs.map((j) => <li key={j.id}><Link href={`/jobs/${j.id}`} className={`block py-2.5 text-sm ${link}`}><span className="tabular-nums">Job #{j.number}</span>: {j.title}</Link></li>)}
              </ul>
            ) : <Empty action={<ButtonLink href={`/quotes/new?request=${r.id}`}>Convert to quote</ButtonLink>}>No jobs yet. This needs a quote.</Empty>}
          </Card>
          {!archived && (
            <Card title="Not going ahead?">
              <form action={setRequestArchived} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="archive" value="1" />
                <label className="min-w-0 flex-1 basis-56"><span className="mb-1 block text-sm font-semibold">Why? (optional)</span><Input name="reason" maxLength={200} placeholder="Too far, went with someone else…" aria-label="Reason it didn't go ahead" /></label>
                <Button variant="danger">Archive request</Button>
              </form>
              <p className="mt-2 text-xs text-ink-soft">Archiving takes it off the open list and counts it as lost in the pipeline. You can unarchive it later.</p>
            </Card>
          )}
        </div>
        <RecordPanel businessId={bid} target={{ requestId: r.id }} clientId={r.clientId} path={`/requests/${r.id}`} />
      </div>
    </>
  );
}
