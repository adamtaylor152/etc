// Size check: every snow booking whose driveway nobody has looked at yet, with the satellite view, plus jobs held
// waiting on a client's OK or a quote. Confirm the size and the price follows (see server/ops/drive-size.ts).
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Badge, Button, ButtonLink, Card, Empty, Notice } from "@/components/ui";
import { DetailHeader } from "@/components/detail-header";
import { ExternalLink, MapPinOff } from "lucide-react";
import { businessId, db } from "@/server/db";
import { currentCharge, dollars, SIZES, snowCharge, snowPrices, type Pending } from "@/server/ops/drive-size";
import { clientName } from "@/server/queries";
import { sizeConfirm } from "./actions";

export const metadata = { title: "Size check" };

const snowJob = { closedAt: null, OR: [{ kind: "SNOW_PLAN" as const }, { kind: "ONE_OFF" as const, title: { startsWith: "Snow" } }] };

export default async function SizeCheck({ searchParams }: PageProps<"/snow/sizes">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const prices = await snowPrices(db, bid);
  const props = await db.property.findMany({
    where: { businessId: bid, archivedAt: null, jobs: { some: snowJob }, OR: [{ sizeCheckedAt: null }, { jobs: { some: { ...snowJob, sizeHoldAt: { not: null } } } }] },
    include: { client: true, jobs: { where: snowJob, include: { lineItems: true } } },
    orderBy: { createdAt: "asc" },
  });
  const link = "font-semibold text-blue hover:text-blue-deep";
  const rowLink = `${link} max-sm:inline-flex max-sm:min-h-11 max-sm:items-center`; // its own 44px box on a phone
  return (
    <>
      <DetailHeader back={{ href: "/snow", label: "Snow" }} title="Size check"
        sub="Check each new snow driveway on the satellite view before the first visit. Bigger than booked: the client gets the new price to OK."
        kind={props.length > 0 ? <span className="tabular-nums">{props.length} to check</span> : undefined} />
      {typeof sp.done === "string" && <Notice tone="good">{sp.done}</Notice>}
      {props.length ? (
        <div className="space-y-5">
          {props.map((p) => {
            const held = p.jobs.find((j) => j.sizeHoldAt);
            const pend = held?.pendingPrice as unknown as Pending | null;
            const size = p.driveSize ?? "STANDARD";
            return (
              <Card key={p.id}>
                <div className="grid gap-5 md:grid-cols-2">
                  {p.lat != null && p.lng != null ? (
                    <iframe title={`Satellite view of ${p.formatted}`} loading="lazy" className="h-64 w-full rounded-lg border border-line md:h-full md:min-h-72" referrerPolicy="no-referrer"
                      src={`https://www.google.com/maps?q=${p.lat},${p.lng}&t=k&z=20&output=embed`} />
                  ) : <p className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg bg-tint text-sm text-ink-soft md:h-full md:min-h-72"><MapPinOff className="size-5" aria-hidden />No map pin for this address</p>}
                  <div className="text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-display text-[0.95rem] font-semibold">{p.formatted}</h2>
                      {held && pend && <Badge tone="amber">Off the route</Badge>}
                    </div>
                    <p className="mt-1 text-ink-soft"><Link href={`/clients/${p.clientId}`} className={rowLink}>{clientName(p.client)}</Link> · booked as <span className="font-semibold text-navy">{SIZES[size].short}</span>{p.extraWalk ? " + extra sidewalk" : ""}</p>
                    <ul className="mt-1 space-y-0.5 text-ink-soft">
                      {p.jobs.map((j) => { const c = currentCharge(j.lineItems); return <li key={j.id}><Link href={`/jobs/${j.id}`} className={rowLink}>Job #{j.number}</Link> · {j.kind === "SNOW_PLAN" ? "every snowfall" : "one-time"} · <span className="tabular-nums">{j.snowBillingMode === "SEASONAL" ? "flat season price (size won't change it)" : dollars(c.base + c.walk)}</span></li>; })}
                    </ul>
                    {p.lat != null && p.lng != null && <a href={`https://www.google.com/maps/@${p.lat},${p.lng},40m/data=!3m1!1e3`} target="_blank" rel="noreferrer" className={`mt-2 inline-flex min-h-8 items-center gap-1.5 text-xs ${link}`}><ExternalLink className="size-3.5" aria-hidden />Open in Google Maps (measure distance)</a>}
                    {held && pend && (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 font-medium text-amber-950">
                        {pend.quote ? <>Oversized: off the route until you <Link href={`/quotes/new?client=${p.clientId}`} className="font-semibold underline underline-offset-2">send a quote</Link>.</>
                          : <>Waiting on the client to OK <span className="tabular-nums">{dollars(pend.base + pend.walk)}</span>{held.kind === "SNOW_PLAN" ? " per snowfall" : ""}. Off the route until they do.</>}
                      </p>
                    )}
                    <form action={sizeConfirm} className="mt-4 border-t border-line-soft pt-4">
                      <input type="hidden" name="propertyId" value={p.id} />
                      <fieldset>
                        <legend className="mb-1.5 text-sm font-semibold">What size is it really?</legend>
                        <div className="space-y-1.5">
                          {(["STANDARD", "LARGE", "OVERSIZED"] as const).map((s) => {
                            const one = p.jobs[0];
                            const c = one ? snowCharge(prices, one.kind === "SNOW_PLAN", s, false) : null;
                            return <label key={s} className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white px-3 hover:border-ink-faint/60 has-checked:border-blue has-checked:bg-blue/5"><input type="radio" name="size" value={s} defaultChecked={(pend?.size ?? size) === s} className="size-4.5" /><span className="flex-1 font-medium">{SIZES[s].label}</span><span className="tabular-nums text-ink-soft">{c ? dollars(c.base) : "Quote"}</span></label>;
                          })}
                        </div>
                      </fieldset>
                      <label className="mt-2 flex min-h-11 items-center gap-3 px-3"><input type="checkbox" name="extraWalk" defaultChecked={pend?.extraWalk ?? p.extraWalk} className="size-4.5" /><span className="flex-1">Extra sidewalk (corner lot / long walk)</span><span className="tabular-nums text-ink-soft">+{dollars(prices.walk)}</span></label>
                      <Button variant="secondary" className="mt-3 w-full sm:w-auto">Confirm size</Button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <Empty action={<ButtonLink href="/snow">Back to Snow</ButtonLink>}>All snow driveways are checked. New snow bookings show up here before their first visit.</Empty>}
    </>
  );
}
