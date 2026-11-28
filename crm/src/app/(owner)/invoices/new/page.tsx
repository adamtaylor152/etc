// New invoice: pick a client, then bill their unbilled work in one click, or build a custom invoice.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPick } from "@/components/client-pick";
import { DetailHeader } from "@/components/detail-header";
import { LineItems } from "@/components/line-items";
import { Field, Input } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { invoiceCreate } from "../../billing-actions";
import { invoiceCustom } from "../../work2-actions";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: PageProps<"/invoices/new">) {
  await requireOwner();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const bid = await businessId();
  if (!s("client")) return <ClientPick businessId={bid} base="/invoices/new" q={s("q")} title="New invoice" />;
  const client = await db.client.findFirst({ where: { id: s("client"), businessId: bid }, include: { properties: { where: { archivedAt: null } }, jobs: { where: { closedAt: null }, orderBy: { number: "desc" } } } });
  if (!client) notFound();
  const [charges, services] = await Promise.all([
    db.visitCharge.findMany({ where: { businessId: bid, invoiceLineItemId: null, visit: { job: { clientId: client.id } } }, include: { visit: { include: { job: true } } } }),
    db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const byJob = new Map<string, { number: number; title: string; cents: number; n: number }>();
  for (const c of charges) {
    const cur = byJob.get(c.visit.jobId) ?? { number: c.visit.job.number, title: c.visit.job.title, cents: 0, n: 0 };
    cur.cents += c.totalCents; cur.n++;
    byJob.set(c.visit.jobId, cur);
  }
  return (
    <>
      <DetailHeader back={{ href: `/clients/${client.id}`, label: clientName(client) }} title="New invoice" sub={<>For {clientName(client)} · <Link href="/invoices/new" className="text-blue">change</Link></>} />
      {s("error") && <p role="alert" className="mb-4 max-w-3xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{s("error")}</p>}
      <div className="max-w-3xl space-y-5">
        <section className="rounded-lg border border-line bg-white p-5 shadow-card">
          <h2 className="text-base font-bold">Work that&apos;s ready to bill</h2>
          {byJob.size ? (
            <>
              <ul className="my-3 divide-y divide-line text-sm">
                {[...byJob.entries()].map(([id, j]) => <li key={id} className="flex justify-between py-2"><Link href={`/jobs/${id}`} className="font-semibold text-blue">Job #{j.number} {j.title}</Link><span>{j.n} charge{j.n === 1 ? "" : "s"} · {money(j.cents)}</span></li>)}
              </ul>
              <form action={invoiceCreate}><input type="hidden" name="clientId" value={client.id} /><button className="inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-sm font-semibold text-white">Create invoice for {money(charges.reduce((n, c) => n + c.totalCents, 0))}</button></form>
            </>
          ) : <p className="mt-1 text-sm text-ink-soft">Nothing unbilled. Completed visits add charges here automatically.</p>}
        </section>
        <form action={invoiceCustom} className="space-y-4 rounded-lg border border-line bg-white p-5 shadow-card">
          <h2 className="text-base font-bold">Custom invoice</h2>
          <input type="hidden" name="clientId" value={client.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subject"><Input name="subject" placeholder="e.g. Fall cleanup" /></Field>
            <Field label="For job (optional)">
              <select name="jobId" className="min-h-10 w-full rounded-lg border border-line bg-white px-3"><option value="">No job</option>{client.jobs.map((j) => <option key={j.id} value={j.id}>Job #{j.number} {j.title}</option>)}</select>
            </Field>
          </div>
          {client.properties.length > 1 && <Field label="Property"><select name="propertyId" className="min-h-10 w-full rounded-lg border border-line bg-white px-3">{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select></Field>}
          <LineItems services={services.map((sv) => ({ id: sv.id, name: sv.name, description: sv.description, unitPriceCents: sv.unitPriceCents }))} />
          <p className="text-xs text-ink-soft">Saves as a draft. Send it, text it, or collect payment from the invoice page.</p>
          <button className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white">Save draft invoice</button>
        </form>
      </div>
    </>
  );
}
