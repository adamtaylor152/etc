import { requireOwner } from "@/server/auth";
import { Amount } from "@/components/billing/money";
import { ButtonLink } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { ListPage, listHref, pageOf, sortRows } from "@/components/list-page";
import { INVOICE_LABEL, InvoiceBadge } from "@/components/status";
import { invoiceView, type InvoiceView } from "@/server/billing/invoice";
import { addDays, dateOnly, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { byClient, clientName, inOrder, invoiceViewWhere, nameHas, numberIs, textHas, words } from "@/server/queries";

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
  const bid = await businessId();
  const open = (v: InvoiceView) => ["DRAFT", "AWAITING_PAYMENT", "PARTIAL", "PAST_DUE"].includes(v);
  // Search, filter, sort and paging happen in the database (PAST_DUE and PARTIAL as filters: invoiceViewWhere); the tiles
  // count every invoice, not just this page.
  const where: Prisma.InvoiceWhereInput = {
    businessId: bid,
    AND: [
      view ? invoiceViewWhere(view, today) : params.status === "ALL" ? {} : { status: { in: ["DRAFT", "AWAITING_PAYMENT"] } },
      ...words(params.q).map((w) => ({ OR: [...numberIs(w), { etransferRef: textHas(w) }, { subject: textHas(w) }, { client: nameHas(w) }] })),
    ],
  };
  const dir = params.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = params.sort === "client" ? [...byClient(dir), { number: "desc" }]
    : params.sort === "due" ? [{ dueOn: { sort: dir, nulls: "last" } }, { number: "desc" }] : params.sort === "total" ? [{ totalCents: dir }, { number: "desc" }]
    : [{ number: params.sort === "number" ? dir : "desc" }];
  const since = localDayStart(addDays(today, -30));
  const tiles = ["PAST_DUE", "AWAITING_PAYMENT", "PARTIAL", "DRAFT", "PAID"] as InvoiceView[];
  const [total, counts, issued, [{ days: avg }]] = await Promise.all([
    db.invoice.count({ where }),
    Promise.all(tiles.map((v) => db.invoice.count({ where: { businessId: bid, ...invoiceViewWhere(v, today) } }))),
    db.invoice.aggregate({ where: { businessId: bid, issuedOn: { gte: since }, status: { not: "VOID" } }, _count: { _all: true }, _sum: { totalCents: true } }),
    db.$queryRaw<{ days: number | null }[]>`SELECT avg(extract(epoch FROM "paidAt" - "issuedOn"))::float8 / 86400 AS days FROM "Invoice" WHERE "businessId" = ${bid} AND status = 'PAID' AND "paidAt" IS NOT NULL AND "issuedOn" IS NOT NULL`,
  ]);
  const at = pageOf(one("page"), total);
  // Balance (total less paid) isn't a column: sort the matches' two numbers, then load just this page.
  const ids = params.sort === "balance"
    ? sortRows(await db.invoice.findMany({ where, select: { id: true, totalCents: true, amountPaidCents: true }, orderBy: { number: "desc" } }), "balance", dir, { balance: (i) => i.totalCents - i.amountPaidCents }).slice(at.skip, at.skip + at.take).map((i) => i.id)
    : null;
  const found = await db.invoice.findMany({ where: ids ? { id: { in: ids } } : where, include: { client: true }, ...(ids ? {} : { orderBy, skip: at.skip, take: at.take }) });
  const rows = (ids ? inOrder(ids, found) : found).map((i) => ({ ...i, view: invoiceView({ ...i, dueOn: dateOnly(i.dueOn) }, today) }));
  const issuedCents = issued._sum.totalCents ?? 0;
  const avgDays = avg == null ? null : Math.round(avg);
  return (
    <ListPage
      title="Invoices" base="/invoices" params={params} at={at} newHref="/invoices/new" newLabel="New invoice" searchPlaceholder="Search invoices, ETC- refs, clients"
      actions={<ButtonLink href="/billing">Billing run</ButtonLink>}
      overview={tiles.map((v, n) => ({ label: INVOICE_LABEL[v], count: counts[n], dot: DOT[v], active: view === v, href: listHref("/invoices", params, { status: v }) }))}
      metrics={[
        { label: "Issued", value: cad(issuedCents), sub: `${issued._count._all.toLocaleString("en-CA")} invoice${issued._count._all === 1 ? "" : "s"} · past 30 days` },
        { label: "Average invoice", value: issued._count._all ? cad(Math.round(issuedCents / issued._count._all)) : "—", sub: "past 30 days" },
        { label: "Average time to get paid", value: avgDays != null ? `${avgDays} day${avgDays === 1 ? "" : "s"}` : "—", sub: "from issue to paid" },
      ]}
      filters={[{ name: "status", label: "Status", value: view ?? (params.status === "ALL" ? "ALL" : ""), options: [{ value: "", label: "Unpaid" }, ...VIEWS.map((v) => ({ value: v, label: INVOICE_LABEL[v] })), { value: "ALL", label: "Everything" }] }]}
      columns={[{ key: "client", label: "Client", sortable: true }, { key: "number", label: "Invoice", sortable: true }, { key: "due", label: "Due", sortable: true, className: "hidden sm:table-cell" }, { key: "status", label: "Status" }, { key: "total", label: "Total", sortable: true, align: "right", className: "hidden md:table-cell" }, { key: "balance", label: "Balance", sortable: true, align: "right" }]}
      rows={rows.map((i) => ({
        id: i.id, href: `/invoices/${i.id}`,
        cells: {
          client: clientName(i.client), number: <><span className="font-semibold tabular-nums">#{i.number}</span>{i.subject && <span className="text-ink-soft"> {i.subject}</span>}<span className="block text-xs text-ink-soft">{i.etransferRef}</span></>,
          due: i.dueOn ? <span className={`whitespace-nowrap tabular-nums ${i.view === "PAST_DUE" ? "font-medium text-red-700" : ""}`}>{prettyDate(dateOnly(i.dueOn))}</span> : <span className="text-ink-soft">Not sent</span>, status: <InvoiceBadge s={i.view} />,
          total: <Amount cents={i.totalCents} className="text-ink-soft" />,
          balance: <Amount cents={Math.max(0, i.totalCents - i.amountPaidCents)} className={i.totalCents - i.amountPaidCents > 0 && open(i.view) ? (i.view === "PAST_DUE" ? "font-semibold text-red-700" : "font-semibold") : "text-ink-soft"} />,
        },
      }))}
      empty="No invoices match."
    />
  );
}
