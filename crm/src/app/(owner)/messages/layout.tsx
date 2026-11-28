// Messages: conversation list on the left, the open thread on the right (one at a time on phones).
import { requireOwner } from "@/server/auth";
import { Prisma } from "@/generated/prisma/client";
import { Inbox, type Convo } from "@/components/messages/inbox";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Messages" };

export default async function MessagesLayout({ children }: LayoutProps<"/messages">) {
  await requireOwner();
  const bid = await businessId();
  // One row per conversation (its newest text) and its unread count, straight from the database: the list is whole
  // however long the history gets. A conversation is a client, or a number we don't know yet.
  const convo = Prisma.sql`coalesce("clientId", CASE WHEN direction = 'IN' THEN "from" ELSE "to" END)`;
  const [latest, unread] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`SELECT DISTINCT ON (${convo}) id FROM "TextMessage" WHERE "businessId" = ${bid} ORDER BY ${convo}, "createdAt" DESC`,
    db.$queryRaw<{ k: string; n: number }[]>`SELECT ${convo} AS k, count(*)::int AS n FROM "TextMessage" WHERE "businessId" = ${bid} AND direction = 'IN' AND "readAt" IS NULL GROUP BY 1`,
  ]);
  const unreadBy = new Map(unread.map((r) => [r.k, r.n]));
  const texts = await db.textMessage.findMany({
    where: { id: { in: latest.map((r) => r.id) } }, orderBy: { createdAt: "desc" },
    select: { clientId: true, direction: true, from: true, to: true, body: true, status: true, createdAt: true, mediaPending: true, client: true, _count: { select: { media: true } } },
  });
  const convos = texts.map((t): Convo => {
    const other = t.direction === "IN" ? t.from : t.to;
    const photos = t._count.media || (Array.isArray(t.mediaPending) ? t.mediaPending.length : 0);
    return {
      key: t.clientId ?? `n${other.replace("+", "")}`, name: t.client ? clientName(t.client) : other.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3"), number: other.replace(/\D/g, ""), known: !!t.client,
      preview: t.body || (photos ? (photos > 1 ? `${photos} photos` : "Photo") : ""), mine: t.direction === "OUT", at: t.createdAt.toISOString(), unread: unreadBy.get(t.clientId ?? other) ?? 0, failed: t.status === "failed",
    };
  });
  return (
    // Fills the screen between the top bar and (on phones) the bottom bar, so the list and the thread scroll inside it.
    <div className="-mb-10 grid h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] gap-4 sm:-mb-16 sm:h-[calc(100dvh-7.5rem)] md:grid-cols-[minmax(260px,340px)_1fr] lg:mb-0 lg:h-[calc(100dvh-8rem)]">
      <Inbox convos={convos} />
      {children}
    </div>
  );
}
