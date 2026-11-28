// Edit a job after creation. Sections that would change money already billed are locked (see jobEditLocks) and say why.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { LineItems } from "@/components/line-items";
import { Button, ButtonLink, Card, Field, Input, Textarea, inputCls } from "@/components/ui";
import { DetailHeader } from "@/components/detail-header";
import { Lock } from "lucide-react";
import { requireOwner } from "@/server/auth";
import { businessId, db } from "@/server/db";
import { jobEditFacts } from "@/server/ops/jobs";
import { clientName } from "@/server/queries";
import { jobEditLocks } from "@/server/status/job";
import { jobUpdate } from "../../../work2-actions";

export const metadata = { title: "Edit job" };

export default async function EditJob({ params, searchParams }: PageProps<"/jobs/[id]/edit">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const job = await db.job.findFirst({
    where: { id, businessId: bid },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, client: { include: { properties: { where: { archivedAt: null } } } }, property: true },
  });
  if (!job) notFound();
  const [services, facts, open] = await Promise.all([
    db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } }),
    jobEditFacts(db, job),
    db.visit.count({ where: { jobId: id, state: { in: ["SCHEDULED", "EN_ROUTE"] } } }),
  ]);
  const locks = jobEditLocks({ ...job, ...facts });
  // The job's own property stays in the list even if it has since been archived.
  const properties = job.client.properties.some((p) => p.id === job.propertyId) ? job.client.properties : [job.property, ...job.client.properties];
  // A section that can't be edited any more: what it is now, and quietly why.
  const locked = (label: string, why: string, now?: string) => (
    <div>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {now && <p className="mb-1.5 text-sm">{now}</p>}
      <p className="flex gap-2 rounded-lg bg-tint px-3 py-2.5 text-sm text-ink-soft"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{why}.</span></p>
    </div>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <DetailHeader back={{ href: `/jobs/${job.id}`, label: `Job #${job.number}` }} title={`Edit job #${job.number}`}
        sub={<>For <Link className="font-semibold text-blue hover:text-blue-deep" href={`/clients/${job.clientId}`}>{clientName(job.client)}</Link></>} />
      <Flash error={sp.error} />
      <Card>
        <form action={jobUpdate} className="space-y-5">
          <input type="hidden" name="id" value={job.id} />
          <Field label="Job title"><Input name="title" required maxLength={120} defaultValue={job.title} /></Field>
          <Field label="Instructions for the crew"><Textarea name="instructions" rows={2} maxLength={2000} defaultValue={job.instructions ?? ""} /></Field>
          {locks.property ? locked("Property", locks.property, job.property.formatted) : (
            <Field label="Property" hint={open ? `Changing it moves the ${open} visit${open === 1 ? "" : "s"} still to do. Finished visits stay at the old address.` : undefined}>
              <select name="propertyId" className={inputCls} defaultValue={job.propertyId}>{properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select>
            </Field>
          )}
          <div className="space-y-5 border-t border-line-soft pt-5">
            {locks.lines ? locked("Line items", locks.lines) : (
              <div>
                <LineItems services={services.map((s) => ({ id: s.id, name: s.name, unitPriceCents: s.unitPriceCents }))}
                  label={job.billingType !== "FIXED_PRICE" ? "Line items (charged each visit)" : job.kind === "RECURRING" ? "Line items (their total is the price per month, from the next invoice on)" : "Line items (their total is the fixed price)"}
                  initial={job.lineItems.map((l) => ({ name: l.name, desc: l.description ?? "", qty: String(Number(l.quantity)), price: String(l.unitPriceCents / 100) }))} />
                {facts.hasCharges && <p className="mt-2 text-xs text-ink-soft">Visits already done keep what they were charged. New prices apply to visits done from now on.</p>}
              </div>
            )}
            {job.kind === "ONE_OFF" && !locks.lines && (locks.billing ? locked("Billing", locks.billing) : (
              <Field label="Billing">
                <select name="billingType" className={inputCls} defaultValue={job.billingType}><option value="PER_VISIT">Invoice per visit (charges added when each visit is done)</option><option value="FIXED_PRICE">Fixed price for the whole job (invoice when it&apos;s finished)</option></select>
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line-soft pt-5"><Button>Save changes</Button><ButtonLink href={`/jobs/${job.id}`}>Cancel</ButtonLink></div>
        </form>
      </Card>
    </div>
  );
}
