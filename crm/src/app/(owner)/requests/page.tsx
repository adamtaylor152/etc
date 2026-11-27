import Link from "next/link";
import type { RequestStatus } from "@/generated/prisma/client";
import { RequestBadge } from "@/components/status";
import { Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Requests" };
const TABS: [string, RequestStatus | null][] = [["New", "NEW"], ["Converted", "CONVERTED"], ["Archived", "ARCHIVED"], ["All", null]];

export default async function Requests({ searchParams }: PageProps<"/requests">) {
  const sp = await searchParams;
  const tab = TABS.find(([l]) => l === sp.tab) ?? TABS[0];
  const bid = await businessId();
  const [rows, counts] = await Promise.all([
    db.request.findMany({
      where: { businessId: bid, ...(tab[1] ? { status: tab[1] } : {}) }, include: { client: true, property: true },
      orderBy: { createdAt: "desc" }, take: 200,
    }),
    db.request.groupBy({ by: ["status"], where: { businessId: bid }, _count: true }),
  ]);
  const n = (s: RequestStatus | null) => (s ? counts.find((c) => c.status === s)?._count ?? 0 : counts.reduce((a, c) => a + c._count, 0));
  return (
    <>
      <PageHeader title="Requests" sub="Everything that came in from the booking form, the phone or the client hub." />
      <Tabs active={tab[0]} items={TABS.map(([l, s]) => ({ href: `/requests?tab=${l}`, label: l, count: n(s) }))} />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="font-semibold">#{r.number} {clientName(r.client)}</span>
                    <span className="block truncate text-sm text-ink-soft">{r.title} · {r.property?.formatted}</span>
                    <span className="block text-xs text-ink-soft">{prettyDateTime(r.createdAt)} · {r.estimateText}</span>
                  </span>
                  <RequestBadge s={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>Nothing here.</Empty>}
      </Card>
    </>
  );
}
