// One conversation: bubbles with MMS photos, file photos onto the client's job/quote, link unknown numbers to a client.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleAlert, Film, Paperclip, Phone, Plus, User, X } from "lucide-react";
import type { Attachment } from "@/generated/prisma/client";
import { Flash } from "@/components/flash";
import { ClientSelect } from "@/components/client-select";
import { Composer } from "@/components/messages/composer";
import { LiveThread } from "@/components/messages/live";
import { Badge, Button, Input, btn, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { rcsEnabled, smsEnabled, toE164 } from "@/server/sms";
import { textLinkClient, textNewClient, textPhotosLink } from "../../text-actions";

const TZ = "America/Edmonton";
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
const time = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const pretty = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
const STATUS: Record<string, string> = { queued: "Sending…", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent", delivery_failed: "Not delivered", sending_failed: "Not sent", delivery_unconfirmed: "Sent" };

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
  const [texts, jobs, quotes] = await Promise.all([
    db.textMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 400, include: { media: { where: { deletedAt: null }, include: { job: true, quote: true }, orderBy: { createdAt: "asc" } } } }).then((t) => t.reverse()),
    client ? db.job.findMany({ where: { businessId: bid, clientId: client.id }, orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { number: "desc" }], take: 25 }) : [],
    client ? db.quote.findMany({ where: { businessId: bid, clientId: client.id }, orderBy: { number: "desc" }, take: 25 }) : [],
  ]);
  await db.textMessage.updateMany({ where: { ...where, direction: "IN", readAt: null }, data: { readAt: new Date() } });

  const optedOut = !!client?.smsOptOutAt;
  const disabled = !smsEnabled() ? "Texting isn't set up yet. Ask whoever runs your hosting to turn it on."
    : !phone ? "No mobile number on file. Add one on the client page."
    : client?.smsOptOutAt ? `${client.firstName} texted STOP. They have to text START before you can text them.` : undefined;
  const name = client ? clientName(client) : pretty(number!);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-card">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2 sm:gap-3 sm:px-4">
        <Link href="/messages" className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-tint hover:text-navy md:hidden" aria-label="Back to conversations"><ChevronLeft className="size-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1 md:pl-0">
          <h1 className="truncate font-display text-lg font-semibold leading-tight">{name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
            <span className="tabular-nums">{phone ? pretty(phone) : "No mobile number"}</span>
            {optedOut && <Badge tone="amber">Texted STOP</Badge>}
            {unknown && <Badge tone="amber">Not linked to a client</Badge>}
          </p>
        </div>
        {phone && <a href={`tel:${phone}`} className={btn("secondary", "min-h-11 px-3 sm:min-h-10 sm:px-4")} aria-label={`Call ${name}`}><Phone className="size-4" aria-hidden /><span className="hidden sm:inline">Call</span></a>}
        {client && <Link href={`/clients/${client.id}`} className={btn("secondary", "min-h-11 px-3 sm:min-h-10 sm:px-4")} aria-label={`Open ${name}'s client page`}><User className="size-4" aria-hidden /><span className="hidden sm:inline">Client</span></Link>}
      </header>

      {unknown && (
        <details className="border-b border-amber-200 bg-amber-50 px-4 text-sm text-amber-950" open={!texts.some((t) => t.direction === "OUT")}>
          <summary className="flex min-h-11 items-center font-semibold">Who is this? Link this number to a client</summary>
          <div className="grid gap-5 pb-4 pt-1 text-navy sm:grid-cols-2">
            <form action={textLinkClient} className="space-y-2">
              <input type="hidden" name="key" value={key} />
              <p className="font-semibold">Existing client</p>
              <ClientSelect required none="Choose" />
              <Button variant="secondary">Link to this client</Button>
            </form>
            <form action={textNewClient} className="space-y-2">
              <input type="hidden" name="key" value={key} />
              <p className="font-semibold">New client</p>
              <div className="grid grid-cols-2 gap-2"><Input name="firstName" placeholder="First name" aria-label="First name" required /><Input name="lastName" placeholder="Last name" aria-label="Last name" /></div>
              <Input name="email" type="email" placeholder="Email (optional)" aria-label="Email (optional)" />
              <Button variant="secondary">Create client</Button>
            </form>
          </div>
        </details>
      )}
      {sp.error && <div className="px-3 pt-3"><Flash error={sp.error} /></div>}

      <LiveThread count={texts.length + texts.reduce((n, t) => n + t.media.length, 0)}>
        {!texts.length && <p className="mx-auto max-w-[40ch] py-10 text-center text-sm text-ink-soft">No texts with {name} yet. {disabled ? "" : "Write the first one below."}</p>}
        <ol className="space-y-2">
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
                {sep && <p className="my-4 flex items-center gap-3 text-xs font-medium text-ink-soft before:h-px before:flex-1 before:bg-line-soft after:h-px after:flex-1 after:bg-line-soft">{sep}</p>}
                <div className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
                  <span className="sr-only">{out ? "You:" : `${name}:`}</span>
                  {photos.length > 0 && (
                    <div className={`mb-1 flex max-w-[85%] flex-wrap gap-1.5 ${out ? "justify-end" : ""}`}>
                      {photos.map((p, n) => (
                        <a key={p.id} href={`/api/media/${p.id}/lg`} target="_blank" rel="noreferrer" className="block size-28 overflow-hidden rounded-lg border border-line bg-tint hover:border-ink-faint/60 sm:size-32" title="Open full size">
                          {/* eslint-disable-next-line @next/next/no-img-element -- private media, our own variants */}
                          <img src={`/api/media/${p.id}/md`} alt={`Texted photo ${n + 1} of ${photos.length}`} loading="lazy" className="size-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {files.map((f) => (
                    <a key={f.id} href={`/api/media/${f.id}/file`} className="mb-1 inline-flex min-h-10 max-w-[85%] items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-blue hover:bg-tint">
                      {f.mediaType === "VIDEO" ? <Film className="size-4 shrink-0" aria-hidden /> : <Paperclip className="size-4 shrink-0" aria-hidden />}
                      <span className="truncate">{f.filename ?? (f.mediaType === "VIDEO" ? "Video" : "Attachment")}</span><span className="shrink-0 tabular-nums text-ink-soft">{Math.max(1, Math.round(f.bytes / 1024))} KB</span>
                    </a>
                  ))}
                  {pending > 0 && <p className="mb-1 rounded-lg bg-tint px-3 py-2 text-xs text-ink-soft">Downloading {pending} attachment{pending === 1 ? "" : "s"}…</p>}
                  {t.body && (
                    <div className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:max-w-md ${out ? (failed ? "rounded-br-md border border-red-200 bg-red-50 text-red-900" : "rounded-br-md bg-blue text-white") : "rounded-bl-md border border-line-soft bg-tint text-navy"}`}>{t.body}</div>
                  )}
                  <p className={`mt-1 flex flex-wrap items-center gap-x-1 px-1 text-[11px] tabular-nums text-ink-soft ${out ? "justify-end" : ""}`}>
                    {failed && <CircleAlert className="size-3.5 text-red-700" aria-hidden />}
                    <time dateTime={t.createdAt.toISOString()}>{time(t.createdAt)}</time>{t.type !== "SMS" && <span>· {t.type}</span>}{out && <span className={failed ? "font-semibold text-red-700" : ""}>· {STATUS[t.status] ?? t.status}</span>}
                  </p>
                  {/* The stored error is the provider's own words: kept on the row and in the logs, never shown. */}
                  {t.error && <p className={`max-w-[85%] px-1 text-xs text-red-700 ${out ? "text-right" : ""}`}>{out ? "Couldn't send. Try again, or check texting is set up." : "Couldn't download an attachment."}</p>}
                  {t.media.length > 0 && <PhotoLinks messageKey={key} messageId={t.id} media={t.media} jobs={jobs} quotes={quotes} canLink={!!client} out={out} />}
                </div>
              </li>
            );
          })}
        </ol>
      </LiveThread>

      <Composer convoKey={key} disabled={disabled} optedOut={optedOut && smsEnabled() && !!phone} quick={(await getSettings(db, bid)).quickReplies} rcs={rcsEnabled()} />
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
    <span key={href} className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-3 pr-1 text-xs font-semibold text-emerald-900">
      <Link href={href} className="hover:underline">Filed on {label}</Link>
      <form action={textPhotosLink}>
        <input type="hidden" name="key" value={messageKey} /><input type="hidden" name="messageId" value={messageId} /><input type="hidden" name="target" value={target} />
        <button className="grid size-7 place-items-center rounded-full hover:bg-emerald-100" aria-label={`Remove from ${label}`} title={`Remove from ${label}`}><X className="size-3.5" aria-hidden /></button>
      </form>
    </span>
  );
  return (
    <div className={`mt-1.5 flex max-w-[85%] flex-wrap items-center gap-1.5 ${out ? "justify-end" : ""}`}>
      {onJobs.map(([id, j]) => chip(`/jobs/${id}`, `Job #${j.number}`, "unjob"))}
      {onQuotes.map(([id, q]) => chip(`/quotes/${id}`, `Quote #${q.number}`, "unquote"))}
      {canLink ? (
        (jobs.length > 0 || quotes.length > 0) ? (
          <details className="relative">
            <summary className="list-none inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-line bg-white px-3 text-xs font-semibold text-navy hover:border-ink-faint/60 hover:bg-tint"><Plus className="size-3.5 text-ink-soft" aria-hidden />Add to a job or quote</summary>
            <form action={textPhotosLink} className={`absolute z-10 mt-1 w-72 max-w-[80vw] space-y-2 rounded-xl border border-line bg-white p-3 text-sm shadow-lg ${out ? "right-0" : "left-0"}`}>
              <input type="hidden" name="key" value={messageKey} /><input type="hidden" name="messageId" value={messageId} />
              {media.length > 1 && (
                <div className="flex flex-wrap gap-x-3">
                  {media.map((m, i) => (
                    <label key={m.id} className="flex min-h-9 items-center gap-1.5 text-sm"><input type="checkbox" name="photo" value={m.id} defaultChecked className="size-5" />{m.mediaType === "IMAGE" ? `Photo ${i + 1}` : (m.filename ?? `File ${i + 1}`)}</label>
                  ))}
                </div>
              )}
              <select name="target" required aria-label="Job or quote" className={inputCls}>
                <option value="">Choose…</option>
                {jobs.length > 0 && <optgroup label="Jobs">{jobs.map((j) => <option key={j.id} value={`job:${j.id}`}>Job #{j.number} {j.title}{j.closedAt ? " (closed)" : ""}</option>)}</optgroup>}
                {quotes.length > 0 && <optgroup label="Quotes">{quotes.map((q) => <option key={q.id} value={`quote:${q.id}`}>Quote #{q.number} {q.title ?? ""}</option>)}</optgroup>}
              </select>
              <Button>File here</Button>
            </form>
          </details>
        ) : <span className="text-xs text-ink-soft">No jobs or quotes yet to file this on.</span>
      ) : <span className="text-xs text-ink-soft">Link this number to a client to file photos on a job.</span>}
    </div>
  );
}
