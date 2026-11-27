// One conversation. Opening it marks the client's texts as read.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { Button, Card, PageHeader } from "@/components/ui";
import { prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { smsEnabled, toE164 } from "@/server/sms";
import { textSend } from "../../text-actions";

export default async function Thread({ params, searchParams }: PageProps<"/messages/[key]">) {
  const { key } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const unknown = key.startsWith("n");
  const number = unknown ? `+${key.slice(1)}` : null;
  const client = unknown ? null : await db.client.findFirst({ where: { id: key, businessId: bid } });
  if (!unknown && !client) notFound();
  const phone = client ? toE164(client.phone) : number;
  const where = client ? { businessId: bid, clientId: client.id } : { businessId: bid, clientId: null, OR: [{ from: number! }, { to: number! }] };
  const texts = await db.textMessage.findMany({ where, orderBy: { createdAt: "asc" }, take: 500 });
  await db.textMessage.updateMany({ where: { ...where, direction: "IN", readAt: null }, data: { readAt: new Date() } });
  return (
    <div className="mx-auto max-w-2xl">
      <Flash error={sp.error} />
      <PageHeader title={client ? clientName(client) : number} sub={<>{phone ?? "No mobile number on file"}{client && <> · <Link className="text-blue" href={`/clients/${client.id}`}>client page</Link></>}{client?.smsOptOutAt && " · texted STOP"}</>} />
      <Card>
        <ol className="space-y-2">
          {texts.map((t) => (
            <li key={t.id} className={`flex ${t.direction === "OUT" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${t.direction === "OUT" ? "bg-blue text-white" : "bg-tint"}`}>
                <p className="whitespace-pre-line">{t.body}</p>
                <p className={`mt-1 text-[11px] ${t.direction === "OUT" ? "text-white/70" : "text-ink-soft"}`}>{prettyDateTime(t.createdAt)}{t.direction === "OUT" && ` · ${t.status}`}{t.error && ` · ${t.error}`}</p>
              </div>
            </li>
          ))}
          {!texts.length && <li className="text-center text-sm text-ink-soft">No texts yet.</li>}
        </ol>
        {phone && smsEnabled() && !client?.smsOptOutAt && (
          <form action={textSend} className="mt-4 flex gap-2">
            <input type="hidden" name="key" value={key} />
            <textarea name="body" rows={2} required maxLength={1000} placeholder="Type a text…" className="min-h-11 flex-1 rounded-xl border border-line px-3 py-2" />
            <Button>Send</Button>
          </form>
        )}
        {!smsEnabled() && <p className="mt-4 text-sm text-ink-soft">Texting turns on once TELNYX_API_KEY is set in Coolify.</p>}
      </Card>
    </div>
  );
}
