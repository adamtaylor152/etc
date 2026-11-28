import { ConfirmButton } from "@/components/confirm-button";
import { btn } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { STORM } from "@/components/status";
import { Badge, Button, ButtonLink, Card, Empty, Field, Input, Stat } from "@/components/ui";
import { DetailHeader } from "@/components/detail-header";
import { Check, Clock, FileText, Route, TriangleAlert } from "lucide-react";
import { prettyDateTime, toLocalInput } from "@/server/dates";
import { bylawStatus } from "@/server/snow/bylaw";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { routeVisits } from "@/server/routing";
import { stormCancel, stormDepth, stormSnowEnded, stormFinish, stormPush, stormStart } from "../../work-actions";

export async function generateMetadata({ params }: PageProps<"/snow/[id]">) {
  await requireOwner();
  const ev = await db.snowEvent.findFirst({ where: { id: (await params).id, businessId: await businessId() }, select: { name: true } });
  return { title: ev ? ev.name : "Storm" };
}

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
  const cm = ev.measuredCm ?? ev.forecastCm;
  const depth = cm == null ? "Depth not measured" : `${cm} cm`;
  const hidden = <><input type="hidden" name="id" value={ev.id} /><input type="hidden" name="back" value={here} /></>;

  const pct = visits.length ? Math.round((100 * done) / visits.length) : 0;
  const skipped = count(["SKIPPED"]);
  // The deadline card is calm until it matters: amber under six hours with stops left, red once the deadline has passed.
  const tone = bylaw?.level === "over" ? { box: "border-red-300 bg-red-50", text: "text-red-800", icon: TriangleAlert, word: "Past the deadline" }
    : bylaw?.level === "soon" ? { box: "border-amber-300 bg-amber-50", text: "text-amber-900", icon: TriangleAlert, word: "Under 6 hours left" }
    : bylaw?.level === "ok" ? { box: "border-line bg-white", text: "text-emerald-700", icon: Check, word: "Nothing left to clear" }
    : { box: "border-line bg-white", text: "", icon: Clock, word: bylaw ? "On track" : "Clock not started" };
  return (
    <>
      <Flash error={sp.error} />
      <DetailHeader
        back={{ href: "/snow", label: "Snow" }}
        kind="Storm"
        status={<Badge tone={STORM[ev.status][1]}>{STORM[ev.status][0]}</Badge>}
        title={ev.name}
        sub={<span className="tabular-nums">{ev.season.name} · {depth}{ev.pushCount > 1 ? ` · ${ev.pushCount} pushes` : ""}{ev.activatedAt ? ` · started ${prettyDateTime(ev.activatedAt)}` : ""}</span>}
        actions={visits.length > 0 && <>
          <ButtonLink href={`/snow/${ev.id}/report`}><FileText className="size-4" aria-hidden />Proof-of-service report</ButtonLink>
          {/* While stops are open the route is the next thing to do; once they are all in, finishing the storm is. */}
          <ButtonLink href={`/routes?storm=${id}`} variant={live && open > 0 ? "primary" : "secondary"}><Route className="size-4" aria-hidden />Open route</ButtonLink>
        </>}
      />
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="To do" value={open} tone={open > 0 && bylaw?.level === "over" ? "bad" : open > 0 && bylaw?.level === "soon" ? "warn" : undefined} />
        <Stat label="Done" value={done} tone={done > 0 ? "good" : undefined} />
        <Stat label="Skipped" value={skipped} />
        <Stat label="Billed so far" value={cad(charges._sum.totalCents ?? 0)} />
      </div>
      {visits.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Stops done" aria-valuemin={0} aria-valuemax={visits.length} aria-valuenow={done}>
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-ink-soft">{done} of {visits.length} done · {pct}%</span>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
        {/* Status and routine controls: first on a phone, top of the side column on a desk. */}
        <div className="space-y-5 lg:col-start-3 lg:row-start-1">
          {ev.status !== "FORECAST" && ev.status !== "CANCELLED" && (
            <section className={`rounded-xl border p-4 shadow-card sm:p-5 ${tone.box}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-display text-[0.95rem] font-semibold">City sidewalk deadline</h2>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone.text || "text-ink-soft"}`}><tone.icon className="size-3.5" aria-hidden />{tone.word}</span>
              </div>
              {bylaw ? (
                <>
                  <p className={`font-display text-[1.7rem] font-semibold leading-none tabular-nums ${tone.text}`}>{bylaw.level === "ok" ? "All cleared" : bylaw.level === "over" ? `${hrs(bylaw.hoursLeft)} over` : `${hrs(bylaw.hoursLeft)} left`}</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm tabular-nums">
                    <dt className="text-ink-soft">Snow stopped</dt><dd className="font-medium">{prettyDateTime(ev.snowEndedAt)}</dd>
                    <dt className="text-ink-soft">Sidewalks due by</dt><dd className="font-medium">{prettyDateTime(bylaw.deadline)}</dd>
                  </dl>
                  <p className="mt-2 text-sm tabular-nums">{bylaw.open > 0 ? `${bylaw.open} stop${bylaw.open === 1 ? "" : "s"} still to do. ` : ""}{bylaw.onTime} cleared in time{bylaw.late > 0 ? `, ${bylaw.late} after the deadline` : ""}.</p>
                </>
              ) : <p className="text-sm text-ink-soft">Calgary gives 24 hours after the snow stops to clear sidewalks. Record when it stopped to start the clock.</p>}
              <form action={stormSnowEnded} className="mt-4 flex flex-wrap items-end gap-2 border-t border-navy/10 pt-4">{hidden}
                <div className="min-w-56 flex-1"><Field label="Snow stopped at"><Input name="at" type="datetime-local" defaultValue={toLocalInput(ev.snowEndedAt ?? new Date())} /></Field></div>
                <Button variant="secondary">{bylaw ? "Update" : "Start the clock"}</Button>
                {bylaw && <button name="clear" value="1" className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-ink-soft underline-offset-2 hover:text-navy hover:underline">Clear the clock</button>}
              </form>
            </section>
          )}
          {ev.status === "FORECAST" && (
            <Card title="Start the storm">
              <form action={stormStart} className="space-y-3">{hidden}
                <Field label="Snow so far (cm)"><Input name="cm" type="number" inputMode="numeric" min={0} max={300} defaultValue={ev.forecastCm ?? ""} required /></Field>
                <Button className="w-full">Start storm</Button>
              </form>
            </Card>
          )}
          {live && (
            <Card title="Storm controls">
              <form action={stormDepth} className="flex items-end gap-2">{hidden}
                <div className="flex-1"><Field label="Measured depth (cm)"><Input name="cm" type="number" inputMode="numeric" min={0} max={300} defaultValue={ev.measuredCm ?? ""} required /></Field></div>
                <Button variant="secondary">Update depth</Button>
              </form>
              <p className="mt-1.5 text-xs text-ink-soft">Deeper adds plans that now qualify; shallower skips visits not started yet.</p>
              <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
                <form action={stormPush}>{hidden}<Button variant="secondary" className="w-full">Still snowing: add push #{ev.pushCount + 1}</Button></form>
                <form action={stormFinish}>{hidden}
                  <Button variant={open > 0 ? "secondary" : "primary"} className="w-full" disabled={open > 0} title={open > 0 ? "Finish or skip the remaining visits first" : undefined}><Check className="size-4" aria-hidden />Finish storm</Button>
                  {open > 0 && <p className="mt-1.5 text-xs tabular-nums text-ink-soft">Finish or skip the {open} remaining visit{open === 1 ? "" : "s"} first.</p>}
                </form>
              </div>
            </Card>
          )}
          {ev.notes && <Card title="Notes"><p className="max-w-[70ch] whitespace-pre-line text-sm">{ev.notes}</p></Card>}
        </div>

        {/* The work: every stop, by community in route order. */}
        <div className="space-y-5 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {groups.map((g) => {
            const left = g.visits.filter((v) => ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state)).length;
            return (
              <Card key={g.code ?? "none"} title={g.name} actions={<span className="text-xs font-medium tabular-nums text-ink-soft">{left ? `${left} of ${g.visits.length} to do` : `${g.visits.length} stop${g.visits.length === 1 ? "" : "s"}, none left`}</span>}>
                <ul className="-my-1 divide-y divide-line-soft">
                  {g.visits.map((v) => (
                    <li key={v.id}>
                      <Link href={`/visits/${v.id}`} className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-tint">
                        <span className="min-w-0"><span className="font-semibold">{v.property.formatted}</span>{v.pushNumber && v.pushNumber > 1 && <span className="tabular-nums text-ink-soft"> · push {v.pushNumber}</span>}{v.isReturn && <span className="text-ink-soft"> · return visit</span>}</span>
                        <Badge tone={v.state === "COMPLETED" ? "green" : v.state === "SKIPPED" || v.state === "CANCELLED" ? "gray" : "blue"}>{v.state === "COMPLETED" ? "Done" : v.state === "SKIPPED" ? (v.skipReason === "BELOW_TRIGGER" ? "Below trigger" : "Skipped") : v.state === "CANCELLED" ? "Cancelled" : v.state === "EN_ROUTE" ? "On the way" : v.state === "IN_PROGRESS" ? "On site" : "To do"}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {!visits.length && <Empty>{ev.status === "FORECAST" ? "No visits yet. Start the storm to create today's visits." : "No plans met the trigger, so this storm has no visits."}</Empty>}
        </div>

        {/* The one destructive control sits by itself, after everything routine. */}
        {(ev.status === "FORECAST" || live) && (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-5 lg:col-start-3 lg:row-start-2" aria-label="Cancel storm">
            <h2 className="font-display text-[0.95rem] font-semibold">Forecast bust?</h2>
            <p className="mt-1 text-sm text-ink-soft">Cancelling the storm cancels every visit on it that isn&apos;t done yet. Visits already done are kept.</p>
            <form action={stormCancel} className="mt-3">{hidden}<ConfirmButton message="Cancel this storm? Every visit on it that isn't done yet is cancelled." className={btn("danger", "w-full")}>Cancel storm</ConfirmButton></form>
          </section>
        )}
      </div>
    </>
  );
}
