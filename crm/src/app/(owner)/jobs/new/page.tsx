// New job or every-snowfall plan for an existing client (/jobs/new?client=...&kind=plan).
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Field, Input, PageHeader, Textarea, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { RepeatFields } from "@/components/repeat-fields";
import { todayLocal } from "@/server/dates";
import { jobCreate, planCreate, recurringCreate } from "../../work-actions";

export const metadata = { title: "New job" };

export default async function NewJob({ searchParams }: PageProps<"/jobs/new">) {
  const sp = await searchParams;
  const bid = await businessId();
  const client = await db.client.findFirst({ where: { id: String(sp.client ?? ""), businessId: bid }, include: { properties: { where: { archivedAt: null } } } });
  if (!client) notFound();
  const plan = sp.kind === "plan";
  const recurring = sp.kind === "recurring";
  const services = await db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } });
  const propertyPick = (
    <Field label="Property">
      <select name="propertyId" className={inputCls} required>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select>
    </Field>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={plan ? "New every-snowfall plan" : recurring ? "New recurring job" : "New job"} sub={<>For <Link className="font-semibold text-blue" href={`/clients/${client.id}`}>{clientName(client)}</Link></>} />
      {plan ? (
        <Card>
          <form action={planCreate} className="space-y-4">
            <input type="hidden" name="clientId" value={client.id} />
            {propertyPick}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Trigger (cm)" hint="Blank = season default"><Input name="triggerCm" type="number" min={0} max={100} /></Field>
              <Field label="Per push ($)"><Input name="price" type="number" step="0.01" defaultValue={30} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold"><input type="checkbox" name="iceMelt" className="size-5" /> Ice melt (+$5)</label>
            </div>
            <Button>Create plan</Button>
          </form>
        </Card>
      ) : recurring ? (
        <Card>
          <form action={recurringCreate} className="space-y-4">
            <input type="hidden" name="clientId" value={client.id} />
            {propertyPick}
            <Field label="Title"><Input name="title" required placeholder="e.g. Bin cleaning" list="service-names" /></Field>
            <datalist id="service-names">{services.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            <div>
              <span className="mb-1 block text-sm font-semibold">Each visit (prices include tax)</span>
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                    <Input name="lineName" placeholder={i === 0 ? "What" : "More (optional)"} required={i === 0} list="service-names" />
                    <Input name="lineQty" type="number" step="0.25" min={0.25} defaultValue={1} aria-label="Quantity" />
                    <Input name="linePrice" type="number" step="0.01" min={0} placeholder="$" aria-label="Price" />
                  </div>
                ))}
              </div>
            </div>
            <RepeatFields startsOn={todayLocal()} />
            <Field label="Instructions for the crew"><Textarea name="instructions" rows={2} /></Field>
            <Button>Create recurring job</Button>
          </form>
        </Card>
      ) : (
        <Card>
          <form action={jobCreate} className="space-y-4">
            <input type="hidden" name="clientId" value={client.id} />
            {propertyPick}
            <Field label="Title"><Input name="title" required placeholder="e.g. Window cleaning" list="service-names" /></Field>
            <datalist id="service-names">{services.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            <div>
              <span className="mb-1 block text-sm font-semibold">Line items (prices include tax)</span>
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                    <Input name="lineName" placeholder={i === 0 ? "What" : "More (optional)"} required={i === 0} list="service-names" />
                    <Input name="lineQty" type="number" step="0.25" min={0.25} defaultValue={1} aria-label="Quantity" />
                    <Input name="linePrice" type="number" step="0.01" min={0} placeholder="$" aria-label="Price" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First visit" hint="Blank = schedule later"><Input name="date" type="date" /></Field>
              <Field label="Billing">
                <select name="billingType" className={inputCls}><option value="PER_VISIT">Per visit</option><option value="FIXED_PRICE">Fixed price for the job</option></select>
              </Field>
            </div>
            <Field label="Instructions for the crew"><Textarea name="instructions" rows={2} /></Field>
            <Button>Create job</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
