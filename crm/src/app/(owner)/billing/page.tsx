// Billing run: everything done but not yet invoiced -> drafts -> review -> send the ticked ones.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Amount } from "@/components/billing/money";
import { StepDot, Steps } from "@/components/billing/steps";
import { Flash } from "@/components/flash";
import { Button, ButtonLink, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { dateOnly, prettyDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { autoPayTrouble } from "@/server/ops/autopay";
import { invoiceCreate, runBilling, sendDrafts } from "../billing-actions";

export const metadata = { title: "Billing" };

export default async function Billing({ searchParams }: PageProps<"/billing">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const [charges, drafts, fixedDone] = await Promise.all([
    db.visitCharge.findMany({
      where: { businessId: bid, invoiceLineItemId: null },
      include: { visit: { include: { job: { include: { client: true } }, snowEvent: true } } }, orderBy: { createdAt: "asc" },
    }),
    db.invoice.findMany({ where: { businessId: bid, status: "DRAFT" }, include: { client: true }, orderBy: { number: "asc" } }),
    // Fixed-price jobs with every visit done and no invoice yet.
    db.job.findMany({
      where: { businessId: bid, billingType: "FIXED_PRICE", kind: { not: "RECURRING" }, closedAt: null, invoices: { none: { status: { not: "VOID" } } }, visits: { some: {}, every: { state: { in: ["COMPLETED", "SKIPPED", "CANCELLED"] } } } },
      include: { client: true },
    }),
  ]);
  const trouble = await autoPayTrouble(bid);
  const byClient = new Map<string, typeof charges>();
  for (const c of charges) byClient.set(c.visit.job.clientId, [...(byClient.get(c.visit.job.clientId) ?? []), c]);
  const unbilled = charges.reduce((a, c) => a + c.totalCents, 0);
  const draftCents = drafts.reduce((a, d) => a + d.totalCents, 0);
  const waiting = byClient.size > 0 || fixedDone.length > 0;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  // The run goes in order: while work is still unbilled, making drafts is the next step; after that, sending is.
  const step1 = waiting ? "now" : "done", step2 = drafts.length ? (waiting ? "later" : "now") : "later";
  const troubleRow = (i: (typeof trouble)[number]) => {
    const stopped = i.autoPayState !== "RETRYING" && i.autoPayState !== "NEEDS_ACTION";
    return (
      <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 last:pb-0">
        <div className="min-w-0 flex-1 basis-64">
          <Link href={`/invoices/${i.id}`} className="font-semibold text-navy hover:text-blue-deep"><span className="tabular-nums">#{i.number}</span> {clientName(i.client)}</Link>
          <p className="max-w-[70ch] text-sm text-amber-950">
            {i.autoPayState === "RETRYING" ? `Card declined${i.autoPayAttempts[0]?.failureCode ? ` (${i.autoPayAttempts[0].failureCode.replaceAll("_", " ")})` : ""}. Next try ${prettyDate(dateOnly(i.autoPayOn))}; the client was emailed.`
              : i.autoPayState === "NEEDS_ACTION" ? "The bank wants the client to approve it. They were emailed a link to pay."
              : "The automatic payment failed and we've stopped trying. Collect this one another way."}
          </p>
        </div>
        <Amount cents={i.totalCents - i.amountPaidCents} className="font-semibold" />
        <ButtonLink href={stopped ? `/invoices/${i.id}#record-payment` : `/invoices/${i.id}`} className="min-h-9 px-3">{stopped ? "Record payment" : "Open invoice"}</ButtonLink>
      </li>
    );
  };
  return (
    <>
      <Flash error={sp.error} />
      {sp.made && <Notice tone="good">{String(sp.made) === "1" ? "1 draft invoice created." : `${String(sp.made)} draft invoices created.`} Review below, then send.</Notice>}
      {sp.sent && <Notice tone="good">{String(sp.sent) === "1" ? "1 invoice sent." : `${String(sp.sent)} invoices sent.`}</Notice>}
      <PageHeader title="Billing run" sub="Turn finished work into invoices: see what is unbilled, review the drafts, then send them."
        actions={<ButtonLink href="/invoices">All invoices</ButtonLink>} />
      <Steps steps={[
        { title: "Unbilled work", state: step1, href: "#unbilled", detail: waiting ? <>{byClient.size > 0 && <>{plural(byClient.size, "client")} · {money(unbilled)}</>}{byClient.size > 0 && fixedDone.length > 0 && " · "}{fixedDone.length > 0 && plural(fixedDone.length, "fixed-price job")}</> : "Nothing waiting" },
        { title: "Review drafts", state: step2, href: "#drafts", detail: drafts.length ? <>{plural(drafts.length, "draft")} · {money(draftCents)}</> : "No drafts yet" },
        { title: "Send", state: step2, href: "#send", detail: drafts.length ? "Emails every ticked draft" : "Nothing to send yet" },
      ]} />

      {trouble.length > 0 && (
        <section aria-labelledby="autopay-trouble" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
          <h2 id="autopay-trouble" className="flex items-center gap-2 font-display text-[0.95rem] font-semibold text-amber-950"><TriangleAlert className="size-4 text-amber-700" strokeWidth={1.75} aria-hidden />Failed auto-payments ({trouble.length})</h2>
          <ul className="mt-2 divide-y divide-amber-200">{trouble.slice(0, 4).map(troubleRow)}</ul>
          {trouble.length > 4 && (
            <details className="border-t border-amber-200 pt-1">
              <summary className="inline-flex min-h-9 items-center text-sm font-semibold text-amber-950">Show {trouble.length - 4} more</summary>
              <ul className="divide-y divide-amber-200">{trouble.slice(4).map(troubleRow)}</ul>
            </details>
          )}
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="scroll-mt-20">
          <div id="unbilled" className="mb-3 flex scroll-mt-20 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold"><StepDot n={1} state={step1} />Unbilled work</h2>
            {byClient.size > 0 && <form action={runBilling}><Button>Create drafts for everyone</Button></form>}
          </div>
          {byClient.size ? (
            <>
              <p className="mb-1 flex items-baseline justify-between gap-3 border-b border-line pb-2 text-xs font-medium text-ink-soft"><span>{plural(byClient.size, "client")} with finished work</span><span>Total <Amount cents={unbilled} className="ml-1 text-sm font-semibold text-navy" /></span></p>
              <ul className="divide-y divide-line-soft">
                {[...byClient.entries()].map(([clientId, list]) => (
                  <li key={clientId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 last:pb-0">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link className="font-semibold text-blue hover:text-blue-deep" href={`/clients/${clientId}`}>{clientName(list[0].visit.job.client)}</Link>
                        <Amount cents={list.reduce((a, c) => a + c.totalCents, 0)} className="font-semibold" />
                      </div>
                      <ul className="mt-0.5 space-y-0.5 text-sm text-ink-soft">
                        {list.map((c) => (
                          <li key={c.id} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0"><span className="tabular-nums">{prettyDate(dateOnly(c.visit.scheduledDate))}</span> · {c.name}{c.visit.snowEvent ? ` (${c.visit.snowEvent.name})` : ""}</span>
                            {list.length > 1 && <Amount cents={c.totalCents} />}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <form action={invoiceCreate}><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="back" value="/billing" /><Button variant="secondary" className="min-h-9 px-3" aria-label={`Create draft for ${clientName(list[0].visit.job.client)}`}>Create draft</Button></form>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty action={<ButtonLink href="/schedule">Open the schedule</ButtonLink>}>Nothing waiting. Charges appear here when visits are marked done.</Empty>}
          {fixedDone.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-1 text-sm font-semibold">Fixed-price jobs ready to invoice</h3>
              <ul className="divide-y divide-line-soft">
                {fixedDone.map((j) => (
                  <li key={j.id}>
                    <form action={invoiceCreate} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                      <input type="hidden" name="jobId" value={j.id} /><input type="hidden" name="fixed" value="1" /><input type="hidden" name="back" value="/billing" />
                      <span className="min-w-0 flex-1 basis-48"><span className="font-medium"><span className="tabular-nums">#{j.number}</span> {j.title}</span><span className="block text-xs text-ink-soft">{clientName(j.client)}</span></span>
                      <Amount cents={j.totalCents ?? 0} className="font-medium" />
                      <Button variant="secondary" className="min-h-9 px-3">Create draft</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="scroll-mt-20">
          <div id="drafts" className="mb-3 flex min-h-10 scroll-mt-20 items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold"><StepDot n={2} state={step2} />Review drafts</h2>
            {drafts.length > 0 && <span className="text-xs font-medium text-ink-soft">{plural(drafts.length, "draft")} · <Amount cents={draftCents} className="text-sm font-semibold text-navy" /></span>}
          </div>
          {drafts.length ? (
            <form id="send-drafts" action={sendDrafts}>
              <input type="hidden" name="back" value="/billing" />
              <p className="border-b border-line pb-2 text-xs text-ink-soft">Every draft is ticked. Untick any you want to hold back; open a draft to edit it first.</p>
              <ul className="divide-y divide-line-soft">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-center gap-3">
                    <label className="-my-px flex min-h-11 w-8 shrink-0 items-center justify-center"><input type="checkbox" name="id" value={d.id} defaultChecked aria-label={`Send invoice #${d.number} to ${clientName(d.client)}`} className="size-5" /></label>
                    <Link href={`/invoices/${d.id}`} className="group flex min-w-0 flex-1 items-baseline justify-between gap-3 py-2.5">
                      <span className="min-w-0"><span className="font-semibold group-hover:text-blue-deep"><span className="tabular-nums">#{d.number}</span> {clientName(d.client)}</span>{d.subject && <span className="block truncate text-sm text-ink-soft">{d.subject}</span>}</span>
                      <Amount cents={d.totalCents} className="font-medium" />
                    </Link>
                  </li>
                ))}
              </ul>
              <div id="send" className="sticky bottom-16 -mx-4 -mb-4 mt-1 flex scroll-mt-20 flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-white px-4 py-3 sm:bottom-0 sm:-mx-5 sm:-mb-5 sm:px-5">
                <span className="flex items-center gap-2 text-sm"><StepDot n={3} state={step2} /><span><span className="font-display text-[0.95rem] font-semibold">Send</span><span className="block text-xs text-ink-soft">Each ticked draft is emailed to its client.</span></span></span>
                <Button variant={waiting && byClient.size > 0 ? "secondary" : "primary"}>Send ticked invoices</Button>
              </div>
            </form>
          ) : <Empty>{waiting ? "No drafts yet. Create drafts from the unbilled work, then review and send them here." : "No drafts. Everything finished has been invoiced."}</Empty>}
        </Card>
      </div>
    </>
  );
}
