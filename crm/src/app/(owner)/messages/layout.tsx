// Messages: conversation list on the left, the open thread on the right (one at a time on phones).
import { requireOwner } from "@/server/auth";
import { Inbox, type Convo } from "@/components/messages/inbox";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Messages" };

export default async function MessagesLayout({ children }: LayoutProps<"/messages">) {
  await requireOwner();
  const bid = await businessId();
  // ponytail: newest 3000 texts grouped in JS; a DISTINCT ON query if the history ever gets huge.
  const texts = await db.textMessage.findMany({
    where: { businessId: bid }, orderBy: { createdAt: "desc" }, take: 3000,
    select: { clientId: true, direction: true, from: true, to: true, body: true, status: true, readAt: true, createdAt: true, mediaPending: true, client: true, _count: { select: { media: true } } },
  });
  const convos = new Map<string, Convo>();
  for (const t of texts) {
    const other = t.direction === "IN" ? t.from : t.to;
    const key = t.clientId ?? `n${other.replace("+", "")}`;
    let c = convos.get(key);
    if (!c) {
      const photos = t._count.media || (Array.isArray(t.mediaPending) ? t.mediaPending.length : 0);
      c = {
        key, name: t.client ? clientName(t.client) : other.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3"), number: other.replace(/\D/g, ""), known: !!t.client,
        preview: t.body || (photos ? `📷 ${photos > 1 ? `${photos} photos` : "Photo"}` : ""), mine: t.direction === "OUT", at: t.createdAt.toISOString(), unread: 0, failed: t.status === "failed",
      };
      convos.set(key, c);
    }
    if (t.direction === "IN" && !t.readAt) c.unread++;
  }
  return (
    <div className="grid h-[calc(100dvh-10.5rem)] gap-4 sm:h-[calc(100dvh-7.5rem)] md:grid-cols-[minmax(260px,340px)_1fr]">
      <Inbox convos={[...convos.values()]} />
      {children}
    </div>
  );
}
