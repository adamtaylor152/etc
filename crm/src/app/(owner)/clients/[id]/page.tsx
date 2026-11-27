import Link from "next/link";
import { notFound } from "next/navigation";
import { JobBadge, RequestBadge } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { Badge, Button, Card, Dl, Empty, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { prettyDateTime } from "@/server/dates";
import { money } from "@/server/money";
import { businessId, db } from "@/server/db";
import { clientName, jobsWithStatus } from "@/server/queries";
import { updateClient } from "../../actions";
import { sendHubLink } from "../../quote-actions";

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const editing = sp.edit === "1";
  const bid = await businessId();
  const c = await db.client.findFirst({
    where: { id, businessId: bid },
    include: {
      properties: { include: { community: true }, orderBy: { createdAt: "asc" } }, requests: { orderBy: { createdAt: "desc" } },
      invoices: { where: { status: { not: "VOID" } }, orderBy: { number: "desc" } },
    },
  });
  if (!c) notFound();
  const [jobs, notes, events] = await Promise.all([
    jobsWithStatus({ businessId: bid, clientId: id }),
    db.note.findMany({ where: { businessId: bid, clientId: id }, orderBy: { createdAt: "desc" } }),
    db.activityEvent.findMany({ where: { businessId: bid, clientId: id }, orderBy: { at: "desc" }, take: 50 }),
  ]);
  const tel = c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : null;
  return (
    <>
      <PageHeader
        title={<>{clientName(c)} {c.archivedAt ? <Badge>Archived</Badge> : <Badge tone={jobs.length ? "green" : "blue"}>{jobs.length ? "Active" : "Lead"}</Badge>}</>}
        sub={<>Client since {prettyDateTime(c.createdAt)}{c.tags.map((t) => <span key={t} className="ml-1.5"><Badge>{t}</Badge></span>)}</>}
        actions={<>
          {tel && <a href={tel} className="inline-flex min-h-11 items-center rounded-full border-2 border-blue bg-blue px-5 text-sm font-semibold text-white">Call</a>}
          <a href={`mailto:${c.email}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">Email</a>
          <form action={sendHubLink}><input type="hidden" name="clientId" value={c.id} /><button className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">{sp.hub === "sent" ? "Hub link sent ✓" : "Send hub link"}</button></form>
          <Link href={`/quotes/new?client=${id}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">New quote</Link>
          <Link href={`/jobs/new?client=${id}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">New job</Link>
          <Link href={`/jobs/new?client=${id}&kind=recurring`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">Recurring</Link>
          <Link href={`/jobs/new?client=${id}&kind=plan`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">Snow plan</Link>
          <Link href={editing ? `/clients/${id}` : `/clients/${id}?edit=1`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">{editing ? "Cancel" : "Edit"}</Link>
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {editing ? (
            <Card title="Edit client">
              <form action={updateClient} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <Field label="First name"><Input name="firstName" defaultValue={c.firstName} required /></Field>
                <Field label="Last name"><Input name="lastName" defaultValue={c.lastName} /></Field>
                <Field label="Company"><Input name="companyName" defaultValue={c.companyName ?? ""} /></Field>
                <Field label="Email"><Input name="email" type="email" defaultValue={c.email} required /></Field>
                <Field label="Phone"><Input name="phone" type="tel" defaultValue={c.phone ?? ""} /></Field>
                <Field label="Tags" hint="Comma-separated, e.g. senior, corner lot"><Input name="tags" defaultValue={c.tags.join(", ")} /></Field>
                <div className="sm:col-span-2"><Field label="Notes"><Textarea name="notes" rows={3} defaultValue={c.notes ?? ""} /></Field></div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="smsOptIn" defaultChecked={c.smsOptIn} className="size-5" /> Texts OK (client said yes to text updates)</label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="marketingOptOut" defaultChecked={c.marketingOptOut} className="size-5" /> No marketing emails (reviews, renewals)</label>
                <div className="sm:col-span-2"><Button>Save</Button></div>
              </form>
            </Card>
          ) : (
            <Card title="Contact">
              <Dl rows={[["Email", c.email], ["Phone", c.phone ? `${c.phone}${c.smsOptIn ? " · texts OK" : ""}` : null], ["Payment", c.preferredPayment === "ETRANSFER" ? "e-Transfer" : c.preferredPayment === "CASH" ? "Cash" : c.preferredPayment], ["Source", c.source.replaceAll("_", " ").toLowerCase()], ["Notes", c.notes]]} />
            </Card>
          )}
          <Card title="Properties">
            <ul className="divide-y divide-line">
              {c.properties.map((p) => (
                <li key={p.id} className="py-3 text-sm">
                  <a className="font-semibold text-blue" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.formatted)}`}>{p.formatted}</a>
                  <div className="text-ink-soft">{p.community?.name ?? "No community (no map pin yet)"}{p.accessNotes && ` · ${p.accessNotes}`}</div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Jobs">
            {jobs.length ? (
              <ul className="divide-y divide-line">
                {jobs.map((j) => (
                  <li key={j.id}><Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-2.5"><span className="font-semibold">#{j.number} {j.title}</span><JobBadge s={j.status} /></Link></li>
                ))}
              </ul>
            ) : <Empty>No jobs yet.</Empty>}
          </Card>
          <Card title="Invoices" actions={<span className="text-sm font-semibold">{money(c.invoices.filter((i) => i.status === "AWAITING_PAYMENT").reduce((a, i) => a + i.totalCents - i.amountPaidCents, 0))} owing</span>}>
            {c.invoices.length ? (
              <ul className="divide-y divide-line">
                {c.invoices.map((i) => (
                  <li key={i.id}><Link href={`/invoices/${i.id}`} className="flex justify-between gap-3 py-2.5 text-sm"><span className="font-semibold">#{i.number} {i.subject}</span><span>{money(i.totalCents)} · {i.status === "PAID" ? "Paid" : i.status === "DRAFT" ? "Draft" : i.status === "BAD_DEBT" ? "Written off" : "Unpaid"}</span></Link></li>
                ))}
              </ul>
            ) : <Empty>No invoices yet.</Empty>}
          </Card>
          <Card title="Requests">
            <ul className="divide-y divide-line">
              {c.requests.map((r) => (
                <li key={r.id}><Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 py-2.5"><span><span className="font-semibold">#{r.number} {r.title}</span><span className="block text-xs text-ink-soft">{prettyDateTime(r.createdAt)}</span></span><RequestBadge s={r.status} /></Link></li>
              ))}
            </ul>
          </Card>
        </div>
        <Timeline notes={notes} events={events} target={{ clientId: c.id }} path={`/clients/${c.id}`} />
      </div>
    </>
  );
}
