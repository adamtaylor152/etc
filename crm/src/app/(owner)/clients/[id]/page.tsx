// Client profile, Jobber layout: header (+ Create / More), contact info, properties, contacts, tabbed work/activity/
// communication/files, billing history; right column: lifetime value + balance, last communication, notes.
import { siteFacts } from "@/server/clients";
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Archive, Banknote, FileText, Hammer, Inbox, ListTodo, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, Receipt, Repeat, Snowflake } from "lucide-react";
import { creditAdd, creditRemove } from "../../billing-extras-actions";
import { clientArchive, clientMerge, propertyArchive } from "../../client-actions";
import { clientAutoPayOff, clientCardRemove } from "../../card-actions";
import { cardLabel } from "@/server/billing/autopay";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash } from "@/components/flash";
import { possibleDuplicates } from "@/server/ops/client-import";
import { sendHubLink } from "../../quote-actions";
import { ActivityFeed, parseTypes } from "@/components/activity-feed";
import { DetailHeader } from "@/components/detail-header";
import { Gallery } from "@/components/gallery";
import { Menu } from "@/components/menu";
import { NotesCard } from "@/components/notes-card";
import { InvoiceBadge, JobBadge, QUOTE, RequestBadge, VisitBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, Dl, Empty, Field, Input, Notice, Stat, Tabs, btn } from "@/components/ui";
import { activityFeed } from "@/server/activity";
import { invoiceView } from "@/server/billing/invoice";
import { ledger } from "@/server/billing/ledger";
import { dateOnly, prettyDate, prettyDateTime, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { notesFor } from "@/server/ops/notes";
import { clientName, jobsWithStatus } from "@/server/queries";
import { visitStatus } from "@/server/status/job";

export async function generateMetadata({ params }: PageProps<"/clients/[id]">) {
  const c = await db.client.findFirst({ where: { id: (await params).id, businessId: await businessId() }, select: { firstName: true, lastName: true, companyName: true } });
  return { title: c ? clientName(c) : "Client" };
}

const TABS = ["overview", "activity", "communication", "files"] as const;
const WORK = ["requests", "quotes", "jobs", "invoices"] as const;

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
  const work = WORK.find((t) => t === sp.work) ?? "jobs";
  const bid = await businessId();
  const today = todayLocal();
  const c = await db.client.findFirst({
    where: { id, businessId: bid },
    include: {
      properties: { where: { archivedAt: null }, include: { community: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      contacts: { orderBy: { createdAt: "asc" } },
      requests: { orderBy: { createdAt: "desc" } }, quotes: { orderBy: { number: "desc" } },
      invoices: { where: { status: { not: "VOID" } }, orderBy: { number: "desc" } },
      payments: { include: { invoice: { select: { number: true } } }, orderBy: { receivedAt: "desc" } },
    },
  });
  if (!c) notFound();
  const dups = await possibleDuplicates(bid, id);
  const [jobs, visits, notes, lastText, lastEmail, lastCall, feed, files] = await Promise.all([
    jobsWithStatus({ businessId: bid, clientId: id }, today),
    db.visit.findMany({ where: { businessId: bid, job: { clientId: id }, state: "SCHEDULED", OR: [{ scheduledDate: { gte: toDbDate(today) } }, { scheduledDate: null }] }, include: { job: true }, orderBy: { scheduledDate: { sort: "asc", nulls: "last" } }, take: 8 }),
    notesFor(bid, { clientId: id }),
    db.textMessage.findFirst({ where: { businessId: bid, clientId: id }, orderBy: { createdAt: "desc" } }),
    db.emailMessage.findFirst({ where: { businessId: bid, clientId: id, status: "SENT", template: { not: { startsWith: "sms." } } }, orderBy: { sentAt: "desc" } }),
    db.callLog.findFirst({ where: { businessId: bid, clientId: id }, orderBy: { startedAt: "desc" } }),
    tab === "activity" || tab === "communication"
      ? activityFeed({ businessId: bid, clientId: id }, { types: tab === "communication" ? ["text", "call", "email"] : parseTypes(sp.types), before: typeof sp.before === "string" ? new Date(sp.before) : undefined, limit: 60 })
      : Promise.resolve([]),
    tab === "files" ? db.attachment.findMany({ where: { businessId: bid, clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 120 }) : Promise.resolve([]),
  ]);
  const books = ledger(c.invoices, c.payments);
  const [referredBy, referredCount, credits] = await Promise.all([
    c.referredById ? db.client.findUnique({ where: { id: c.referredById } }) : null,
    db.referral.count({ where: { referrerId: c.id } }),
    db.clientCredit.findMany({ where: { clientId: c.id, appliedToInvoiceId: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const credit = credits.reduce((n, k) => n + k.amountCents, 0);
  const lifetime = c.payments.reduce((n, p) => n + p.amountCents - p.refundedCents, 0);
  const lead = !jobs.length && !c.invoices.some((i) => i.status !== "DRAFT") && !c.quotes.some((q) => q.status === "APPROVED" || q.status === "CONVERTED");
  const phones = (Array.isArray(c.phones) && c.phones.length ? c.phones : c.phone ? [{ number: c.phone, label: "Mobile", sms: c.smsOptIn }] : []) as { number: string; label: string; sms: boolean }[];
  const emails = (Array.isArray(c.emails) && c.emails.length ? c.emails : c.email ? [{ address: c.email, label: "Main" }] : []) as { address: string; label: string }[];
  const last = [
    lastText && { at: lastText.createdAt, icon: <MessageSquare className="size-4" />, text: `${lastText.direction === "IN" ? "Texted us" : "Texted"}: ${lastText.body || "photo"}`, href: `/messages/${id}` },
    lastEmail && { at: lastEmail.sentAt ?? lastEmail.createdAt, icon: <Mail className="size-4" />, text: `Email: ${lastEmail.subject}`, href: `/clients/${id}?tab=communication` },
    lastCall && { at: lastCall.startedAt, icon: <Phone className="size-4" />, text: `${lastCall.direction === "IN" ? "Called us" : "Called"}${lastCall.notes ? `: ${lastCall.notes}` : ""}`, href: `/clients/${id}?tab=communication` },
  ].filter(Boolean).sort((a, b) => b!.at.getTime() - a!.at.getTime())[0];
  const here = `/clients/${id}${tab !== "overview" ? `?tab=${tab}` : ""}`;
  const tel = phones[0] ? `tel:${phones[0].number.replace(/[^\d+]/g, "")}` : null;

  const owing = books.balanceCents > 0;
  const counts = { requests: c.requests.length, quotes: c.quotes.length, jobs: jobs.length, invoices: c.invoices.length };
  const link = "font-semibold text-blue hover:text-blue-deep";
  const quiet = "rounded-md text-xs font-medium text-ink-soft";
  const h3 = "font-display text-[0.95rem] font-semibold";
  const newWork = { requests: ["New request", `/requests/new?client=${id}`], quotes: ["New quote", `/quotes/new?client=${id}`], jobs: ["New job", `/jobs/new?client=${id}`], invoices: ["New invoice", `/invoices/new?client=${id}`] }[work];
  const row = (key: string, href: string, kind: string, title: ReactNode, meta: ReactNode, badge: ReactNode, amount?: string) => (
    <li key={key}>
      <Link href={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-tint">
        <span className="min-w-0 flex-1"><span className="block truncate"><span className="font-semibold tabular-nums">{kind}</span> {title}</span><span className="block truncate text-xs text-ink-soft tabular-nums">{meta}</span></span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">{amount && <span className="font-medium tabular-nums">{amount}</span>}{badge}</span>
      </Link>
    </li>
  );

  const dupRow = (d: (typeof dups)[number]) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 last:pb-0">
                <span className="min-w-0"><Link href={`/clients/${d.id}`} className={link}>{clientName(d)}</Link> <span className="break-words text-amber-950/75">{[d.email, d.phone].filter(Boolean).join(" · ")}</span></span>
                <form action={clientMerge}><input type="hidden" name="id" value={id} /><input type="hidden" name="dupId" value={d.id} />
                  <ConfirmButton message={`Merge ${clientName(d)} into ${clientName(c)}? Their jobs, quotes, invoices, messages and notes move here and ${clientName(d)} is deleted. This can't be undone.`} className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100">Merge into this client</ConfirmButton>
                </form>
              </li>
  );

  return (
    <>
      <DetailHeader
        back={{ href: "/clients", label: "Clients" }}
        kind={<span>Client</span>}
        status={c.archivedAt ? <Badge>Archived</Badge> : lead ? <Badge tone="blue">Lead</Badge> : <Badge tone="green">Active</Badge>}
        title={<>{c.title && <span className="text-ink-soft">{c.title} </span>}{clientName(c)}</>}
        sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-1.5"><span>{c.companyName && `${c.firstName} ${c.lastName} · `}Client since {prettyDate(dateOnly(c.createdAt))}</span>{c.tags.map((t) => <span key={t} className="rounded-md border border-line bg-white px-1.5 py-0.5 text-xs font-medium text-ink-soft">{t}</span>)}</span>}
        actions={<>
          {tel && <a href={tel} className={btn("secondary")}><Phone className="size-4" aria-hidden />Call</a>}
          {phones[0] && <Link href={`/messages/${id}`} className={btn("secondary")}><MessageSquare className="size-4" aria-hidden />Text</Link>}
          <Menu label="Create" primary items={[
            { label: "Request", href: `/requests/new?client=${id}`, icon: <Inbox className="size-4 text-orange-700" aria-hidden /> },
            { label: "Quote", href: `/quotes/new?client=${id}`, icon: <FileText className="size-4 text-rose-700" aria-hidden /> },
            { label: "Job", href: `/jobs/new?client=${id}`, icon: <Hammer className="size-4 text-emerald-700" aria-hidden /> },
            { label: "Recurring job", href: `/jobs/new?client=${id}&kind=recurring`, icon: <Repeat className="size-4 text-emerald-700" aria-hidden /> },
            { label: "Snow plan", href: `/jobs/new?client=${id}&kind=plan`, icon: <Snowflake className="size-4 text-sky-700" aria-hidden /> },
            { label: "Invoice", href: `/invoices/new?client=${id}`, icon: <Receipt className="size-4 text-blue" aria-hidden /> },
            { label: "Collect payment", href: `/clients/${id}/collect`, icon: <Banknote className="size-4 text-blue" aria-hidden /> },
            { label: "Task", href: `/tasks/new?client=${id}&back=${encodeURIComponent(`/clients/${id}`)}`, icon: <ListTodo className="size-4 text-ink-soft" aria-hidden /> },
            { divider: true },
            { label: "Log a call", href: `/calls/new?client=${id}&back=${encodeURIComponent(`/clients/${id}?tab=activity`)}`, icon: <Phone className="size-4 text-ink-soft" aria-hidden /> },
            { label: "Property", href: `/clients/${id}/properties/new`, icon: <MapPin className="size-4 text-ink-soft" aria-hidden /> },
          ]} />
          <Menu label="More" items={[
            { label: "Edit client", href: `/clients/${id}/edit`, icon: <Pencil className="size-4 text-ink-soft" aria-hidden /> },
            { label: "Email client hub link", action: sendHubLink, fields: { clientId: id }, icon: <Mail className="size-4 text-ink-soft" aria-hidden /> },
            { divider: true },
            c.archivedAt
              ? { label: "Restore client", action: clientArchive, fields: { id, archive: "0" }, icon: <Archive className="size-4 text-ink-soft" aria-hidden /> }
              : { label: "Archive client", action: clientArchive, fields: { id, archive: "1" }, icon: <Archive className="size-4" aria-hidden />, danger: true, confirm: "Archive this client? Their history stays." },
          ]} />
        </>}
      />

      <Flash error={sp.error} />
      {c.doNotService && <Notice tone="bad"><span className="font-semibold">Do not service.</span> Check the notes before booking anything for this client.</Notice>}
      {dups.length > 0 && !c.archivedAt && (
        <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
          <p className="font-semibold">Possible duplicate{dups.length === 1 ? "" : "s"}</p>
          <ul className="mt-1 divide-y divide-amber-200/70">{dups.slice(0, 3).map(dupRow)}</ul>
          {dups.length > 3 && (
            <details className="border-t border-amber-200/70 pt-2">
              <summary className="font-semibold">Show {dups.length - 3} more</summary>
              <ul className="mt-1 divide-y divide-amber-200/70">{dups.slice(3).map(dupRow)}</ul>
            </details>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="col-span-2 lg:col-span-1">
          <Stat label="Balance owing" value={money(books.balanceCents)} tone={owing ? "warn" : undefined}
            sub={<span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">{owing ? <Link href={`/clients/${id}/collect`} className={link}>Collect payment</Link> : <span>Nothing owing</span>}<Link href={`/clients/${id}/statement`} className={link}>Statement</Link></span>} />
        </div>
        <Stat label="Lifetime value" value={money(lifetime)} sub={`${c.payments.length} payment${c.payments.length === 1 ? "" : "s"} received`} />
        <Stat label="Account credit" value={money(credit)} tone={credit > 0 ? "good" : undefined} sub={credit > 0 ? "Comes off the next invoice" : "None waiting"} />
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-2 min-w-0 lg:order-none lg:col-span-2">
          <Card>
            <Tabs active={{ overview: "Overview", activity: "Activity", communication: "Communication", files: "Files" }[tab]} items={[
              { href: `/clients/${id}`, label: "Overview" }, { href: `/clients/${id}?tab=activity`, label: "Activity" },
              { href: `/clients/${id}?tab=communication`, label: "Communication" }, { href: `/clients/${id}?tab=files`, label: "Files" },
            ]} />
            {tab === "overview" && (
              <div className="space-y-6">
                <section aria-labelledby="work-h">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <h2 id="work-h" className={h3}>Work</h2>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                      {WORK.map((w) => (
                        <Link key={w} href={`/clients/${id}?work=${w}`} aria-current={work === w ? "true" : undefined}
                          className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium capitalize ${work === w ? "border-blue/30 bg-blue/8 font-semibold text-blue-deep" : "border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:text-navy"}`}>
                          {w}<span className="tabular-nums opacity-80">{counts[w]}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  {counts[work] ? (
                    <ul className="divide-y divide-line-soft text-sm">
                      {work === "jobs" && jobs.map((j) => row(j.id, `/jobs/${j.id}`, `Job #${j.number}`, j.title, j.property.formatted.split(",")[0], <JobBadge s={j.status} />))}
                      {work === "quotes" && c.quotes.map((q) => row(q.id, `/quotes/${q.id}`, `Quote #${q.number}`, q.title, prettyDate(dateOnly(q.createdAt)), <Badge tone={QUOTE[q.status][1]}>{QUOTE[q.status][0]}</Badge>, money(q.totalCents)))}
                      {work === "requests" && c.requests.map((r) => row(r.id, `/requests/${r.id}`, `Request #${r.number}`, r.title, prettyDateTime(r.createdAt), <RequestBadge s={r.status} />))}
                      {work === "invoices" && c.invoices.map((i) => row(i.id, `/invoices/${i.id}`, `Invoice #${i.number}`, i.subject, i.dueOn ? `Due ${prettyDate(dateOnly(i.dueOn))}` : "Not sent", <InvoiceBadge s={invoiceView({ ...i, dueOn: dateOnly(i.dueOn) }, today)} />, money(i.totalCents)))}
                    </ul>
                  ) : <Empty action={<ButtonLink href={newWork[1]}><Plus className="-ml-1 size-4" aria-hidden />{newWork[0]}</ButtonLink>}>No {work} for {c.firstName} yet.</Empty>}
                </section>
                <section aria-labelledby="sched-h" className="border-t border-line-soft pt-5">
                  <h2 id="sched-h" className={`${h3} mb-2`}>Schedule</h2>
                  {visits.length ? (
                    <ul className="divide-y divide-line-soft text-sm">
                      {visits.map((v) => row(v.id, `/visits/${v.id}`, v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Unscheduled", null, `Job #${v.job.number} ${v.job.title}`, <VisitBadge s={visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, today)} />))}
                    </ul>
                  ) : <p className="text-sm text-ink-soft">Nothing scheduled.</p>}
                </section>
                <section aria-labelledby="bill-h" className="border-t border-line-soft pt-5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <h2 id="bill-h" className={h3}>Billing history</h2>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                      <Link href={`/clients/${id}/collect`} className={link}>Collect payment</Link><Link href={`/invoices/new?client=${id}`} className={link}>New invoice</Link><Link href={`/clients/${id}/statement`} className={link}>Statement</Link>
                    </span>
                  </div>
                  {books.rows.length ? (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-line text-left text-xs font-medium text-ink-soft"><th className="py-2 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Item</th><th className="text-right font-medium">Amount</th><th className="hidden pl-4 text-right font-medium sm:table-cell">Balance</th></tr></thead>
                      <tbody className="divide-y divide-line-soft">
                        {[...books.rows].reverse().slice(0, 12).map((r) => (
                          <tr key={r.kind + r.id}>
                            <td className="whitespace-nowrap py-2.5 pr-3 text-ink-soft">{prettyDate(dateOnly(r.date))}</td>
                            <td className="pr-3"><Link href={r.href} className={link}>{r.label}</Link></td>
                            <td className={`whitespace-nowrap text-right ${r.amountCents < 0 ? "text-emerald-700" : ""}`}>{r.amountCents < 0 ? `−${money(-r.amountCents)}` : money(r.amountCents)}</td>
                            <td className="hidden whitespace-nowrap pl-4 text-right text-ink-soft sm:table-cell">{money(r.balanceCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr className="border-t border-line"><td colSpan={2} className="pt-3 font-semibold">Current balance</td><td colSpan={2} className={`pt-3 text-right font-display text-lg font-semibold ${owing ? "text-amber-700" : ""}`}>{money(books.balanceCents)}</td></tr></tfoot>
                    </table>
                  ) : <p className="text-sm text-ink-soft">No invoices or payments yet.</p>}
                  {books.rows.length > 12 && <p className="mt-2 text-xs text-ink-soft">Showing the latest 12. The <Link href={`/clients/${id}/statement`} className={link}>statement</Link> has everything.</p>}
                </section>
              </div>
            )}
            {(tab === "activity" || tab === "communication") && (
              <ActivityFeed items={feed} base={`/clients/${id}?tab=${tab}`} types={tab === "communication" ? ["text", "call", "email"] : parseTypes(sp.types)}
                moreHref={feed.length >= 60 ? `/clients/${id}?tab=${tab}${typeof sp.types === "string" ? `&types=${sp.types}` : ""}&before=${feed.at(-1)!.at.toISOString()}` : undefined} />
            )}
            {tab === "files" && (files.length ? <Gallery photos={files} back={here} /> : <Empty>No photos or files yet. Photos from visits, texts, notes and quote uploads collect here.</Empty>)}
          </Card>
        </div>

        <aside className="contents lg:block lg:space-y-5">
          <Card title="Contact" className="order-1 lg:order-none" actions={<Link href={`/clients/${id}/edit`} className={`text-sm ${link}`}>Edit</Link>}>
            {c.emailBouncedAt && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900">Email bounced: reminders and campaigns are paused. Fix the address to resume.</p>}
            <Dl rows={[
              ["Phone", phones.length ? <>{phones.map((p) => <span key={p.number} className="block"><a href={`tel:${p.number}`} className={`${link} tabular-nums`}>{p.number}</a> <span className="font-normal text-ink-soft">{p.label}{p.sms ? " · texts" : ""}</span></span>)}</> : <span className="font-normal text-ink-faint">None</span>],
              ["Email", emails.length ? <>{emails.map((m) => <span key={m.address} className="block break-all"><a href={`mailto:${m.address}`} className={link}>{m.address}</a> <span className="break-normal font-normal text-ink-soft">{m.label}</span></span>)}</> : <span className="font-normal text-ink-faint">None</span>],
              ["Lead source", <span key="s" className="inline-block font-normal first-letter:uppercase">{c.leadSource ?? c.source.replaceAll("_", " ").toLowerCase()}</span>],
              ["Referrals", <span key="r" className="font-normal">{referredBy ? <>Referred by <Link className={link} href={`/clients/${referredBy.id}`}>{clientName(referredBy)}</Link>. </> : ""}{referredCount ? `Referred ${referredCount}. ` : ""}{c.referralCode ? <span className="text-ink-soft">Code {c.referralCode}</span> : <span className="text-ink-soft">Share code made on first hub visit</span>}</span>],
              ["Payment", c.preferredPayment ? <span key="p" className="inline-block font-normal first-letter:uppercase">{c.preferredPayment === "ETRANSFER" ? "e-Transfer" : c.preferredPayment.toLowerCase()}</span> : null],
              ["Card on file", c.cardPaymentMethodId ? (
                <span key="c" className="font-normal">
                  <span className="font-semibold">{cardLabel(c)}</span> · exp {c.cardExpMonth}/{String(c.cardExpYear).slice(-2)}
                  <span className="block text-ink-soft">{c.autoPayConsentAt ? `Auto-pay on (client chose it ${prettyDateTime(c.autoPayConsentAt)}, ${c.autoPayConsentSource === "invoice" ? "paying an invoice" : "on their page"})` : "Auto-pay off"}</span>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {c.autoPayConsentAt && <form action={clientAutoPayOff}><input type="hidden" name="clientId" value={id} /><ConfirmButton message="Turn off auto-pay for this client? Invoices already waiting on the card go back to being paid the usual way. Only the client can turn it back on." className={`text-[13px] ${link}`}>Turn off auto-pay</ConfirmButton></form>}
                    <form action={clientCardRemove}><input type="hidden" name="clientId" value={id} /><ConfirmButton message="Remove this card? Auto-pay goes off with it. Only the client can save a card again." className="rounded-md text-[13px] font-semibold text-red-700 hover:text-red-800">Remove card</ConfirmButton></form>
                  </span>
                </span>
              ) : null],
              ["Messages", <span key="m" className="font-normal text-ink-soft">{[c.smsOptOutAt ? "Texted STOP" : c.smsOptIn ? "Text updates on" : "No text updates", c.visitReminders ? "visit reminders" : null, c.followUpQuotes ? "quote follow-ups" : null, c.followUpInvoices ? "invoice reminders" : null, c.marketingOptOut ? "no marketing" : null].filter(Boolean).join(" · ")}</span>],
              ["Client notes", c.notes ? <span key="n" className="font-normal">{c.notes}</span> : null],
            ]} />
            <div className="mt-3 border-t border-line-soft pt-3">
              <h3 className="mb-1 text-xs font-medium text-ink-soft">Last communication</h3>
              {last ? (
                <Link href={last.href} className="-mx-2 flex gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-tint">
                  <span className="mt-0.5 shrink-0 text-ink-soft" aria-hidden>{last.icon}</span>
                  <span className="min-w-0"><span className="line-clamp-2">{last.text}</span><span className="block text-xs text-ink-soft tabular-nums">{prettyDateTime(last.at)}</span></span>
                </Link>
              ) : <p className="text-sm text-ink-soft">No texts, emails or calls yet.</p>}
            </div>
          </Card>

          <div className="order-3 lg:order-none"><NotesCard notes={notes} target={{ clientId: id }} path={`/clients/${id}`} isClient /></div>

          <Card title={<>Properties <span className="ml-1 font-sans text-xs font-medium text-ink-soft tabular-nums">{c.properties.length}</span></>} className="order-3 lg:order-none" actions={<Link href={`/clients/${id}/properties/new`} className={`inline-flex items-center gap-1 text-sm ${link}`}><Plus className="size-4" aria-hidden />Add</Link>}>
            {c.properties.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {c.properties.map((p) => (
                  <li key={p.id} className="flex items-start gap-2.5 py-3 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <a className={link} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.formatted)}`} target="_blank" rel="noreferrer">{p.label ? `${p.label}: ` : ""}{p.formatted}</a>
                      <div className="mt-0.5 text-xs text-ink-soft">{[p.isDefault && "Main", p.community?.name ?? "No community", p.gateCode && `Gate ${p.gateCode}`, p.accessNotes, p.petNotes && `Pets: ${p.petNotes}`, siteFacts(p)].filter(Boolean).join(" · ")}</div>
                      <div className="mt-1 flex gap-4">
                        <Link href={`/properties/${p.id}/edit`} className={`${quiet} hover:text-navy`}>Edit</Link>
                        {c.properties.length > 1 && <form action={propertyArchive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="archive" value="1" /><ConfirmButton message={`Remove ${p.formatted.split(",")[0]} from this client?`} className={`${quiet} hover:text-red-700`}>Remove</ConfirmButton></form>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty action={<ButtonLink href={`/clients/${id}/properties/new`}><Plus className="-ml-1 size-4" aria-hidden />Add property</ButtonLink>}>No property yet. Add where the work happens.</Empty>}
          </Card>

          <Card title="Contacts" className="order-3 lg:order-none" actions={<Link href={`/clients/${id}/edit`} className={`inline-flex items-center gap-1 text-sm ${link}`}><Plus className="size-4" aria-hidden />Add</Link>}>
            {c.contacts.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {c.contacts.map((x) => (
                  <li key={x.id} className="py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold">{x.firstName} {x.lastName}</span>{x.role && <span className="text-ink-soft">{x.role}</span>}{x.isBilling && <Badge tone="blue">Billing</Badge>}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px]">{x.phone && <a href={`tel:${x.phone}`} className={`${link} tabular-nums`}>{x.phone}</a>}{x.email && <a href={`mailto:${x.email}`} className={`${link} break-all`}>{x.email}</a>}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">Just {c.firstName}. Add a spouse, tenant or property manager.</p>}
          </Card>

          <Card title="Account credit" className="order-3 lg:order-none" actions={credit > 0 ? <span className="font-display font-semibold text-emerald-700 tabular-nums">{money(credit)}</span> : undefined}>
            {credits.length ? (
              <ul className="-mt-1 mb-2 divide-y divide-line-soft text-sm">
                {credits.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="font-semibold tabular-nums">{money(k.amountCents)}</span> {k.reason}<span className="block text-xs text-ink-soft">{prettyDate(dateOnly(k.createdAt))}</span></span>
                    {!k.referralId && <form action={creditRemove}><input type="hidden" name="id" value={k.id} /><input type="hidden" name="back" value={here} /><ConfirmButton message={`Remove this ${money(k.amountCents)} credit?`} className={`${quiet} hover:text-red-700`}>Remove</ConfirmButton></form>}
                  </li>
                ))}
              </ul>
            ) : <p className="mb-1 text-sm text-ink-soft">None waiting.</p>}
            <p className="mb-2 text-xs text-ink-soft">Credit comes off this client&apos;s next invoice automatically.</p>
            <details>
              <summary className={`text-sm ${link}`}>Add credit</summary>
              <form action={creditAdd} className="mt-3 space-y-3">
                <input type="hidden" name="clientId" value={id} /><input type="hidden" name="back" value={here} />
                <Field label="Amount ($)"><Input name="amount" type="number" step="0.01" min="0.01" required className="tabular-nums" /></Field>
                <Field label="Reason" hint="The client sees it on their invoice"><Input name="reason" list="credit-reasons" defaultValue="Goodwill credit" maxLength={120} required /></Field>
                <datalist id="credit-reasons"><option value="Goodwill credit" /><option value="Overpayment credit" /></datalist>
                <Button variant="secondary">Add credit</Button>
              </form>
            </details>
          </Card>

        </aside>
      </div>
    </>
  );
}
