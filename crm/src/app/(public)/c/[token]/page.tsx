// Client confirms an upcoming visit, or asks for a different time (owners get notified; shows on the calendar).
import { CalendarDays, MapPin } from "lucide-react";
import { Cta, Done, Help, LinkProblem, PageTitle, Tap } from "@/components/public/kit";
import { Card, inputCls, Notice } from "@/components/ui";
import { dateOnly, prettyDate } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { peekToken } from "@/server/tokens";
import { rescheduleTimes } from "@/server/booking/slots";
import { getSettings } from "@/server/settings";
import { windowHint } from "@/server/windows";
import { confirmVisit, pickNewTime, requestReschedule } from "./actions";

export const metadata = { title: { absolute: "Your visit · etc." }, robots: { index: false } };

export default async function ConfirmVisit({ params, searchParams }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["VISIT_CONFIRM"]);
  if (!t.ok || !t.token.visitId) return <LinkProblem title="This link has expired">Give us a call or text if anything changed.</LinkProblem>;
  const v = await db.visit.findUniqueOrThrow({ where: { id: t.token.visitId }, include: { job: { include: { client: true } }, property: true, assignees: true } });
  const when = `${prettyDate(dateOnly(v.scheduledDate))}${v.startAt && !v.anytime ? ` at ${v.startAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" })}` : ""}`;
  if (v.state !== "SCHEDULED") return v.state === "COMPLETED" ? <Done title="This visit is done. Thanks." /> : <LinkProblem title="This visit isn't scheduled any more.">Give us a call or text if you have questions.</LinkProblem>;
  const pick = (await getSettings(db, v.businessId)).clientReschedule && v.job.kind !== "SNOW_PLAN" ? await rescheduleTimes(v.businessId, v) : null;
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const settled = sp.done === "moved" || ((sp.done === "confirmed" || v.confirmedAt) && !sp.done?.toString().startsWith("asked")) || sp.done === "asked" || !!v.rescheduleRequestedAt;
  return (
    <>
      {sp.done === "taken" && <Notice tone="warn">Sorry, that time just filled up. Please pick another.</Notice>}
      <PageTitle eyebrow={settled ? "Your visit" : "Please confirm your visit"} title={v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title} />
      <div className="grid gap-5">
        <Card>
          <dl className="space-y-3">
            <div className="flex items-start gap-3"><CalendarDays className="mt-1 size-[18px] shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden /><div><dt className="text-sm font-medium text-ink-soft">When</dt><dd className="font-display text-xl font-semibold tabular-nums">{when}</dd></div></div>
            <div className="flex items-start gap-3"><MapPin className="mt-1 size-[18px] shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden /><div><dt className="text-sm font-medium text-ink-soft">Where</dt><dd>{v.property.formatted}</dd></div></div>
          </dl>
        </Card>
        {sp.done === "moved" ? (
          <Done title={`Done. You're now booked for ${when}.`}>See you then, {v.job.client.firstName}.</Done>
        ) : (sp.done === "confirmed" || v.confirmedAt) && !sp.done?.toString().startsWith("asked") ? (
          <Done title="Confirmed.">See you then, {v.job.client.firstName}.</Done>
        ) : sp.done === "asked" || v.rescheduleRequestedAt ? (
          <Done tone="info" title="Got it.">We&apos;ll be in touch to find a better time.</Done>
        ) : (
          <>
            <form action={confirmVisit}><input type="hidden" name="t" value={token} /><Cta>Confirm {when}</Cta></form>
            {pick && pick.days.length > 0 && (
              <Card title="Pick a different time">
                <form action={pickNewTime} className="-my-1 divide-y divide-line-soft">
                  <input type="hidden" name="t" value={token} />
                  {pick.days.map((d) => (
                    <details key={d.date}>
                      <summary className="py-3.5 font-semibold tabular-nums">{dayLabel(d.date)}</summary>
                      <div className="flex flex-wrap gap-2 pb-4">
                        {pick.windows.filter((w) => d.windows.includes(w.key)).map((w) => (
                          <button key={w.key} name="slot" value={`${d.date}|${w.key}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-4 font-semibold hover:border-blue hover:bg-blue/5">{w.label} <span className="font-normal text-ink-soft tabular-nums">{windowHint(w)}</span></button>
                        ))}
                      </div>
                    </details>
                  ))}
                </form>
              </Card>
            )}
            <Card title={pick?.days.length ? "None of those work?" : "Need a different time?"}>
              <form action={requestReschedule} className="space-y-3">
                <input type="hidden" name="t" value={token} />
                <textarea name="message" required rows={3} maxLength={1000} aria-label="What time would work better?" placeholder="e.g. Can you come Thursday afternoon instead?" className={inputCls} />
                <Tap className="w-full sm:w-auto">Ask to reschedule</Tap>
              </form>
            </Card>
          </>
        )}
      </div>
      <Help phone={env.phone} email={env.helpEmail} />
    </>
  );
}
