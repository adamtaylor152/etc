import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { Gallery } from "@/components/gallery";
import { PhotoUploader } from "@/components/photo-uploader";
import { JobBadge, VisitBadge } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { Button, Card, Dl, Empty, Input, PageHeader } from "@/components/ui";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName, jobsWithStatus } from "@/server/queries";
import { visitStatus } from "@/server/status/job";
import { invoiceCreate } from "../../billing-actions";
import { RepeatFields } from "@/components/repeat-fields";
import { describeRule } from "@/server/recurrence";
import { jobClose, planPause, recurringUpdate, planUpdate, visitAdd, visitDelete, visitSchedule } from "../../work-actions";

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const [row] = await jobsWithStatus({ id, businessId: bid });
  if (!row) notFound();
  const job = await db.job.findUniqueOrThrow({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } }, season: true, request: true, property: { include: { community: true } },
      visits: { orderBy: [{ scheduledDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], include: { charges: true, snowEvent: true } },
      invoices: { orderBy: { number: "desc" } },
    },
  });
  const [notes, events, photos] = await Promise.all([
    db.note.findMany({ where: { businessId: bid, jobId: id }, orderBy: { createdAt: "desc" } }),
    db.activityEvent.findMany({ where: { businessId: bid, jobId: id }, orderBy: { at: "desc" }, take: 60 }),
    // Photos the client sent with their request show up on the job too.
    db.attachment.findMany({
      where: { businessId: bid, deletedAt: null, OR: [{ jobId: id }, ...(job.requestId ? [{ requestId: job.requestId }] : [])] },
      orderBy: { createdAt: "desc" }, take: 60,
    }),
  ]);
  const today = todayLocal();
  const here = `/jobs/${id}`;
  const plan = job.kind === "SNOW_PLAN";
  const closed = !!job.closedAt;
  const charges = job.visits.flatMap((v) => v.charges.map((c) => ({ ...c, date: dateOnly(v.scheduledDate) })));
  const unbilled = charges.filter((c) => !c.invoiceLineItemId);

  return (
    <>
      <Flash error={sp.error} />
      <PageHeader
        title={<>Job #{job.number}: {job.title} <JobBadge s={row.status} /></>}
        sub={<><Link className="font-semibold text-blue" href={`/clients/${job.clientId}`}>{clientName(row.client)}</Link> · {job.property.formatted}</>}
        actions={
          <form action={jobClose}>
            <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
            <input type="hidden" name="closed" value={closed ? "0" : "1"} />
            <Button variant="secondary">{closed ? "Reopen job" : plan ? "End plan" : "Close job"}</Button>
          </form>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {plan ? (
            <Card title="Every-snowfall plan" actions={!closed && (
              <form action={planPause}>
                <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                <input type="hidden" name="paused" value={job.planPausedAt ? "0" : "1"} />
                <Button variant="secondary">{job.planPausedAt ? "Resume" : "Pause (away)"}</Button>
              </form>
            )}>
              <form action={planUpdate} className="grid items-end gap-3 sm:grid-cols-4">
                <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                <label className="text-sm font-semibold">Trigger (cm)<Input name="triggerCm" type="number" min={0} max={100} defaultValue={job.triggerCm ?? ""} placeholder={`${job.season?.defaultTriggerCm ?? 2} (season)`} /></label>
                <label className="text-sm font-semibold">Per push ($)<Input name="price" type="number" step="0.01" min={0} defaultValue={(job.pricePerPushCents ?? 3000) / 100} /></label>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="iceMelt" defaultChecked={job.iceMelt} className="size-5" /> Ice melt</label>
                <Button variant="secondary">Save</Button>
              </form>
              <p className="mt-3 text-sm text-ink-soft">{job.season?.name}. A visit is added automatically when a storm reaches the trigger. Billed per push, once per storm.</p>
            </Card>
          ) : (
            <>
            {job.kind === "RECURRING" && (
              <Card title={`Repeats: ${describeRule(job.rrule)}`}>
                <form action={recurringUpdate} className="space-y-3">
                  <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                  <RepeatFields freq={job.asNeeded ? "AS_NEEDED" : job.rrule?.includes("INTERVAL=2") ? "BIWEEKLY" : job.rrule?.includes("MONTHLY") ? "MONTHLY" : "WEEKLY"}
                    byDay={["MO", "TU", "WE", "TH", "FR", "SA", "SU"].map((d, i) => (job.rrule && new RegExp(`BYDAY=[^;\\n]*${d}`).test(job.rrule) ? i : -1)).filter((i) => i >= 0)}
                    startsOn={dateOnly(job.recurrenceStartsOn) ?? today} endsOn={dateOnly(job.recurrenceEndsOn) ?? ""} />
                  <Button variant="secondary">Update schedule</Button>
                  <p className="text-xs text-ink-soft">Future visits nobody has touched are rebuilt. Done or moved visits stay as they are.</p>
                </form>
              </Card>
            )}
            <Card title="Line items">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {job.lineItems.map((l) => (
                    <tr key={l.id}><td className="py-2">{l.name}{!l.perVisit && <span className="ml-1 text-xs text-ink-soft">(once)</span>}</td><td className="py-2 text-right text-ink-soft">{String(l.quantity)} ×</td><td className="py-2 text-right font-semibold">{money(l.unitPriceCents)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-soft">{job.billingType === "FIXED_PRICE" ? `Fixed price ${money(job.totalCents ?? 0)}, invoiced when the job is done.` : job.invoiceSchedule === "MONTHLY" ? "Billed monthly for the visits done." : "Billed per visit."} Prices include tax.</p>
            </Card>
            </>
          )}

          <Card title="Visits" actions={!closed && (
            <form action={visitAdd} className="flex gap-2">
              <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="back" value={here} />
              <Input type="date" name="date" className="w-40" aria-label="Date (blank = unscheduled)" />
              <Button variant="secondary">Add visit</Button>
            </form>
          )}>
            {job.visits.length ? (
              <ul className="divide-y divide-line">
                {job.visits.map((v) => {
                  const s = visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, today);
                  const open = v.state === "SCHEDULED";
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <Link href={`/visits/${v.id}`} className="min-w-0 font-semibold text-blue">
                        {v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Not scheduled"}
                        {v.snowEvent && <span className="font-normal text-ink-soft"> · {v.snowEvent.name}{v.pushNumber ? `, push ${v.pushNumber}` : ""}</span>}
                      </Link>
                      <span className="flex items-center gap-2">
                        {open && !v.snowEventId && (
                          <form action={visitSchedule} className="flex gap-1">
                            <input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} />
                            <input type="date" name="date" defaultValue={dateOnly(v.scheduledDate) ?? ""} className="rounded-lg border border-line px-2 py-1" aria-label="Reschedule" />
                            <button className="rounded-lg border border-line px-2 font-semibold">Set</button>
                          </form>
                        )}
                        {open && (
                          <form action={visitDelete}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} /><button className="px-1 text-ink-soft" aria-label="Delete visit">✕</button></form>
                        )}
                        <VisitBadge s={s} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <Empty>{plan ? "Visits appear here when a storm starts." : "No visits yet."}</Empty>}
          </Card>

          <Card title="Photos">
            {photos.length ? <Gallery photos={photos} back={here} /> : <p className="text-sm text-ink-soft">Before &amp; after photos are taken on each visit. Photos the client sent with their request show here too.</p>}
            <div className="mt-3 max-w-xs"><PhotoUploader endpoint="/api/uploads" fields={{ jobId: job.id, kind: "OTHER" }} label="Add photos" camera={false} /></div>
          </Card>

          <Card title="Charges & invoices" actions={<div className="flex items-center gap-2">
            {unbilled.length > 0 && <span className="text-sm font-semibold text-amber-800">{money(unbilled.reduce((a, c) => a + c.totalCents, 0))} not invoiced</span>}
            {(unbilled.length > 0 || (job.billingType === "FIXED_PRICE" && !job.invoices.some((i) => i.status !== "VOID"))) && (
              <form action={invoiceCreate}>
                <input type="hidden" name="clientId" value={job.clientId} /><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="back" value={here} />
                {job.billingType === "FIXED_PRICE" && <input type="hidden" name="fixed" value="1" />}
                <Button>Create invoice</Button>
              </form>
            )}
          </div>}>
            {job.invoices.length > 0 && (
              <ul className="mb-3 divide-y divide-line rounded-xl border border-line px-3">
                {job.invoices.map((i) => (
                  <li key={i.id}><Link href={`/invoices/${i.id}`} className="flex justify-between gap-2 py-2 text-sm"><span className="font-semibold text-blue">Invoice #{i.number}</span><span>{money(i.totalCents)} · {i.status === "PAID" ? "Paid" : i.status === "DRAFT" ? "Draft" : i.status === "VOID" ? "Void" : "Unpaid"}</span></Link></li>
                ))}
              </ul>
            )}
            {charges.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {charges.map((c) => (
                    <tr key={c.id}><td className="py-2 text-ink-soft">{prettyDate(c.date)}</td><td className="py-2">{c.name}</td><td className="py-2 text-right font-semibold">{money(c.totalCents)}</td><td className="py-2 pl-2 text-right text-xs text-ink-soft">{c.invoiceLineItemId ? "invoiced" : "unbilled"}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Charges are added when a visit is marked done.</Empty>}
          </Card>

          <Card title="Details">
            <Dl rows={[
              ["Community", job.property.community?.name ?? "Unknown (no map pin)"],
              ["Instructions", job.instructions],
              ["From request", job.request ? <Link className="text-blue" href={`/requests/${job.request.id}`}>#{job.request.number}</Link> : null],
              ["Closed", job.closedAt ? `${prettyDate(job.closedAt.toISOString().slice(0, 10))}${job.closeReason ? ` (${job.closeReason})` : ""}` : null],
            ]} />
          </Card>
        </div>
        <Timeline notes={notes} events={events} target={{ jobId: job.id, clientId: job.clientId }} path={here} />
      </div>
    </>
  );
}
