// Hand the phone to the client: they read the statement, type their name and sign.
import { notFound } from "next/navigation";
import { SignaturePad } from "@/components/signature-pad";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { STATEMENTS } from "@/server/ops/signatures";
import { clientName } from "@/server/queries";
import { signInPerson } from "../../../signature-actions";

export const metadata = { title: "Signature" };

export default async function Sign({ params, searchParams }: PageProps<"/sign/[kind]/[id]">) {
  const { kind, id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  let title = "", sub = "", who = "";
  if (kind === "quote") { const q = await db.quote.findFirst({ where: { id, businessId: bid }, include: { client: true } }); if (!q) notFound(); title = `Quote #${q.number}${q.title ? ` · ${q.title}` : ""}`; sub = `Total ${money(q.totalCents)} (tax included)`; who = clientName(q.client); }
  else if (kind === "invoice") { const i = await db.invoice.findFirst({ where: { id, businessId: bid }, include: { client: true } }); if (!i) notFound(); title = `Invoice #${i.number}${i.subject ? ` · ${i.subject}` : ""}`; sub = `Total ${money(i.totalCents)}`; who = clientName(i.client); }
  else if (kind === "visit") { const v = await db.visit.findFirst({ where: { id, businessId: bid }, include: { job: { include: { client: true } }, property: true } }); if (!v) notFound(); title = v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title; sub = v.property.formatted; who = clientName(v.job.client); }
  else notFound();
  const statement = STATEMENTS[kind === "quote" ? "QUOTE" : kind === "invoice" ? "INVOICE" : "VISIT"];
  return (
    <div className="mx-auto max-w-lg">
      <section className="rounded-lg border border-line bg-white p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Please sign</p>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="text-sm text-ink-soft">{sub}</p>
        {typeof sp.error === "string" && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
        <form action={signInPerson} className="mt-4 space-y-3">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
          <p className="rounded-lg bg-tint p-3 text-sm font-semibold">“{statement}”</p>
          <label className="block text-sm font-semibold">Name<input name="name" required defaultValue={who} autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" /></label>
          <SignaturePad height={200} />
          <button className="min-h-12 w-full rounded-lg bg-blue font-semibold text-white">Save signature</button>
        </form>
      </section>
    </div>
  );
}
