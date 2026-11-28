// One conversation: bubbles with MMS photos, file photos onto the client's job/quote, link unknown numbers to a client.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Attachment } from "@/generated/prisma/client";
import { Flash } from "@/components/flash";
import { Composer } from "@/components/messages/composer";
import { LiveThread } from "@/components/messages/live";
import { Input } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { rcsEnabled, smsEnabled, toE164 } from "@/server/sms";
import { textLinkClient, textNewClient, textPhotosLink } from "../../text-actions";

const TZ = "America/Edmonton";
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
const time = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const pretty = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
const STATUS: Record<string, string> = { queued: "Sending…", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent", delivery_failed: "Not delivered", sending_failed: "Not sent", delivery_unconfirmed: "Sent" };
const QUICK = ["On our way!", "All done, thanks! Photos are on your invoice email.", "Thanks! Can you text us a photo of the area?", "Got it, we'll send you a quote shortly."];

export default async function Thread({ params, searchParams }: PageProps<"/messages/[key]">) {
  await requireOwner();
  const { key } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const unknown = key.startsWith("n");
  const number = unknown ? `+${key.slice(1)}` : null;
  if (unknown && !toE164(number)) notFound();
  const client = unknown ? null : await db.client.findFirst({ where: { id: key, businessId: bid } });
  if (!unknown && !client) notFound();
  const phone = client ? toE164(client.phone) : number;
  const where = client ? { businessId: bid, clientId: client.id } : { businessId: bid, clientId: null, OR: [{ from: number! }, { to: number! }] };
  const [texts, jobs, quotes, clients] = await Promise.all([
    db.textMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 400, include: { media: { where: { deletedAt: null }, include: { job: true, quote: true }, orderBy: { createdAt: "asc" } } } }).then((t) => t.reverse()),
    client ? db.job.findMany({ where: { businessId: bid, clientId: client.id }, orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { number: "desc" }], take: 25 }) : [],
    client ? db.quote.findMany({ where: { businessId: bid, clientId: client.id }, orderBy: { number: "desc" }, take: 25 }) : [],
    unknown ? db.client.findMany({ where: { businessId: bid, archivedAt: null }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 2000 }) : [],
  ]);
  await db.textMessage.updateMany({ where: { ...where, direction: "IN", readAt: null }, data: { readAt: new Date() } });

  const disabled = !smsEnabled() ? "Texting turns on once the Telnyx key is set in Coolify."
    : !phone ? "No mobile number on file. Add one on the client page."
    : client?.smsOptOutAt ? `${client.firstName} texted STOP. They have to text START before you can text them.` : undefined;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <Link href="/messages" className="text-2xl leading-none text-blue md:hidden" aria-label="Back to conversations">‹</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">{client ? clientName(client) : pretty(number!)}</h1>
          <p className="truncate text-xs text-ink-soft">
            {phone ? pretty(phone) : "No mobile number"}{client?.smsOptOutAt && " · texted STOP"}{unknown && " · not linked to a client"}
          </p>
        </div>
        {phone && <a href={`tel:${phone}`} className="inline-flex min-h-10 items-center rounded-full border-2 border-line px-4 text-sm font-semibold">Call</a>}
        {client && <Link href={`/clients/${client.id}`} className="inline-flex min-h-10 items-center rounded-full border-2 border-line px-4 text-sm font-semibold">Client</Link>}
      </header>

      {unknown && (
        <details className="border-b border-line bg-amber-50 px-4 py-2 text-sm" open={!texts.some((t) => t.direction === "OUT")}>
          <summary className="cursor-pointer font-semibold text-amber-900">Who is this? Link this number to a client</summary>
          <div className="grid gap-4 py-3 sm:grid-cols-2">
            <form action={textLinkClient} className="space-y-2">
              <input type="hidden" name="key" value={key} />
              <p className="font-semibold">Existing client</p>
              <select name="clientId" required className="min-h-11 w-full rounded-xl border border-line bg-white px-3">
                <option value="">Choose…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
              <button className="inline-flex min-h-10 items-center rounded-full bg-navy px-4 font-semibold text-white">Link</button>
            </form>
            <form action={textNewClient} className="space-y-2">
              <input type="hidden" name="key" value={key} />
              <p className="font-semibold">New client</p>
              <div className="grid grid-cols-2 gap-2"><Input name="firstName" placeholder="First name" required /><Input name="lastName" placeholder="Last name" /></div>
              <Input name="email" type="email" placeholder="Email (optional)" />
              <button className="inline-flex min-h-10 items-center rounded-full bg-navy px-4 font-semibold text-white">Create client</button>
            </form>
          </div>
        </details>
      )}
      <div className="px-3 pt-2"><Flash error={sp.error} /></div>

      <LiveThread count={texts.length + texts.reduce((n, t) => n + t.media.length, 0)}>
        {!texts.length && <p className="py-10 text-center text-sm text-ink-soft">No texts yet. Say hi below.</p>}
        <ol className="space-y-1.5">
          {texts.map((t, i) => {
            const d = day(t.createdAt);
            const sep = i === 0 || day(texts[i - 1].createdAt) !== d ? d : null;
            const out = t.direction === "OUT";
            const pending = Array.isArray(t.mediaPending) ? t.mediaPending.length : 0;
            const photos = t.media.filter((m) => m.mediaType === "IMAGE");
            const files = t.media.filter((m) => m.mediaType !== "IMAGE");
            const failed = t.status.includes("fail");
            return (
              <li key={t.id}>
                {sep && <p className="my-3 text-center text-xs font-semibold text-ink-soft">{sep}</p>}
                <div className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
                  {photos.length > 0 && (
                    <div className={`mb-1 grid w-64 max-w-[85%] gap-1 sm:w-80 ${photos.length > 1 ? "grid-cols-2" : ""}`}>
                      {photos.map((p) => (
                        <a key={p.id} href={`/api/media/${p.id}/lg`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-line bg-tint">
                          {/* eslint-disable-next-line @next/next/no-img-element -- private media, our own variants */}
                          <img src={`/api/media/${p.id}/md`} alt="Texted photo" loading="lazy" className={`w-full object-cover ${photos.length > 1 ? "aspect-square" : "max-h-80"}`} />
                        </a>
                      ))}
                    </div>
                  )}
                  {files.map((f) => (
                    <a key={f.id} href={`/api/media/${f.id}/file`} className="mb-1 inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm font-semibold text-blue">
                      <span aria-hidden>{f.mediaType === "VIDEO" ? "🎬" : "📎"}</span>{f.filename ?? (f.mediaType === "VIDEO" ? "Video" : "Attachment")} · {Math.max(1, Math.round(f.bytes / 1024))} KB
                    </a>
                  ))}
                  {pending > 0 && <p className="mb-1 rounded-2xl bg-tint px-3 py-2 text-xs text-ink-soft">Downloading {pending} attachment{pending === 1 ? "" : "s"}…</p>}
                  {t.body && (
                    <div className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:max-w-md ${out ? (failed ? "bg-red-100 text-red-900" : "bg-blue text-white") : "bg-tint text-navy"}`}>{t.body}</div>
                  )}
                  <p className="mt-0.5 px-1 text-[11px] text-ink-soft">
                    {time(t.createdAt)}{t.type !== "SMS" && ` · ${t.type}`}{out && ` · ${STATUS[t.status] ?? t.status}`}{t.error && <span className="text-red-700"> · {t.error}</span>}
                  </p>
                  {t.media.length > 0 && <PhotoLinks messageKey={key} messageId={t.id} media={t.media} jobs={jobs} quotes={quotes} canLink={!!client} out={out} />}
                </div>
              </li>
            );
          })}
        </ol>
      </LiveThread>

      <Composer convoKey={key} disabled={disabled} quick={QUICK} rcs={rcsEnabled()} />
    </section>
  );
}

type Linked = Attachment & { job: { number: number; title: string } | null; quote: { number: number } | null };

/** Chips for where a text's photos are filed, plus a small form to file them on a job or quote. */
function PhotoLinks({ messageKey, messageId, media, jobs, quotes, canLink, out }: {
  messageKey: string; messageId: string; media: Linked[]; jobs: { id: string; number: number; title: string; closedAt: Date | null }[];
  quotes: { id: string; number: number; title: string | null }[]; canLink: boolean; out: boolean;
}) {
  const onJobs = [...new Map(media.filter((m) => m.jobId && m.job).map((m) => [m.jobId!, m.job!])).entries()];
  const onQuotes = [...new Map(media.filter((m) => m.quoteId && m.quote).map((m) => [m.quoteId!, m.quote!])).entries()];
  const chip = (href: string, label: string, target: string) => (
    <span key={href} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-emerald-800">
      <Link href={href}>{label}</Link>
      <form action={textPhotosLink}>
        <input type="hidden" name="key" value={messageKey} /><input type="hidden" name="messageId" value={messageId} /><input type="hidden" name="target" value={target} />
        <button className="grid size-5 place-items-center rounded-full hover:bg-emerald-100" aria-label={`Remove from ${label}`}>✕</button>
      </form>
    </span>
  );
  return (
    <div className={`mt-1 flex max-w-[85%] flex-wrap items-center gap-1.5 ${out ? "justify-end" : ""}`}>
      {onJobs.map(([id, j]) => chip(`/jobs/${id}`, `Job #${j.number}`, "unjob"))}
      {onQuotes.map(([id, q]) => chip(`/quotes/${id}`, `Quote #${q.number}`, "unquote"))}
      {canLink ? (
        (jobs.length > 0 || quotes.length > 0) ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-blue hover:bg-tint">+ Add to job / quote</summary>
            <form action={textPhotosLink} className={`absolute z-10 mt-1 w-72 space-y-2 rounded-xl border border-line bg-white p-3 text-sm shadow-lg ${out ? "right-0" : "left-0"}`}>
              <input type="hidden" name="key" value={messageKey} /><input type="hidden" name="messageId" value={messageId} />
              {media.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {media.map((m, i) => (
                    <label key={m.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="photo" value={m.id} defaultChecked className="size-4" />{m.mediaType === "IMAGE" ? `Photo ${i + 1}` : (m.filename ?? `File ${i + 1}`)}</label>
                  ))}
                </div>
              )}
              <select name="target" required className="min-h-10 w-full rounded-lg border border-line bg-white px-2">
                <option value="">Choose…</option>
                {jobs.length > 0 && <optgroup label="Jobs">{jobs.map((j) => <option key={j.id} value={`job:${j.id}`}>Job #{j.number} {j.title}{j.closedAt ? " (closed)" : ""}</option>)}</optgroup>}
                {quotes.length > 0 && <optgroup label="Quotes">{quotes.map((q) => <option key={q.id} value={`quote:${q.id}`}>Quote #{q.number} {q.title ?? ""}</option>)}</optgroup>}
              </select>
              <button className="inline-flex min-h-9 items-center rounded-full bg-blue px-4 text-sm font-semibold text-white">Save</button>
            </form>
          </details>
        ) : <span className="text-xs text-ink-soft">No jobs or quotes yet to file this on.</span>
      ) : <span className="text-xs text-ink-soft">Link this number to a client to file photos on a job.</span>}
    </div>
  );
}
