import { requireOwner } from "@/server/auth";
import { clientTagsBulk } from "../client-actions";
import { Prisma } from "@/generated/prisma/client";
import { ListPage, listHref, pageOf, sortRows } from "@/components/list-page";
import { Badge, Button, ButtonLink, btn } from "@/components/ui";
import { addDays, dateOnly, fromLocalInput, localDayStart, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { clientName, inOrder, like, nameHas, textHas, words } from "@/server/queries";
import { prettyPhone } from "@/components/phone";

export const metadata = { title: "Clients" };
const ctl = "min-h-10 rounded-lg border border-line bg-white px-3 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-sm";
type Status = "lead" | "active" | "archived";

export default async function Clients({ searchParams }: PageProps<"/clients">) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status"), tag: one("tag"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const bid = await businessId();
  const today = todayLocal();
  // Lead / active / archived as database filters (active = has a job, a real invoice or an approved quote), so the
  // status filter, search and every tile are counts in the database rather than a pass over every client.
  const worked: Prisma.ClientWhereInput = { OR: [{ jobs: { some: {} } }, { invoices: { some: { status: { notIn: ["DRAFT", "VOID"] } } } }, { quotes: { some: { status: { in: ["APPROVED", "CONVERTED"] } } } }] };
  const is: Record<Status, Prisma.ClientWhereInput> = { archived: { archivedAt: { not: null } }, active: { archivedAt: null, ...worked }, lead: { archivedAt: null, NOT: worked } };
  const status = (["lead", "active", "archived"] as const).find((s) => s === params.status);
  const ws = words(params.q);
  // Tags (an array) and phone digits can't be searched with Prisma's filters: one small id query per word.
  const byTagOrPhone = await Promise.all(ws.map((w) => {
    const digits = w.replace(/\D/g, "");
    return db.$queryRaw<{ id: string }[]>`SELECT id FROM "Client" WHERE "businessId" = ${bid} AND (array_to_string(tags, ' ') ILIKE ${like(w)}
      ${digits.length >= 3 ? Prisma.sql`OR regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}` : Prisma.empty})`;
  }));
  const where: Prisma.ClientWhereInput = {
    businessId: bid, ...(params.tag ? { tags: { has: params.tag } } : {}),
    AND: [status ? is[status] : { archivedAt: null }, ...ws.map((w, i) => ({ OR: [nameHas(w), { email: textHas(w) }, { properties: { some: { archivedAt: null, formatted: textHas(w) } } }, { id: { in: byTagOrPhone[i].map((r) => r.id) } }] }))],
  };
  const since30 = localDayStart(addDays(today, -30));
  const year = today.slice(0, 4);
  const count = (w: Prisma.ClientWhereInput) => db.client.count({ where: { businessId: bid, ...w } });
  // Last activity and balance are sums over other tables: for those two sorts they're read for everyone, otherwise for the page shown.
  const facts = (ids?: string[]) => Promise.all([
    db.activityEvent.groupBy({ by: ["clientId"], where: { businessId: bid, clientId: ids ? { in: ids } : { not: null } }, _max: { at: true } }),
    db.invoice.groupBy({ by: ["clientId"], where: { businessId: bid, status: "AWAITING_PAYMENT", ...(ids ? { clientId: { in: ids } } : {}) }, _sum: { totalCents: true, amountPaidCents: true } }),
  ]);
  const wide = params.sort === "last" || params.sort === "balance";
  const [matches, tagRows, counts, newLeads, newClients, newThisYear, early] = await Promise.all([
    db.client.findMany({ where, select: { id: true, firstName: true, lastName: true, companyName: true }, orderBy: { createdAt: "desc" } }), // names only: sorted here, then one page is loaded
    db.$queryRaw<{ t: string }[]>`SELECT DISTINCT unnest(tags) AS t FROM "Client" WHERE "businessId" = ${bid} ORDER BY 1`,
    Promise.all((["active", "lead", "archived"] as const).map((s) => count(is[s]))),
    count({ ...is.lead, createdAt: { gte: since30 } }),
    count({ ...is.active, createdAt: { gte: since30 } }),
    count({ createdAt: { gte: fromLocalInput(`${year}-01-01T00:00`)! } }),
    wide ? facts() : null,
  ]);
  const tags = tagRows.map((r) => r.t);
  const at = pageOf(one("page"), matches.length);
  const maps = ([lastSeen, owing]: Awaited<ReturnType<typeof facts>>) => ({
    last: new Map(lastSeen.map((r) => [r.clientId!, r._max.at])),
    bal: new Map(owing.map((r) => [r.clientId, (r._sum.totalCents ?? 0) - (r._sum.amountPaidCents ?? 0)])),
  });
  const pre = early && maps(early);
  const ids = sortRows(matches, params.sort ?? "name", params.sort ? params.dir : "asc", {
    name: (c) => clientName(c).toLowerCase(), last: (c) => pre?.last.get(c.id)?.getTime() ?? null, balance: (c) => pre?.bal.get(c.id) ?? 0,
  }).slice(at.skip, at.skip + at.take).map((c) => c.id);
  const [page, { last, bal }] = await Promise.all([
    db.client.findMany({
      where: { id: { in: ids } },
      include: {
        properties: { where: { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 1, include: { community: true } },
        _count: { select: { jobs: true, invoices: { where: { status: { notIn: ["DRAFT", "VOID"] } } }, quotes: { where: { status: { in: ["APPROVED", "CONVERTED"] } } } } },
      },
    }),
    pre ?? facts(ids).then(maps),
  ]);
  const rows = inOrder(ids, page);
  const statusOf = (c: (typeof page)[number]): Status => (c.archivedAt ? "archived" : c._count.jobs || c._count.invoices || c._count.quotes ? "active" : "lead");
  const dot = { lead: "bg-blue", active: "bg-emerald-600", archived: "bg-ink-soft/50" };
  return (
    <ListPage
      title="Clients" base="/clients" params={params} at={at} newHref="/clients/new" newLabel="New client"
      actions={<><ButtonLink href="/clients/import">Import</ButtonLink><a href="/api/export/clients" className={btn("secondary")}>Export</a></>} searchPlaceholder="Search name, phone, email, address, tag"
      overview={(["active", "lead", "archived"] as const).map((s, n) => ({ label: s === "lead" ? "Leads" : s === "active" ? "Active" : "Archived", count: counts[n], dot: dot[s], active: status === s, href: listHref("/clients", params, { status: s }) }))}
      metrics={[
        { label: "New leads", value: newLeads, sub: "past 30 days", href: listHref("/clients", {}, { status: "lead" }) },
        { label: "New clients", value: newClients, sub: "past 30 days" },
        { label: `New this year`, value: newThisYear, sub: `since Jan 1, ${year}` },
      ]}
      filters={[
        { name: "status", label: "Status", value: status ?? "", options: [{ value: "", label: "Leads & active" }, { value: "lead", label: "Leads" }, { value: "active", label: "Active" }, { value: "archived", label: "Archived" }] },
        ...(tags.length ? [{ name: "tag", label: "Tag", value: params.tag ?? "", options: [{ value: "", label: "Any tag" }, ...tags.map((t) => ({ value: t, label: t }))] }] : []),
      ]}
      columns={[
        { key: "name", label: "Name", sortable: true, className: "max-sm:row-span-2" },
        { key: "address", label: "Address", className: "hidden md:table-cell" },
        { key: "tags", label: "Tags", className: "hidden lg:table-cell" },
        { key: "status", label: "Status" },
        { key: "last", label: "Last activity", sortable: true, align: "right", className: "hidden sm:table-cell" },
        { key: "balance", label: "Balance", sortable: true, align: "right" },
      ]}
      rows={rows.map((c) => {
        const s = statusOf(c);
        const b = bal.get(c.id) ?? 0;
        const l = last.get(c.id);
        return {
          id: c.id, href: `/clients/${c.id}`,
          cells: {
            name: <>{clientName(c)}<span className="block truncate text-[13px] font-normal text-ink-soft sm:text-xs">{c.phone ? prettyPhone(c.phone) : c.email}</span></>,
            address: <>{c.properties[0]?.formatted.split(",")[0] ?? <span className="text-ink-faint">—</span>}{c.properties[0]?.community && <span className="block text-xs text-ink-soft">{c.properties[0].community.name}</span>}</>,
            tags: <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>,
            status: <Badge tone={s === "active" ? "green" : s === "lead" ? "blue" : "gray"}>{s === "lead" ? "Lead" : s === "active" ? "Active" : "Archived"}</Badge>,
            last: l ? <span className="text-ink-soft">{prettyDate(dateOnly(l))}</span> : <span className="text-ink-faint">—</span>,
            balance: b > 0 ? <span className="font-semibold text-amber-800" title="Owing on sent invoices">{cad(b)}</span> : <span className="text-ink-faint">{cad(0)}</span>,
          },
        };
      })}
      bulk={{
        action: clientTagsBulk,
        controls: <>
          <select name="mode" aria-label="What to do with the tag" className={ctl}><option value="add">Add tag</option><option value="remove">Remove tag</option></select>
          <input name="tag" required placeholder="Tag" aria-label="Tag" list="client-tags" className={`${ctl} w-36 min-w-0 max-sm:flex-1`} />
          <datalist id="client-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          <Button variant="secondary">Apply to ticked</Button>
        </>,
      }}
      empty="No clients match."
    />
  );
}
