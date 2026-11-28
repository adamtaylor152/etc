import { ButtonLink } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { clientTagsBulk } from "../client-actions";
import { ListPage, listHref, sortRows } from "@/components/list-page";
import { Badge } from "@/components/ui";
import { addDays, dateOnly, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Clients" };
type Status = "lead" | "active" | "archived";

export default async function Clients({ searchParams }: PageProps<"/clients">) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status"), tag: one("tag"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const bid = await businessId();
  const today = todayLocal();
  const [clients, lastSeen, owing] = await Promise.all([
    db.client.findMany({
      where: { businessId: bid },
      include: {
        properties: { where: { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 1, include: { community: true } },
        _count: { select: { jobs: true, invoices: { where: { status: { notIn: ["DRAFT", "VOID"] } } }, quotes: { where: { status: { in: ["APPROVED", "CONVERTED"] } } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.activityEvent.groupBy({ by: ["clientId"], where: { businessId: bid, clientId: { not: null } }, _max: { at: true } }),
    db.invoice.groupBy({ by: ["clientId"], where: { businessId: bid, status: "AWAITING_PAYMENT" }, _sum: { totalCents: true, amountPaidCents: true } }),
  ]);
  const last = new Map(lastSeen.map((r) => [r.clientId!, r._max.at]));
  const bal = new Map(owing.map((r) => [r.clientId, (r._sum.totalCents ?? 0) - (r._sum.amountPaidCents ?? 0)]));
  const statusOf = (c: (typeof clients)[number]): Status => (c.archivedAt ? "archived" : c._count.jobs || c._count.invoices || c._count.quotes ? "active" : "lead");
  const tags = [...new Set(clients.flatMap((c) => c.tags))].sort();
  const q = params.q?.trim().toLowerCase();
  const digits = q?.replace(/\D/g, "");
  const status = (["lead", "active", "archived"] as const).find((s) => s === params.status);
  const matches = clients.filter((c) => (status ? statusOf(c) === status : statusOf(c) !== "archived")
    && (!params.tag || c.tags.includes(params.tag))
    && (!q || `${clientName(c)} ${c.email} ${c.properties[0]?.formatted ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(q) || (!!digits && digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits))));
  const rows = sortRows(matches, params.sort ?? "name", params.sort ? params.dir : "asc", {
    name: (c) => clientName(c).toLowerCase(), last: (c) => last.get(c.id)?.getTime() ?? null, balance: (c) => bal.get(c.id) ?? 0,
  });
  const since30 = localDayStart(addDays(today, -30));
  const year = today.slice(0, 4);
  const dot = { lead: "bg-blue", active: "bg-emerald-600", archived: "bg-ink-soft/50" };
  return (
    <ListPage
      title="Clients" base="/clients" params={params} newHref="/clients/new" newLabel="New client"
      actions={<><ButtonLink href="/clients/import">Import</ButtonLink><a href="/api/export/clients" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Export</a></>} searchPlaceholder="Search name, phone, email, address, tag"
      overview={(["active", "lead", "archived"] as const).map((s) => ({ label: s === "lead" ? "Leads" : s === "active" ? "Active" : "Archived", count: clients.filter((c) => statusOf(c) === s).length, dot: dot[s], active: status === s, href: listHref("/clients", params, { status: s }) }))}
      metrics={[
        { label: "New leads", value: clients.filter((c) => c.createdAt >= since30 && statusOf(c) === "lead").length, sub: "past 30 days", href: listHref("/clients", {}, { status: "lead" }) },
        { label: "New clients", value: clients.filter((c) => c.createdAt >= since30 && statusOf(c) === "active").length, sub: "past 30 days" },
        { label: `New this year`, value: clients.filter((c) => dateOnly(c.createdAt)!.startsWith(year)).length, sub: `since Jan 1, ${year}` },
      ]}
      filters={[
        { name: "status", label: "Status", value: status ?? "", options: [{ value: "", label: "Leads & active" }, { value: "lead", label: "Leads" }, { value: "active", label: "Active" }, { value: "archived", label: "Archived" }] },
        ...(tags.length ? [{ name: "tag", label: "Tag", value: params.tag ?? "", options: [{ value: "", label: "Any tag" }, ...tags.map((t) => ({ value: t, label: t }))] }] : []),
      ]}
      columns={[
        { key: "name", label: "Name", sortable: true },
        { key: "address", label: "Address", className: "hidden md:table-cell" },
        { key: "tags", label: "Tags", className: "hidden lg:table-cell" },
        { key: "status", label: "Status" },
        { key: "last", label: "Last activity", sortable: true, className: "hidden sm:table-cell" },
        { key: "balance", label: "Balance", sortable: true, align: "right" },
      ]}
      rows={rows.map((c) => {
        const s = statusOf(c);
        const b = bal.get(c.id) ?? 0;
        const l = last.get(c.id);
        return {
          id: c.id, href: `/clients/${c.id}`,
          cells: {
            name: <>{clientName(c)}<span className="block text-xs font-normal text-ink-soft">{c.phone ?? c.email}</span></>,
            address: <>{c.properties[0]?.formatted.split(",")[0] ?? "—"}{c.properties[0]?.community && <span className="block text-xs text-ink-soft">{c.properties[0].community.name}</span>}</>,
            tags: <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>,
            status: <Badge tone={s === "active" ? "green" : s === "lead" ? "blue" : "gray"}>{s === "lead" ? "Lead" : s === "active" ? "Active" : "Archived"}</Badge>,
            last: l ? prettyDate(dateOnly(l)) : <span className="text-ink-soft">—</span>,
            balance: b > 0 ? <span className="font-semibold text-amber-700">{money(b)}</span> : <span className="text-ink-soft">{money(0)}</span>,
          },
        };
      })}
      bulk={{
        action: clientTagsBulk,
        controls: <>
          <select name="mode" className="h-9 rounded-lg border border-line bg-white px-2"><option value="add">Add tag</option><option value="remove">Remove tag</option></select>
          <input name="tag" required placeholder="tag" list="client-tags" className="h-9 w-32 rounded-lg border border-line px-2" />
          <datalist id="client-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          <button className="h-9 rounded-lg bg-navy px-3 font-semibold text-white">Apply</button>
        </>,
      }}
      empty="No clients match."
    />
  );
}
