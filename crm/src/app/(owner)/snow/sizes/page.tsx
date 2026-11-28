// Size check: every snow booking whose driveway nobody has looked at yet, with the satellite view, plus jobs held
// waiting on a client's OK or a quote. Confirm the size and the price follows (see server/ops/drive-size.ts).
import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { currentCharge, dollars, SIZES, snowCharge, snowPrices, type Pending } from "@/server/ops/drive-size";
import { clientName } from "@/server/queries";
import { sizeConfirm } from "./actions";

export const metadata = { title: "Size check" };

const snowJob = { closedAt: null, OR: [{ kind: "SNOW_PLAN" as const }, { kind: "ONE_OFF" as const, title: { startsWith: "Snow" } }] };

export default async function SizeCheck({ searchParams }: PageProps<"/snow/sizes">) {
  const sp = await searchParams;
  const bid = await businessId();
  const prices = await snowPrices(db, bid);
  const props = await db.property.findMany({
    where: { businessId: bid, archivedAt: null, jobs: { some: snowJob }, OR: [{ sizeCheckedAt: null }, { jobs: { some: { ...snowJob, sizeHoldAt: { not: null } } } }] },
    include: { client: true, jobs: { where: snowJob, include: { lineItems: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Size check" sub="Check each new snow driveway on the satellite view before the first visit. Bigger than booked: the client gets the new price to OK." />
      {typeof sp.done === "string" && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{sp.done}</p>}
      {props.length ? (
        <div className="space-y-4">
          {props.map((p) => {
            const held = p.jobs.find((j) => j.sizeHoldAt);
            const pend = held?.pendingPrice as unknown as Pending | null;
            const size = p.driveSize ?? "STANDARD";
            return (
              <Card key={p.id}>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {p.lat != null && p.lng != null ? (
                    <iframe title={`Satellite view of ${p.formatted}`} loading="lazy" className="h-64 w-full rounded-lg border border-line" referrerPolicy="no-referrer"
                      src={`https://www.google.com/maps?q=${p.lat},${p.lng}&t=k&z=20&output=embed`} />
                  ) : <p className="grid h-64 place-items-center rounded-lg bg-tint text-sm text-ink-soft">No map pin for this address</p>}
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-base font-bold">{p.formatted}</p>
                      <p className="text-ink-soft"><Link href={`/clients/${p.clientId}`} className="text-blue">{clientName(p.client)}</Link> · booked as <b>{SIZES[size].short}</b>{p.extraWalk ? " + extra sidewalk" : ""}</p>
                      {p.jobs.map((j) => { const c = currentCharge(j.lineItems); return <p key={j.id} className="text-ink-soft"><Link href={`/jobs/${j.id}`} className="text-blue">Job #{j.number}</Link> · {j.kind === "SNOW_PLAN" ? "every snowfall" : "one-time"} · {dollars(c.base + c.walk)}</p>; })}
                      <a href={`https://www.google.com/maps/@${p.lat},${p.lng},40m/data=!3m1!1e3`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue">Open in Google Maps (measure distance)</a>
                    </div>
                    {held && pend && (
                      <p className="rounded-lg bg-amber-50 p-2 text-amber-950">
                        {pend.quote ? <>Oversized: off the route until you <Link href={`/quotes/new?client=${p.clientId}`} className="font-semibold underline">send a quote</Link>.</>
                          : <>Waiting on the client to OK {dollars(pend.base + pend.walk)}{held.kind === "SNOW_PLAN" ? " per snowfall" : ""}. Off the route until they do.</>}
                      </p>
                    )}
                    <form action={sizeConfirm} className="space-y-2">
                      <input type="hidden" name="propertyId" value={p.id} />
                      {(["STANDARD", "LARGE", "OVERSIZED"] as const).map((s) => {
                        const one = p.jobs[0];
                        const c = one ? snowCharge(prices, one.kind === "SNOW_PLAN", s, false) : null;
                        return <label key={s} className="flex items-center gap-2"><input type="radio" name="size" value={s} defaultChecked={(pend?.size ?? size) === s} className="size-4" />{SIZES[s].label}<span className="text-ink-soft">{c ? dollars(c.base) : "quote"}</span></label>;
                      })}
                      <label className="flex items-center gap-2"><input type="checkbox" name="extraWalk" defaultChecked={pend?.extraWalk ?? p.extraWalk} className="size-4" />Extra sidewalk (corner lot / long walk) +{dollars(prices.walk)}</label>
                      <button className="min-h-10 rounded-lg bg-navy px-4 font-semibold text-white">Confirm size</button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <Empty>All snow driveways are checked.</Empty>}
    </>
  );
}
