// Hand the phone to the client: they read the statement, type their name and sign.
import { requireOwner } from "@/server/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Flash } from "@/components/flash";
import { SignaturePad } from "@/components/signature-pad";
import { Card, Field, Input, btn } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { STATEMENTS } from "@/server/ops/signatures";
import { clientName } from "@/server/queries";
import { signInPerson } from "../../../signature-actions";

export const metadata = { title: "Signature" };

export default async function Sign({ params, searchParams }: PageProps<"/sign/[kind]/[id]">) {
  await requireOwner();
  const { kind, id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  let title = "", sub = "", who = "";
  if (kind === "quote") { const q = await db.quote.findFirst({ where: { id, businessId: bid }, include: { client: true } }); if (!q) notFound(); title = `Quote #${q.number}${q.title ? ` · ${q.title}` : ""}`; sub = `Total ${cad(q.totalCents)} (tax included)`; who = clientName(q.client); }
  else if (kind === "invoice") { const i = await db.invoice.findFirst({ where: { id, businessId: bid }, include: { client: true } }); if (!i) notFound(); title = `Invoice #${i.number}${i.subject ? ` · ${i.subject}` : ""}`; sub = `Total ${cad(i.totalCents)}`; who = clientName(i.client); }
  else if (kind === "visit") { const v = await db.visit.findFirst({ where: { id, businessId: bid }, include: { job: { include: { client: true } }, property: true } }); if (!v) notFound(); title = v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title; sub = v.property.formatted; who = clientName(v.job.client); }
  else notFound();
  const statement = STATEMENTS[kind === "quote" ? "QUOTE" : kind === "invoice" ? "INVOICE" : "VISIT"];
  const backHref = kind === "quote" ? `/quotes/${id}` : kind === "invoice" ? `/invoices/${id}` : `/visits/${id}`;
  return (
    <div className="mx-auto max-w-lg">
      <Link href={backHref} className="no-print -ml-1 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-ink-soft hover:text-navy"><ChevronLeft className="size-4" aria-hidden />Back without signing</Link>
      <Card>
        <p className="text-sm font-medium text-ink-soft">Please sign</p>
        <h1 className="mt-0.5 font-display text-[1.7rem] font-semibold leading-tight [overflow-wrap:anywhere]">{title}</h1>
        <p className="mt-1 text-base tabular-nums text-ink-soft">{sub}</p>
        <div className="mt-4"><Flash error={sp.error} /></div>
        <form action={signInPerson} className="space-y-4">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
          <p className="max-w-[70ch] rounded-lg bg-tint p-4 text-base leading-relaxed">“{statement}”</p>
          <Field label="Name"><Input name="name" required defaultValue={who} autoComplete="off" className="min-h-12" /></Field>
          <div>
            <span className="mb-1 block text-sm font-semibold">Signature</span>
            <SignaturePad height={240} />
          </div>
          <button className={btn("primary", "min-h-14! w-full text-base!")}>Save signature</button>
        </form>
      </Card>
    </div>
  );
}
