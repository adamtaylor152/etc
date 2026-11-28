// Client OKs (or cancels) a new snow price after we checked their driveway on the satellite view.
import { Cta, Done, Help, LinkProblem, PageTitle } from "@/components/public/kit";
import { Card } from "@/components/ui";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { currentCharge, dollars, SIZES, type Pending } from "@/server/ops/drive-size";
import { peekToken } from "@/server/tokens";
import { answer } from "./actions";

export const metadata = { title: { absolute: "Your snow price · etc." }, robots: { index: false } };

export default async function PriceChangePage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const t = await peekToken(db, token, ["PRICE_CHANGE"]);
  if (!t.ok || !t.token.jobId) return <LinkProblem title="This link has expired">Give us a call or text and we&apos;ll sort it out.</LinkProblem>;
  const job = await db.job.findUniqueOrThrow({ where: { id: t.token.jobId }, include: { client: true, property: true, lineItems: true } });
  const p = job.pendingPrice as unknown as Pending | null;
  const plan = job.kind === "SNOW_PLAN";
  const per = plan ? " per snowfall" : "";
  const help = <Help phone={env.phone} email={env.helpEmail} />;
  if (job.closedAt) return <><Done tone="info" title="Cancelled">No charge. Thanks for letting us know, {job.client.firstName}.</Done>{help}</>;
  if (!job.sizeHoldAt || !p) {
    const c = currentCharge(job.lineItems);
    return <><Done title={<>You&apos;re all set: <span className="tabular-nums">{dollars(c.base + c.walk)}</span>{per}.</>}>We&apos;ll be there {plan ? "after every snowfall" : "soon"}.</Done>{help}</>;
  }
  const was = currentCharge(job.lineItems);
  return (
    <>
      <PageTitle eyebrow={`Snow clearing · ${job.property.formatted.split(",")[0]}`} title="We checked your driveway"
        sub={<>It&apos;s a {SIZES[p.size].label.toLowerCase()} driveway{p.extraWalk ? ", plus extra sidewalk" : ""}, so the price is a bit more than the standard one you booked.</>} />
      <div className="grid gap-5">
        <Card>
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-4 text-ink-soft"><dt>You booked</dt><dd className="tabular-nums line-through">{dollars(was.base + was.walk)}{per}</dd></div>
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3"><dt className="font-semibold">New price</dt><dd className="text-right"><span className="font-display text-[1.75rem] font-semibold leading-none tabular-nums">{dollars(p.base + p.walk)}</span>{per && <span className="block text-sm text-ink-soft">{per.trim()}</span>}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-ink-soft">Tax included. Pay after the job, as before.</p>
        </Card>
        <div className="space-y-2">
          <form action={answer}><input type="hidden" name="t" value={token} /><input type="hidden" name="yes" value="1" /><Cta>Sounds good, keep me booked</Cta></form>
          <form action={answer}><input type="hidden" name="t" value={token} /><input type="hidden" name="yes" value="0" /><Cta variant="secondary">No thanks, cancel (no charge)</Cta></form>
        </div>
      </div>
      {help}
    </>
  );
}
