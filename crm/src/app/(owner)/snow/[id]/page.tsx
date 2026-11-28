import { ConfirmButton } from "@/components/confirm-button";
import { btn } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { STORM } from "@/components/status";
import { Badge, Button, ButtonLink, Card, Input, PageHeader } from "@/components/ui";
import { prettyDateTime, toLocalInput } from "@/server/dates";
import { bylawStatus } from "@/server/snow/bylaw";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { routeVisits } from "@/server/routing";
import { stormCancel, stormDepth, stormSnowEnded, stormFinish, stormPush, stormStart } from "../../work-actions";

export default async function StormPage({ params, searchParams }: PageProps<"/snow/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const ev = await db.snowEvent.findFirst({ where: { id, businessId: bid }, include: { season: true } });
  if (!ev) notFound();
  const [{ visits, groups }, charges] = await Promise.all([
    routeVisits(bid, { snowEventId: id }),
    db.visitCharge.aggregate({ where: { visit: { snowEventId: id } }, _sum: { totalCents: true } }),
  ]);
  const count = (s: string[]) => visits.filter((v) => s.includes(v.state)).length;
  const open = count(["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"]);
  const done = count(["COMPLETED"]);
  const live = ev.status === "ACTIVE";
  const here = `/snow/${id}`;
  const bylaw = bylawStatus(ev.snowEndedAt, visits);
  const hrs = (h: number) => (Math.abs(h) < 1 ? `${Math.round(Math.abs(h) * 60)} min` : `${Math.round(Math.abs(h))} h`);
  const hidden = <><input type="hidden" name="id" value={ev.id} /><input type="hidden" name="back" value={here} /></>;

  return (
    <>
      <Flash error={sp.error} />
      <PageHeader
        title={<>{ev.name} <Badge tone={STORM[ev.status][1]}>{STORM[ev.status][0]}</Badge></>}
        sub={`${ev.season.name} · ${ev.measuredCm ?? ev.forecastCm ?? "?"} cm${ev.activatedAt ? ` · started ${prettyDateTime(ev.activatedAt)}` : ""}`}
        actions={visits.length > 0 && <ButtonLink href={`/routes?storm=${id}`} variant="primary">Open route</ButtonLink>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["To do", open], ["Done", done], ["Skipped", count(["SKIPPED"])], ["Billed so far", money(charges._sum.totalCents ?? 0)]].map(([l, n]) => (
          <div key={l} className="rounded-2xl border border-line bg-white p-4"><div className="font-display text-3xl font-bold">{n}</div><div className="text-sm text-ink-soft">{l}</div></div>
        ))}
      </div>
      {visits.length > 0 && (
        <div className="mb-5 h-3 overflow-hidden rounded-full bg-white"><div className="h-full bg-emerald-500" style={{ width: `${Math.round((100 * done) / visits.length)}%` }} /></div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {groups.map((g) => (
            <Card key={g.code ?? "none"} title={`${g.name} (${g.visits.length})`}>
              <ul className="divide-y divide-line">
                {g.visits.map((v) => (
                  <li key={v.id}>
                    <Link href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span><span className="font-semibold">{v.property.formatted}</span>{v.pushNumber && v.pushNumber > 1 && <span className="text-ink-soft"> · push {v.pushNumber}</span>}{v.isReturn && <span className="text-ink-soft"> · return visit</span>}</span>
                      <Badge tone={v.state === "COMPLETED" ? "green" : v.state === "SKIPPED" || v.state === "CANCELLED" ? "gray" : "blue"}>{v.state === "COMPLETED" ? "Done" : v.state === "SKIPPED" ? (v.skipReason === "BELOW_TRIGGER" ? "Below trigger" : "Skipped") : v.state === "CANCELLED" ? "Cancelled" : "To do"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {!visits.length && <Card><p className="text-sm text-ink-soft">{ev.status === "FORECAST" ? "Start the storm to create today's visits." : "No plans met the trigger."}</p></Card>}
        </div>
        <div className="space-y-5">
          {ev.status === "FORECAST" && (
            <Card title="Start">
              <form action={stormStart} className="space-y-3">{hidden}
                <label className="block text-sm font-semibold">Snow so far (cm)<Input name="cm" type="number" min={0} max={300} defaultValue={ev.forecastCm ?? ""} required /></label>
                <Button className="w-full">Start storm</Button>
              </form>
            </Card>
          )}
          {live && (
            <Card title="Storm controls">
              <form action={stormDepth} className="mb-4 flex items-end gap-2">{hidden}
                <label className="flex-1 text-sm font-semibold">Measured depth (cm)<Input name="cm" type="number" min={0} max={300} defaultValue={ev.measuredCm ?? ""} required /></label>
                <Button variant="secondary">Update</Button>
              </form>
              <p className="mb-4 text-xs text-ink-soft">Deeper adds plans that now qualify; shallower skips visits not started yet.</p>
              <div className="space-y-2">
                <form action={stormPush}>{hidden}<Button variant="secondary" className="w-full">Still snowing: add push #{ev.pushCount + 1}</Button></form>
                <form action={stormFinish}>{hidden}<Button className="w-full" disabled={open > 0} title={open > 0 ? "Finish or skip the remaining visits first" : undefined}>Finish storm</Button></form>
              </div>
            </Card>
          )}
          {ev.status !== "FORECAST" && ev.status !== "CANCELLED" && (
            <Card title="City sidewalk deadline" className={bylaw?.level === "over" ? "border-red-300 bg-red-50" : bylaw?.level === "soon" ? "border-amber-300 bg-amber-50" : ""}>
              {bylaw ? (
                <>
                  <p className="font-display text-2xl font-bold">{bylaw.level === "ok" ? "All cleared" : bylaw.level === "over" ? `${hrs(bylaw.hoursLeft)} over` : `${hrs(bylaw.hoursLeft)} left`}</p>
                  <p className="mt-1 text-sm text-ink-soft">Snow stopped {prettyDateTime(ev.snowEndedAt)}. Sidewalks are due by {prettyDateTime(bylaw.deadline)}.</p>
                  <p className="mt-1 text-sm">{bylaw.open > 0 ? `${bylaw.open} stop${bylaw.open === 1 ? "" : "s"} still to do. ` : ""}{bylaw.onTime} cleared in time{bylaw.late > 0 ? `, ${bylaw.late} after the deadline` : ""}.</p>
                </>
              ) : <p className="text-sm text-ink-soft">Calgary gives 24 hours after the snow stops to clear sidewalks. Record when it stopped to start the clock.</p>}
              <form action={stormSnowEnded} className="mt-3 flex flex-wrap items-end gap-2">{hidden}
                <label className="flex-1 text-sm font-semibold">Snow stopped at<Input name="at" type="datetime-local" defaultValue={toLocalInput(ev.snowEndedAt ?? new Date())} /></label>
                <Button variant="secondary">{bylaw ? "Update" : "Start the clock"}</Button>
                {bylaw && <button name="clear" value="1" className="min-h-10 text-sm text-ink-soft underline">Clear</button>}
              </form>
            </Card>
          )}
          {(ev.status === "FORECAST" || live) && (
            <form action={stormCancel}>{hidden}<ConfirmButton message="Cancel this storm? Every visit on it that isn't done yet is cancelled." className={btn("danger", "w-full")}>Cancel storm (forecast bust)</ConfirmButton></form>
          )}
          {ev.notes && <Card title="Notes"><p className="text-sm">{ev.notes}</p></Card>}
          {visits.length > 0 && <ButtonLink href={`/snow/${ev.id}/report`} className="w-full">Proof-of-service report</ButtonLink>}
        </div>
      </div>
    </>
  );
}
