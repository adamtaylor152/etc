import Link from "next/link";
import type { QuoteStatus } from "@/generated/prisma/client";
import { QUOTE } from "@/components/status";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { dateOnly, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { quoteExpired } from "@/server/status/quote";

export const metadata = { title: "Quotes" };
const TABS: (QuoteStatus | "ALL")[] = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED", "ARCHIVED", "ALL"];

export default async function Quotes({ searchParams }: PageProps<"/quotes">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "AWAITING_RESPONSE";
  const all = await db.quote.findMany({ where: { businessId: await businessId() }, include: { client: true }, orderBy: { number: "desc" }, take: 500 });
  const rows = all.filter((q) => tab === "ALL" || q.status === tab);
  const today = todayLocal();
  const sent = all.filter((q) => q.sentAt).length;
  const won = all.filter((q) => q.status === "APPROVED" || q.status === "CONVERTED").length;
  return (
    <>
      <PageHeader title="Quotes" sub={sent ? `${Math.round((100 * won) / sent)}% of sent quotes approved` : "Send quotes from a request or a client"} />
      <Tabs active={tab === "ALL" ? "All" : QUOTE[tab][0]} items={TABS.map((t) => ({ href: `/quotes?tab=${t}`, label: t === "ALL" ? "All" : QUOTE[t][0], count: all.filter((q) => t === "ALL" || q.status === t).length }))} />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((q) => (
              <li key={q.id}>
                <Link href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0"><span className="font-semibold">#{q.number} {clientName(q.client)}</span>
                    <span className="block truncate text-sm text-ink-soft">{q.title} · {q.sentAt ? `sent ${prettyDateTime(q.sentAt)}` : `created ${prettyDateTime(q.createdAt)}`}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold">{money(q.totalCents)}</span>
                    {quoteExpired({ status: q.status, validUntil: dateOnly(q.validUntil) }, today) ? <Badge tone="red">Expired</Badge> : <Badge tone={QUOTE[q.status][1]}>{QUOTE[q.status][0]}</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No quotes here.</Empty>}
      </Card>
    </>
  );
}
