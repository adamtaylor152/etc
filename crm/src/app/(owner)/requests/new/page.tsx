// New request by hand: client, property, what they want, optional on-site assessment.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPick } from "@/components/client-pick";
import { DetailHeader } from "@/components/detail-header";
import { Field, Input, Textarea } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { team } from "@/server/schedule";
import { requestCreate } from "../../work2-actions";

export const metadata = { title: "New request" };

export default async function NewRequest({ searchParams }: PageProps<"/requests/new">) {
  await requireOwner();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const bid = await businessId();
  if (!s("client")) return <ClientPick businessId={bid} base="/requests/new" keep={s("date") ? { date: s("date") } : {}} q={s("q")} title="New request" />;
  const client = await db.client.findFirst({ where: { id: s("client"), businessId: bid }, include: { properties: { where: { archivedAt: null } } } });
  if (!client) notFound();
  const [services, people] = await Promise.all([db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } }), team(bid)]);
  const sel = "min-h-10 w-full rounded-lg border border-line bg-white px-3";
  return (
    <>
      <DetailHeader back={{ href: `/clients/${client.id}`, label: clientName(client) }} title="New request" sub={<>For {clientName(client)} · <Link href="/requests/new" className="text-blue">change</Link></>} />
      <form action={requestCreate} className="max-w-2xl space-y-4 rounded-lg border border-line bg-white p-5 shadow-card">
        <input type="hidden" name="clientId" value={client.id} />
        {s("error") && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{s("error")}</p>}
        {client.properties.length > 0 && <Field label="Property"><select name="propertyId" className={sel}>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select></Field>}
        <Field label="Request title"><Input name="title" required placeholder="e.g. Eavestrough cleaning, fall cleanup" /></Field>
        <div>
          <span className="mb-1 block text-sm font-semibold">Services they asked about</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">{services.filter((sv) => !sv.isAddon).map((sv) => <label key={sv.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="service" value={sv.bookingLabel ?? sv.name} className="size-4" />{sv.name}</label>)}</div>
        </div>
        <Field label="Details"><Textarea name="details" rows={4} placeholder="What they told you, size of the job, timing…" /></Field>
        <fieldset className="space-y-3 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-bold">On-site assessment</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="assessment" className="size-4" defaultChecked={!!s("date")} />Book a visit to look at the job first</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date"><Input name="assessDate" type="date" defaultValue={s("date")} /></Field>
            <Field label="Time"><Input name="assessTime" type="time" defaultValue="09:00" /></Field>
          </div>
          {people.length > 0 && <div className="flex flex-wrap gap-3">{people.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="userId" value={p.id} className="size-4" /><span className="size-2.5 rounded-full" style={{ background: p.color }} />{p.name}</label>)}</div>}
        </fieldset>
        <button className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white">Save request</button>
      </form>
    </>
  );
}
