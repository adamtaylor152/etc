import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ListPage, listHref, sortRows } from "@/components/list-page";
import { INVOICE_LABEL, InvoiceBadge } from "@/components/status";
import { invoiceView, type InvoiceView } from "@/server/billing/invoice";
import { addDays, dateOnly, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Invoices" };
const VIEWS: InvoiceView[] = ["DRAFT", "AWAITING_PAYMENT", "PARTIAL", "PAST_DUE", "PAID", "BAD_DEBT", "VOID"];
const DOT: Record<InvoiceView, string> = { DRAFT: "bg-ink-soft/50", AWAITING_PAYMENT: "bg-amber-500", PARTIAL: "bg-amber-500", PAST_DUE: "bg-red-600", PAID: "bg-emerald-600", BAD_DEBT: "bg-ink-soft/40", VOID: "bg-ink-soft/30" };

export default async function Invoices({ searchParams }: PageProps<"/invoices">) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status") ?? one("tab"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const view = VIEWS.find((v) => v === params.status);
  const today = todayLocal();
  const all = (await db.invoice.findMany({ where: { businessId: await businessId() }, include: { client: true }, orderBy: { number: "desc" }, take: 1000 }))
    .map((i) => ({ ...i, view: invoiceView({ ...i, dueOn: dateOnly(i.dueOn) }, today) }));
  const open = (v: InvoiceView) => ["DRAFT", "AWAITING_PAYMENT", "PARTIAL", "PAST_DUE"].includes(v);
  const q = params.q?.trim().toLowerCase();
  const rows = sortRows(all.filter((i) => (view ? i.view === view : params.status === "ALL" || open(i.view)) && (!q || `${i.number} ${i.etransferRef} ${i.subject ?? ""} ${clientName(i.client)}`.toLowerCase().includes(q))),
    params.sort, params.dir, { client: (i) => clientName(i.client).toLowerCase(), number: (i) => i.number, due: (i) => dateOnly(i.dueOn), total: (i) => i.totalCents, balance: (i) => i.totalCents - i.amountPaidCents });
  const since = localDayStart(addDays(today, -30));
  const issued = all.filter((i) => i.issuedOn && i.issuedOn >= since && i.status !== "VOID");
  const paid = all.filter((i) => i.status === "PAID" && i.paidAt && i.issuedOn);
  const avgDays = paid.length ? Math.round(paid.reduce((n, i) => n + (i.paidAt!.getTime() - i.issuedOn!.getTime()) / 86_400_000, 0) / paid.length) : null;
  return (
    <ListPage
      title="Invoices" base="/invoices" params={params} newHref="/invoices/new" newLabel="New invoice" searchPlaceholder="Search invoices, ETC- refs, clients"
      actions={<Link href="/billing" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Billing run</Link>}
      overview={(["PAST_DUE", "AWAITING_PAYMENT", "PARTIAL", "DRAFT", "PAID"] as InvoiceView[]).map((v) => ({ label: INVOICE_LABEL[v], count: all.filter((i) => i.view === v).length, dot: DOT[v], active: view === v, href: listHref("/invoices", params, { status: v }) }))}
      metrics={[
        { label: "Issued", value: money(issued.reduce((n, i) => n + i.totalCents, 0)), sub: `${issued.length} invoices · past 30 days` },
        { label: "Average invoice", value: issued.length ? money(Math.round(issued.reduce((n, i) => n + i.totalCents, 0) / issued.length)) : "—", sub: "past 30 days" },
        { label: "Average time to get paid", value: avgDays != null ? `${avgDays} day${avgDays === 1 ? "" : "s"}` : "—", sub: "from issue to paid" },
      ]}
      filters={[{ name: "status", label: "Status", value: view ?? (params.status === "ALL" ? "ALL" : ""), options: [{ value: "", label: "Unpaid" }, ...VIEWS.map((v) => ({ value: v, label: INVOICE_LABEL[v] })), { value: "ALL", label: "Everything" }] }]}
      columns={[{ key: "client", label: "Client", sortable: true }, { key: "number", label: "Invoice", sortable: true }, { key: "due", label: "Due", sortable: true, className: "hidden sm:table-cell" }, { key: "status", label: "Status" }, { key: "total", label: "Total", sortable: true, align: "right", className: "hidden md:table-cell" }, { key: "balance", label: "Balance", sortable: true, align: "right" }]}
      rows={rows.map((i) => ({
        id: i.id, href: `/invoices/${i.id}`,
        cells: {
          client: clientName(i.client), number: <><span className="font-semibold">#{i.number}</span> <span className="text-ink-soft">{i.subject}</span><span className="block text-xs text-ink-soft">{i.etransferRef}</span></>,
          due: i.dueOn ? prettyDate(dateOnly(i.dueOn)) : <span className="text-ink-soft">not sent</span>, status: <InvoiceBadge s={i.view} />,
          total: money(i.totalCents), balance: <span className={i.totalCents - i.amountPaidCents > 0 && open(i.view) ? "font-semibold" : "text-ink-soft"}>{money(Math.max(0, i.totalCents - i.amountPaidCents))}</span>,
        },
      }))}
      empty="No invoices match."
    />
  );
}
