// Text inbox: one row per conversation (client, or an unknown number), newest first, unread in bold.
import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { smsEnabled } from "@/server/sms";

export const metadata = { title: "Messages" };

export default async function Messages() {
  const bid = await businessId();
  const texts = await db.textMessage.findMany({ where: { businessId: bid }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  const convos = new Map<string, { key: string; name: string; last: (typeof texts)[number]; unread: number }>();
  for (const t of texts) {
    const other = t.direction === "IN" ? t.from : t.to;
    const key = t.clientId ?? `n${other.replace("+", "")}`;
    const c = convos.get(key) ?? { key, name: t.client ? clientName(t.client) : other, last: t, unread: 0 };
    if (t.direction === "IN" && !t.readAt) c.unread++;
    convos.set(key, c);
  }
  return (
    <>
      <PageHeader title="Messages" sub={smsEnabled() ? "Texts with clients from 403-656-8200" : "Texting is off until the Telnyx key is added in Coolify"} />
      <Card>
        {convos.size ? (
          <ul className="divide-y divide-line">
            {[...convos.values()].map((c) => (
              <li key={c.key}>
                <Link href={`/messages/${c.key}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className={c.unread ? "font-bold" : "font-semibold"}>{c.name}</span>
                    <span className="block truncate text-sm text-ink-soft">{c.last.direction === "OUT" ? "You: " : ""}{c.last.body}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-ink-soft">{prettyDateTime(c.last.createdAt)}{c.unread > 0 && <Badge tone="blue">{c.unread} new</Badge>}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No texts yet. Start one from a client&apos;s page.</Empty>}
      </Card>
    </>
  );
}
