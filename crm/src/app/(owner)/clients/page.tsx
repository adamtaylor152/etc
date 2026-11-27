import Link from "next/link";
import { Badge, Card, Empty, Input, PageHeader } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Clients" };

export default async function Clients({ searchParams }: PageProps<"/clients">) {
  const q = String((await searchParams).q ?? "").trim().slice(0, 100);
  const bid = await businessId();
  const like = { contains: q, mode: "insensitive" as const };
  const clients = await db.client.findMany({
    where: {
      businessId: bid, archivedAt: null,
      ...(q ? { OR: [{ firstName: like }, { lastName: like }, { companyName: like }, { email: like }, { phone: like }, { properties: { some: { formatted: like } } }] } : {}),
    },
    include: { properties: { where: { archivedAt: null }, include: { community: true } }, _count: { select: { jobs: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 300,
  });
  return (
    <>
      <PageHeader title="Clients" sub={`${clients.length}${clients.length === 300 ? "+" : ""} ${q ? "matching" : "active"}`} />
      <form className="mb-4"><Input name="q" defaultValue={q} placeholder="Search name, email, phone or address" type="search" /></form>
      <Card>
        {clients.length ? (
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="font-semibold">{clientName(c)}</span>
                    <span className="block truncate text-sm text-ink-soft">{c.properties[0]?.formatted ?? c.email}</span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {c.properties[0]?.community && <Badge>{c.properties[0].community.name}</Badge>}
                    <Badge tone={c._count.jobs ? "green" : "blue"}>{c._count.jobs ? "Active" : "Lead"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No clients{q && " match that search"}.</Empty>}
      </Card>
    </>
  );
}
