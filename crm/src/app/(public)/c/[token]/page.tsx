// Client confirms an upcoming visit, or asks for a different time (owners get notified; shows on the calendar).
import { Card } from "@/components/ui";
import { dateOnly, prettyDate } from "@/server/dates";
import { db } from "@/server/db";
import { peekToken } from "@/server/tokens";
import { confirmVisit, requestReschedule } from "./actions";

export const metadata = { title: { absolute: "Your visit · etc." }, robots: { index: false } };

export default async function ConfirmVisit({ params, searchParams }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["VISIT_CONFIRM"]);
  if (!t.ok || !t.token.visitId) return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Give us a call or text if anything changed.</p></Card>;
  const v = await db.visit.findUniqueOrThrow({ where: { id: t.token.visitId }, include: { job: { include: { client: true } }, property: true } });
  const when = `${prettyDate(dateOnly(v.scheduledDate))}${v.startAt && !v.anytime ? ` at ${v.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" })}` : ""}`;
  if (v.state !== "SCHEDULED") return <Card><h1 className="font-display text-2xl font-bold">{v.state === "COMPLETED" ? "This visit is done. Thanks!" : "This visit isn't scheduled any more."}</h1></Card>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue">{when}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title}</h1>
        <p className="text-ink-soft">{v.property.formatted}</p>
      </div>
      {(sp.done === "confirmed" || v.confirmedAt) && !sp.done?.toString().startsWith("asked") ? (
        <Card className="border-emerald-200 bg-emerald-50"><p className="font-semibold text-emerald-800">Confirmed. See you then, {v.job.client.firstName}!</p></Card>
      ) : sp.done === "asked" || v.rescheduleRequestedAt ? (
        <Card className="border-blue/30"><p className="font-semibold">Got it. We&apos;ll be in touch to find a better time.</p></Card>
      ) : (
        <>
          <form action={confirmVisit}><input type="hidden" name="t" value={token} /><button className="min-h-14 w-full rounded-full bg-blue text-base font-semibold text-white">Confirm {when}</button></form>
          <Card title="Need a different time?">
            <form action={requestReschedule} className="space-y-3">
              <input type="hidden" name="t" value={token} />
              <textarea name="message" required rows={3} maxLength={1000} placeholder="e.g. Can you come Thursday afternoon instead?" className="w-full rounded-xl border border-line p-3" />
              <button className="min-h-11 rounded-full border-2 border-line px-5 font-semibold">Ask to reschedule</button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
