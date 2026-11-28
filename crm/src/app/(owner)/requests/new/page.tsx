// New request by hand: client, property, what they want, optional on-site assessment.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPick } from "@/components/client-pick";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Button, Card, Field, Input, Textarea, inputCls } from "@/components/ui";
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
  const heading = "font-display text-[0.95rem] font-semibold";
  const tick = "flex min-h-9 items-center gap-2 text-sm";
  return (
    <>
      <DetailHeader back={{ href: `/clients/${client.id}`, label: clientName(client) }} title="New request" sub={<>For <span className="font-semibold text-navy">{clientName(client)}</span> · <Link href="/requests/new" className="font-semibold text-blue hover:text-blue-deep">Change client</Link></>} />
      <form action={requestCreate} className="max-w-2xl">
        <input type="hidden" name="clientId" value={client.id} />
        <Flash error={s("error") || undefined} />
        <Card className="space-y-5">
          <section className="space-y-3">
            <h2 className={heading}>What they want</h2>
            {client.properties.length > 0 && <Field label="Property"><select name="propertyId" className={inputCls}>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select></Field>}
            <Field label="Request title"><Input name="title" required placeholder="e.g. Eavestrough cleaning, fall cleanup" /></Field>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Services they asked about</legend>
              <div className="grid gap-x-5 sm:grid-cols-2">{services.filter((sv) => !sv.isAddon).map((sv) => <label key={sv.id} className={tick}><input type="checkbox" name="service" value={sv.bookingLabel ?? sv.name} className="size-4 shrink-0" />{sv.name}</label>)}</div>
            </fieldset>
            <Field label="Details"><Textarea name="details" rows={4} placeholder="What they told you, size of the job, timing…" /></Field>
          </section>
          <fieldset className="space-y-3 border-t border-line-soft pt-5">
            <legend className={`${heading} float-left mb-1 w-full`}>On-site assessment</legend>
            <label className={`${tick} clear-both`}><input type="checkbox" name="assessment" className="size-4 shrink-0" defaultChecked={!!s("date")} />Book a visit to look at the job first</label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input name="assessDate" type="date" defaultValue={s("date")} /></Field>
              <Field label="Time"><Input name="assessTime" type="time" defaultValue="09:00" /></Field>
            </div>
            {people.length > 0 && (
              <div>
                <span className="mb-1 block text-sm font-semibold">Who goes</span>
                <div className="flex flex-wrap gap-x-5">{people.map((p) => <label key={p.id} className={tick}><input type="checkbox" name="userId" value={p.id} className="size-4 shrink-0" /><span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</label>)}</div>
              </div>
            )}
          </fieldset>
          <div className="flex items-center justify-end gap-4 border-t border-line-soft pt-4">
            <Link href={`/clients/${client.id}`} className="inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-semibold text-ink-soft hover:text-navy">Cancel</Link>
            <Button>Save request</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
