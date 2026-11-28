import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import { DetailHeader } from "@/components/detail-header";
import { Badge } from "@/components/ui";
import { prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { campaignNew } from "../campaign-actions";

export const metadata = { title: "Campaigns" };

export default async function Campaigns() {
  await requireOwner();
  const list = await db.campaign.findMany({ where: { businessId: await businessId() }, include: { recipients: { select: { openedAt: true, clickedAt: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <DetailHeader back={{ href: "/marketing", label: "Marketing" }} title="Campaigns" sub="Email or text your clients. Consent, unsubscribe links and quiet hours are handled for you."
        actions={<form action={campaignNew} className="flex gap-2"><input name="name" placeholder="Campaign name" className="min-h-10 rounded-lg border border-line px-3 text-sm" />
          <button name="channel" value="EMAIL" className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-blue px-3 text-sm font-semibold text-white"><Mail className="size-4" />New email</button>
          <button name="channel" value="SMS" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold"><MessageSquare className="size-4" />New text</button></form>} />
      <section className="rounded-lg border border-line bg-white shadow-card">
        <ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.id}><Link href={`/marketing/campaigns/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-tint">
              {c.channel === "EMAIL" ? <Mail className="size-4 text-blue" /> : <MessageSquare className="size-4 text-indigo-700" />}
              <span className="min-w-0 flex-1"><span className="font-semibold">{c.name}</span><span className="block truncate text-xs text-ink-soft">{c.subject ?? c.smsBody ?? "No content yet"} · {c.sentAt ? `sent ${prettyDateTime(c.sentAt)}` : `created ${prettyDateTime(c.createdAt)}`}</span></span>
              {c.recipients.length > 0 && <span className="text-xs text-ink-soft">{c.recipients.length} sent · {c.recipients.filter((r) => r.openedAt).length} opened · {c.recipients.filter((r) => r.clickedAt).length} clicked</span>}
              <Badge tone={c.status === "SENT" ? "green" : c.status === "DRAFT" ? "gray" : "blue"}>{c.status.toLowerCase()}</Badge>
            </Link></li>
          ))}
          {!list.length && <li className="p-8 text-center text-sm text-ink-soft">No campaigns yet.</li>}
        </ul>
      </section>
    </>
  );
}
