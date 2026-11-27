// Field view: what Silas sees standing in the driveway. Big buttons, everything on one screen.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { Gallery } from "@/components/gallery";
import { GeoFields } from "@/components/geo-fields";
import { PhotoUploader } from "@/components/photo-uploader";
import { VisitBadge } from "@/components/status";
import { Button, Card, Dl, inputCls } from "@/components/ui";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { mapsLink, routeVisits } from "@/server/routing";
import { visitStatus } from "@/server/status/job";
import { visitTransition } from "../../work-actions";

const SKIP: [string, string][] = [
  ["ALREADY_CLEARED", "Already cleared"], ["BLOCKED_BY_CAR", "Blocked by a car"], ["NO_ACCESS", "Couldn't get in"],
  ["CLIENT_CANCELLED", "Client cancelled"], ["WEATHER", "Weather"], ["OTHER", "Other"],
];

export default async function VisitPage({ params, searchParams }: PageProps<"/visits/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const v = await db.visit.findFirst({
    where: { id, businessId: bid },
    include: {
      job: { include: { client: true, lineItems: true } }, property: { include: { community: true } }, snowEvent: true, charges: true,
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!v) notFound();
  const here = `/visits/${id}`;
  const status = visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, todayLocal());
  const open = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state);
  const hasIceMelt = v.job.iceMelt || v.job.lineItems.some((l) => l.name === "Ice melt");
  const tel = v.job.client.phone ? `tel:${v.job.client.phone.replace(/[^\d+]/g, "")}` : null;

  // Next stop on the same storm (or the same day), in route order.
  let nextStop: string | null = null;
  const sameRun = v.snowEventId ? { snowEventId: v.snowEventId } : v.scheduledDate ? { scheduledDate: v.scheduledDate } : null;
  if (sameRun) {
    const { visits } = await routeVisits(bid, { ...sameRun, state: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] } });
    const after = visits.slice(visits.findIndex((x) => x.id === id) + 1).find((x) => x.id !== id) ?? visits.find((x) => x.id !== id);
    nextStop = after?.id ?? null;
  }

  const hidden = (to: string) => <><input type="hidden" name="id" value={v.id} /><input type="hidden" name="to" value={to} /><input type="hidden" name="back" value={here} /></>;

  return (
    <div className="mx-auto max-w-xl">
      <Flash error={sp.error} />
      <div className="mb-4 rounded-3xl bg-navy p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-sky">{v.snowEvent ? `${v.snowEvent.name}${v.pushNumber ? ` · push ${v.pushNumber}` : ""}` : v.job.title}</div>
            <h1 className="mt-1 font-display text-2xl font-bold">{v.property.formatted}</h1>
            <p className="text-white/70">{clientName(v.job.client)}{v.property.community && ` · ${v.property.community.name}`}</p>
          </div>
          <VisitBadge s={status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={mapsLink(v.property.formatted)} className="flex min-h-12 items-center justify-center rounded-full bg-white font-semibold text-navy">Navigate</a>
          {tel ? <a href={tel} className="flex min-h-12 items-center justify-center rounded-full border-2 border-white/40 font-semibold">Call</a>
            : <Link href={`/clients/${v.job.clientId}`} className="flex min-h-12 items-center justify-center rounded-full border-2 border-white/40 font-semibold">Client</Link>}
        </div>
      </div>

      {(v.property.accessNotes || v.property.gateCode || v.property.hazards || v.property.petNotes || v.job.instructions || v.instructions) && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <Dl rows={[["Access", v.property.accessNotes], ["Gate code", v.property.gateCode], ["Pets", v.property.petNotes], ["Watch out", v.property.hazards], ["Instructions", v.instructions ?? v.job.instructions]]} />
        </Card>
      )}


      <Card title="Before & after" className="my-4">
        <div className="grid grid-cols-2 gap-2">
          <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "BEFORE" }} label="Before" geo />
          <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "AFTER" }} label="After" geo />
        </div>
        <div className="mt-3"><Gallery photos={v.attachments} back={here} /></div>
        {v.state === "COMPLETED" && !v.attachments.some((a) => a.kind === "AFTER") && <p className="mt-2 text-sm text-amber-800">No after photo yet. The client&apos;s &quot;all done&quot; email goes out 5 minutes after Done, so add one now.</p>}
      </Card>
      {open ? (
        <div className="space-y-3">
          {v.state === "SCHEDULED" && (
            <form action={visitTransition}>{hidden("EN_ROUTE")}<Button variant="secondary" className="min-h-14 w-full text-base">On my way</Button></form>
          )}
          {v.state !== "IN_PROGRESS" && (
            <form action={visitTransition}>{hidden("IN_PROGRESS")}<Button variant="secondary" className="min-h-14 w-full text-base">Arrived</Button></form>
          )}
          <Card title="Done">
            <form action={visitTransition} className="space-y-3">
              {hidden("COMPLETED")}<GeoFields />
              <label className="block text-sm font-semibold">Snow depth (cm, optional)
                <input name="depthCm" type="number" inputMode="numeric" min={0} max={300} defaultValue={v.depthCm ?? v.snowEvent?.measuredCm ?? ""} className={`${inputCls} mt-1`} />
              </label>
              {hasIceMelt && (
                <label className="flex items-center gap-3 text-base">
                  <input type="hidden" name="iceMeltShown" value="1" />
                  <input type="checkbox" name="iceMeltApplied" defaultChecked={v.iceMeltApplied ?? true} className="size-6" /> Ice melt put down
                </label>
              )}
              <Button className="min-h-14 w-full text-base">Mark done</Button>
            </form>
          </Card>
          <details className="rounded-2xl border border-line bg-white p-4">
            <summary className="cursor-pointer font-semibold">Couldn&apos;t do it</summary>
            <form action={visitTransition} className="mt-3 space-y-3">
              {hidden("SKIPPED")}
              <select name="skipReason" className={inputCls} defaultValue="ALREADY_CLEARED">{SKIP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input name="skipNote" placeholder="Note (optional)" className={inputCls} maxLength={500} />
              <Button variant="danger" className="w-full">Skip this visit</Button>
            </form>
          </details>
        </div>
      ) : (
        <Card title={v.state === "COMPLETED" ? "Done" : v.state === "SKIPPED" ? "Skipped" : "Cancelled"}>
          <Dl rows={[
            ["When", prettyDateTime(v.completedAt ?? v.skippedAt)],
            ["Depth", v.depthCm != null ? `${v.depthCm} cm` : null],
            ["Ice melt", v.state === "COMPLETED" && v.iceMeltApplied ? "Yes" : null],
            ["Reason", v.skipReason ? SKIP.find(([k]) => k === v.skipReason)?.[1] ?? v.skipReason : null],
            ["Note", v.skipNote],
            ["Location", v.completedLat != null ? <a className="text-blue" href={`https://www.google.com/maps/search/?api=1&query=${v.completedLat},${v.completedLng}`}>Recorded</a> : null],
            ["Charges", v.charges.length ? v.charges.map((c) => `${c.name}: ${money(c.totalCents)}`).join("\n") : null],
          ]} />
          <form action={visitTransition} className="mt-3">{hidden("SCHEDULED")}<Button variant="secondary">Reopen</Button></form>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {nextStop && <Link href={`/visits/${nextStop}`} className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-blue font-semibold text-white">Next stop →</Link>}
        <Link href={`/jobs/${v.jobId}`} className="flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-line bg-white font-semibold">Job #{v.job.number}</Link>
        {v.snowEventId && <Link href={`/routes?storm=${v.snowEventId}`} className="flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-line bg-white font-semibold">Route</Link>}
      </div>
      <p className="mt-3 text-center text-xs text-ink-soft">{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Not scheduled"}</p>
    </div>
  );
}
