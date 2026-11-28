// Client OKs (or cancels) a new snow price after we checked their driveway on the satellite view.
import { Card } from "@/components/ui";
import { db } from "@/server/db";
import { currentCharge, dollars, SIZES, type Pending } from "@/server/ops/drive-size";
import { peekToken } from "@/server/tokens";
import { answer } from "./actions";

export const metadata = { title: { absolute: "Your snow price · etc." }, robots: { index: false } };

export default async function PriceChangePage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const t = await peekToken(db, token, ["PRICE_CHANGE"]);
  if (!t.ok || !t.token.jobId) return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Give us a call or text and we&apos;ll sort it out.</p></Card>;
  const job = await db.job.findUniqueOrThrow({ where: { id: t.token.jobId }, include: { client: true, property: true, lineItems: true } });
  const p = job.pendingPrice as unknown as Pending | null;
  const plan = job.kind === "SNOW_PLAN";
  const per = plan ? " per snowfall" : "";
  if (job.closedAt) return <Card><h1 className="font-display text-2xl font-bold">Cancelled</h1><p className="mt-2 text-ink-soft">No charge. Thanks for letting us know, {job.client.firstName}.</p></Card>;
  if (!job.sizeHoldAt || !p) {
    const c = currentCharge(job.lineItems);
    return <Card className="border-emerald-200 bg-emerald-50"><p className="font-semibold text-emerald-800">You&apos;re all set: {dollars(c.base + c.walk)}{per}. We&apos;ll be there {plan ? "after every snowfall" : "soon"}.</p></Card>;
  }
  const was = currentCharge(job.lineItems);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue">Snow clearing · {job.property.formatted.split(",")[0]}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">We checked your driveway</h1>
        <p className="mt-2 text-ink-soft">It&apos;s a {SIZES[p.size].label.toLowerCase()} driveway{p.extraWalk ? ", plus extra sidewalk" : ""}, so the price is a bit more than the standard one you booked.</p>
      </div>
      <Card>
        <dl className="space-y-1 text-base">
          <div className="flex justify-between text-ink-soft"><dt>You booked</dt><dd className="line-through">{dollars(was.base + was.walk)}{per}</dd></div>
          <div className="flex justify-between text-xl font-bold"><dt>New price</dt><dd>{dollars(p.base + p.walk)}{per}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-ink-soft">Tax included. Pay after the job, as before.</p>
      </Card>
      <form action={answer}><input type="hidden" name="t" value={token} /><input type="hidden" name="yes" value="1" /><button className="min-h-14 w-full rounded-full bg-blue text-base font-semibold text-white">Sounds good, keep me booked</button></form>
      <form action={answer}><input type="hidden" name="t" value={token} /><input type="hidden" name="yes" value="0" /><button className="min-h-12 w-full rounded-full border-2 border-line font-semibold">No thanks, cancel (no charge)</button></form>
    </div>
  );
}
