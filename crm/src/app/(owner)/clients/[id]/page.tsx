// Client profile, Jobber layout: header (+ Create / More), contact info, properties, contacts, tabbed work/activity/
// communication/files, billing history; right column: lifetime value + balance, last communication, notes.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Banknote, FileText, Hammer, Inbox, ListTodo, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, Receipt, Repeat, Snowflake } from "lucide-react";
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
import { Badge, Card, Empty, Tabs } from "@/components/ui";
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
  const [referredBy, referredCount, creditAgg] = await Promise.all([
    c.referredById ? db.client.findUnique({ where: { id: c.referredById } }) : null,
    db.referral.count({ where: { referrerId: c.id } }),
    db.clientCredit.aggregate({ where: { clientId: c.id, appliedToInvoiceId: null }, _sum: { amountCents: true } }),
  ]);
  const credit = creditAgg._sum.amountCents ?? 0;
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

  return (
    <>
      <DetailHeader
        back={{ href: "/clients", label: "Clients" }}
        kind={<span>Client</span>}
        status={c.archivedAt ? <Badge>Archived</Badge> : lead ? <Badge tone="blue">Lead</Badge> : <Badge tone="green">Active</Badge>}
        title={<>{c.title && <span className="text-ink-soft">{c.title} </span>}{clientName(c)}</>}
        sub={<>{c.companyName && `${c.firstName} ${c.lastName} · `}Client since {prettyDate(dateOnly(c.createdAt))}{c.tags.map((t) => <span key={t} className="ml-1.5"><Badge>{t}</Badge></span>)}</>}
        actions={<>
          {tel && <a href={tel} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-tint"><Phone className="size-4" />Call</a>}
          {phones[0] && <Link href={`/messages/${id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-tint"><MessageSquare className="size-4" />Text</Link>}
          <Menu label="Create" primary items={[
            { label: "Request", href: `/requests/new?client=${id}`, icon: <Inbox className="size-4 text-orange-700" /> },
            { label: "Quote", href: `/quotes/new?client=${id}`, icon: <FileText className="size-4 text-rose-700" /> },
            { label: "Job", href: `/jobs/new?client=${id}`, icon: <Hammer className="size-4 text-emerald-700" /> },
            { label: "Recurring job", href: `/jobs/new?client=${id}&kind=recurring`, icon: <Repeat className="size-4 text-emerald-700" /> },
            { label: "Snow plan", href: `/jobs/new?client=${id}&kind=plan`, icon: <Snowflake className="size-4 text-sky-700" /> },
            { label: "Invoice", href: `/invoices/new?client=${id}`, icon: <Receipt className="size-4 text-blue" /> },
            { label: "Collect payment", href: `/clients/${id}/collect`, icon: <Banknote className="size-4 text-blue" /> },
            { label: "Task", href: `/tasks/new?client=${id}&back=${encodeURIComponent(`/clients/${id}`)}`, icon: <ListTodo className="size-4 text-navy" /> },
            { divider: true },
            { label: "Log a call", href: `/calls/new?client=${id}&back=${encodeURIComponent(`/clients/${id}?tab=activity`)}`, icon: <Phone className="size-4 text-violet-700" /> },
            { label: "Property", href: `/clients/${id}/properties/new`, icon: <MapPin className="size-4" /> },
          ]} />
          <Menu label="More" items={[
            { label: "Edit client", href: `/clients/${id}/edit`, icon: <Pencil className="size-4" /> },
            { label: "Email client hub link", action: sendHubLink, fields: { clientId: id }, icon: <Mail className="size-4" /> },
            { divider: true },
            c.archivedAt
              ? { label: "Restore client", action: clientArchive, fields: { id, archive: "0" }, icon: <Archive className="size-4" /> }
              : { label: "Archive client", action: clientArchive, fields: { id, archive: "1" }, icon: <Archive className="size-4" />, danger: true, confirm: "Archive this client? Their history stays." },
          ]} />
        </>}
      />

      <Flash error={sp.error} />
      {dups.length > 0 && !c.archivedAt && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">Possible duplicate{dups.length === 1 ? "" : "s"}</p>
          <ul className="mt-2 space-y-2">
            {dups.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span><Link href={`/clients/${d.id}`} className="font-semibold text-blue">{clientName(d)}</Link> <span className="text-ink-soft">{[d.email, d.phone].filter(Boolean).join(" · ")}</span></span>
                <form action={clientMerge}><input type="hidden" name="id" value={id} /><input type="hidden" name="dupId" value={d.id} />
                  <ConfirmButton message={`Merge ${clientName(d)} into ${clientName(c)}? Their jobs, quotes, invoices, messages and notes move here and ${clientName(d)} is deleted. This can't be undone.`} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100">Merge into this client</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card title="Contact info" actions={<Link href={`/clients/${id}/edit`} className="text-sm font-semibold text-blue">Edit</Link>}>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Phone</dt>{phones.length ? phones.map((p) => <dd key={p.number}><a href={`tel:${p.number}`} className="font-semibold text-blue">{p.number}</a> <span className="text-ink-soft">{p.label}{p.sms ? " · texts" : ""}</span></dd>) : <dd className="text-ink-soft">—</dd>}</div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Email</dt>{c.emailBouncedAt && <dd className="text-xs font-semibold text-red-700">Email bounced: reminders and campaigns are paused. Fix the address to resume.</dd>}{emails.length ? emails.map((m) => <dd key={m.address}><a href={`mailto:${m.address}`} className="font-semibold text-blue">{m.address}</a> <span className="text-ink-soft">{m.label}</span></dd>) : <dd className="text-ink-soft">—</dd>}</div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Lead source</dt><dd>{c.leadSource ?? c.source.replaceAll("_", " ").toLowerCase()}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Referrals</dt><dd className="text-sm">{referredBy ? <>Referred by <Link className="text-blue" href={`/clients/${referredBy.id}`}>{clientName(referredBy)}</Link>. </> : ""}{referredCount ? `Referred ${referredCount}. ` : ""}{c.referralCode ? <span className="text-ink-soft">Code {c.referralCode}</span> : <span className="text-ink-soft">Share code made on first hub visit</span>}{credit > 0 && <span className="ml-1 font-semibold text-emerald-700">· {money(credit)} credit</span>}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Payment</dt><dd>{c.preferredPayment === "ETRANSFER" ? "e-Transfer" : c.preferredPayment ? c.preferredPayment.toLowerCase() : "—"}</dd></div>
              {c.cardPaymentMethodId && (
                <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase text-ink-soft">Card on file</dt><dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span><b>{cardLabel(c)}</b> · exp {c.cardExpMonth}/{String(c.cardExpYear).slice(-2)} · {c.autoPayConsentAt ? `auto-pay on (client chose it ${prettyDateTime(c.autoPayConsentAt)}, ${c.autoPayConsentSource === "invoice" ? "paying an invoice" : "on their page"})` : "auto-pay off"}</span>
                  {c.autoPayConsentAt && <form action={clientAutoPayOff}><input type="hidden" name="clientId" value={id} /><ConfirmButton message="Turn off auto-pay for this client? Invoices already waiting on the card go back to being paid the usual way. Only the client can turn it back on." className="text-xs font-semibold text-blue">Turn off auto-pay</ConfirmButton></form>}
                  <form action={clientCardRemove}><input type="hidden" name="clientId" value={id} /><ConfirmButton message="Remove this card? Auto-pay goes off with it. Only the client can save a card again." className="text-xs font-semibold text-red-700">Remove card</ConfirmButton></form>
                </dd></div>
              )}
              <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase text-ink-soft">Messages</dt><dd className="text-ink-soft">
                {[c.smsOptOutAt ? "Texted STOP" : c.smsOptIn ? "Text updates on" : "No text updates", c.visitReminders ? "visit reminders" : null, c.followUpQuotes ? "quote follow-ups" : null, c.followUpInvoices ? "invoice reminders" : null, c.marketingOptOut ? "no marketing" : null].filter(Boolean).join(" · ")}
              </dd></div>
              {c.notes && <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase text-ink-soft">Client notes</dt><dd className="whitespace-pre-line">{c.notes}</dd></div>}
            </dl>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title={`Properties (${c.properties.length})`} actions={<Link href={`/clients/${id}/properties/new`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add</Link>}>
              {c.properties.length ? (
                <ul className="divide-y divide-line">
                  {c.properties.map((p) => (
                    <li key={p.id} className="py-2.5 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <a className="font-semibold text-blue" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.formatted)}`} target="_blank" rel="noreferrer">{p.label ? `${p.label}: ` : ""}{p.formatted}</a>
                          <div className="text-xs text-ink-soft">{[p.isDefault && "Main", p.community?.name ?? "No community", p.gateCode && `Gate ${p.gateCode}`, p.accessNotes, p.petNotes && `Pets: ${p.petNotes}`].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Link href={`/properties/${p.id}/edit`} className="text-xs font-semibold text-blue">Edit</Link>
                        {c.properties.length > 1 && <form action={propertyArchive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="archive" value="1" /><button className="text-xs text-ink-soft hover:text-red-700">Remove</button></form>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty>No property yet.</Empty>}
            </Card>
            <Card title="Contacts" actions={<Link href={`/clients/${id}/edit`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add</Link>}>
              {c.contacts.length ? (
                <ul className="divide-y divide-line">
                  {c.contacts.map((x) => (
                    <li key={x.id} className="py-2.5 text-sm">
                      <span className="font-semibold">{x.firstName} {x.lastName}</span>{x.role && <span className="text-ink-soft"> · {x.role}</span>}{x.isBilling && <span className="ml-1"><Badge tone="blue">Billing</Badge></span>}
                      <div className="text-xs">{x.phone && <a href={`tel:${x.phone}`} className="text-blue">{x.phone}</a>}{x.phone && x.email && " · "}{x.email && <a href={`mailto:${x.email}`} className="text-blue">{x.email}</a>}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-soft">Just {c.firstName}. Add a spouse, tenant or property manager.</p>}
            </Card>
          </div>

          <section className="rounded-lg border border-line bg-white p-4 shadow-card sm:p-5">
            <Tabs active={{ overview: "Overview", activity: "Activity", communication: "Communication", files: "Files" }[tab]} items={[
              { href: `/clients/${id}`, label: "Overview" }, { href: `/clients/${id}?tab=activity`, label: "Activity" },
              { href: `/clients/${id}?tab=communication`, label: "Communication" }, { href: `/clients/${id}?tab=files`, label: "Files" },
            ]} />
            {tab === "overview" && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-bold">Work overview</h3>
                  <div className="mb-2 flex gap-1.5">
                    {WORK.map((w) => {
                      const n = { requests: c.requests.length, quotes: c.quotes.length, jobs: jobs.length, invoices: c.invoices.length }[w];
                      return <Link key={w} href={`/clients/${id}?work=${w}`} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${work === w ? "bg-navy text-white" : "bg-tint text-ink-soft"}`}>{w} {n}</Link>;
                    })}
                  </div>
                  <ul className="divide-y divide-line text-sm">
                    {work === "jobs" && jobs.map((j) => <li key={j.id}><Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-2"><span><span className="font-semibold">Job #{j.number}</span> {j.title}<span className="block text-xs text-ink-soft">{j.property.formatted.split(",")[0]}</span></span><JobBadge s={j.status} /></Link></li>)}
                    {work === "quotes" && c.quotes.map((q) => <li key={q.id}><Link href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 py-2"><span><span className="font-semibold">Quote #{q.number}</span> {q.title}<span className="block text-xs text-ink-soft">{money(q.totalCents)}</span></span><Badge tone={QUOTE[q.status][1]}>{QUOTE[q.status][0]}</Badge></Link></li>)}
                    {work === "requests" && c.requests.map((r) => <li key={r.id}><Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 py-2"><span><span className="font-semibold">Request #{r.number}</span> {r.title}<span className="block text-xs text-ink-soft">{prettyDateTime(r.createdAt)}</span></span><RequestBadge s={r.status} /></Link></li>)}
                    {work === "invoices" && c.invoices.map((i) => <li key={i.id}><Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-2"><span><span className="font-semibold">Invoice #{i.number}</span> {i.subject}<span className="block text-xs text-ink-soft">{money(i.totalCents)}{i.dueOn && ` · due ${prettyDate(dateOnly(i.dueOn))}`}</span></span><InvoiceBadge s={invoiceView({ ...i, dueOn: dateOnly(i.dueOn) }, today)} /></Link></li>)}
                    {!{ requests: c.requests, quotes: c.quotes, jobs, invoices: c.invoices }[work].length && <li className="py-4 text-center text-ink-soft">None yet.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold">Schedule</h3>
                  {visits.length ? (
                    <ul className="divide-y divide-line text-sm">
                      {visits.map((v) => <li key={v.id}><Link href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 py-2"><span><span className="font-semibold">{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Unscheduled"}</span> · Job #{v.job.number} {v.job.title}</span><VisitBadge s={visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, today)} /></Link></li>)}
                    </ul>
                  ) : <p className="text-sm text-ink-soft">Nothing scheduled.</p>}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">Billing history</h3>
                    <span className="flex gap-3 text-xs font-semibold text-blue">
                      <Link href={`/clients/${id}/collect`}>Collect payment</Link><Link href={`/invoices/new?client=${id}`}>New invoice</Link><Link href={`/clients/${id}/statement`}>Statement</Link>
                    </span>
                  </div>
                  {books.rows.length ? (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-soft"><th className="py-1.5 font-semibold">Date</th><th className="font-semibold">Item</th><th className="text-right font-semibold">Amount</th><th className="hidden text-right font-semibold sm:table-cell">Balance</th></tr></thead>
                      <tbody>
                        {[...books.rows].reverse().slice(0, 12).map((r) => (
                          <tr key={r.kind + r.id} className="border-b border-line/60">
                            <td className="py-2 text-ink-soft">{prettyDate(dateOnly(r.date))}</td>
                            <td><Link href={r.href} className="font-semibold text-blue">{r.label}</Link></td>
                            <td className={`text-right ${r.amountCents < 0 ? "text-emerald-700" : ""}`}>{r.amountCents < 0 ? `−${money(-r.amountCents)}` : money(r.amountCents)}</td>
                            <td className="hidden text-right sm:table-cell">{money(r.balanceCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr><td colSpan={2} className="pt-2 font-bold">Current balance</td><td colSpan={2} className="pt-2 text-right font-bold">{money(books.balanceCents)}</td></tr></tfoot>
                    </table>
                  ) : <p className="text-sm text-ink-soft">No invoices or payments yet.</p>}
                </div>
              </div>
            )}
            {(tab === "activity" || tab === "communication") && (
              <ActivityFeed items={feed} base={`/clients/${id}?tab=${tab}`} types={tab === "communication" ? ["text", "call", "email"] : parseTypes(sp.types)}
                moreHref={feed.length >= 60 ? `/clients/${id}?tab=${tab}${typeof sp.types === "string" ? `&types=${sp.types}` : ""}&before=${feed.at(-1)!.at.toISOString()}` : undefined} />
            )}
            {tab === "files" && (files.length ? <Gallery photos={files} back={here} /> : <Empty>No photos or files yet. Photos from visits, texts, notes and quote uploads collect here.</Empty>)}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-line bg-white p-4 shadow-card">
            <h2 className="mb-3 text-base font-bold">Overview</h2>
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Lifetime value</dt><dd className="font-display text-xl font-bold">{money(lifetime)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-ink-soft">Balance</dt><dd className={`font-display text-xl font-bold ${books.balanceCents > 0 ? "text-amber-700" : ""}`}>{money(books.balanceCents)}</dd></div>
            </dl>
          </section>
          <section className="rounded-lg border border-line bg-white p-4 shadow-card">
            <h2 className="mb-2 text-base font-bold">Last communication</h2>
            {last ? (
              <Link href={last.href} className="flex gap-2 text-sm hover:text-blue">
                <span className="mt-0.5 text-ink-soft">{last.icon}</span>
                <span className="min-w-0"><span className="line-clamp-2">{last.text}</span><span className="block text-xs text-ink-soft">{prettyDateTime(last.at)}</span></span>
              </Link>
            ) : <p className="text-sm text-ink-soft">No texts, emails or calls yet.</p>}
          </section>
          <NotesCard notes={notes} target={{ clientId: id }} path={`/clients/${id}`} isClient />
        </aside>
      </div>
    </>
  );
}
