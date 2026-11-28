import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import { DetailHeader } from "@/components/detail-header";
import { CampaignBadge } from "@/components/marketing/campaign-status";
import { Button, Card, Empty, Input } from "@/components/ui";
import { prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { campaignNew } from "../campaign-actions";

export const metadata = { title: "Campaigns" };

export default async function Campaigns() {
  await requireOwner();
  const list = await db.campaign.findMany({ where: { businessId: await businessId(), automation: null }, include: { recipients: { select: { openedAt: true, clickedAt: true } } }, orderBy: { createdAt: "desc" } });
  const th = "px-3 py-2 text-xs font-medium text-ink-soft";
  return (
    <>
      <DetailHeader back={{ href: "/marketing", label: "Marketing" }} title="Campaigns" sub="Email or text your clients. Consent, unsubscribe links and quiet hours are handled for you." />
      <Card title="Start a campaign" className="mb-5">
        <form action={campaignNew} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-56 flex-1 sm:max-w-sm">
            <span className="mb-1 block text-sm font-semibold">Campaign name</span>
            <Input name="name" placeholder="e.g. Spring clean-up 2027" />
          </label>
          <Button name="channel" value="EMAIL"><Mail className="size-4" aria-hidden />New email</Button>
          <Button variant="secondary" name="channel" value="SMS"><MessageSquare className="size-4" aria-hidden />New text</Button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">The name is only for you. Nothing is sent until you choose who gets it and press Send.</p>
      </Card>

      {list.length === 0 ? <Empty>No campaigns yet. Name one above and choose email or text to start writing.</Empty> : (
        <section className="overflow-hidden rounded-xl border border-line bg-white shadow-card" aria-label="Campaigns">
          {/* Desk: a table. Phone: the same rows, stacked. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className={`${th} pl-5`}>Campaign</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>When</th>
                  <th scope="col" className={`${th} text-right`}>Sent to</th>
                  <th scope="col" className={`${th} text-right`}>Opened</th>
                  <th scope="col" className={`${th} pr-5 text-right`}>Clicked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {list.map((c) => {
                  const n = c.recipients.length;
                  return (
                    <tr key={c.id} className="hover:bg-tint/60">
                      <td className="max-w-0 w-[40%] py-2.5 pl-5 pr-3">
                        <Link href={`/marketing/campaigns/${c.id}`} className="block truncate font-semibold hover:text-blue-deep hover:underline">{c.name}</Link>
                        <span className="block truncate text-xs text-ink-soft">{c.subject ?? c.smsBody ?? "No content yet"}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft"><span className="inline-flex items-center gap-1.5">{c.channel === "EMAIL" ? <Mail className="size-4" aria-hidden /> : <MessageSquare className="size-4" aria-hidden />}{c.channel === "EMAIL" ? "Email" : "Text"}</span></td>
                      <td className="px-3 py-2.5"><CampaignBadge status={c.status} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-soft">{c.sentAt ? `Sent ${prettyDateTime(c.sentAt)}` : `Created ${prettyDateTime(c.createdAt)}`}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{n || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{n ? c.recipients.filter((r) => r.openedAt).length : "—"}</td>
                      <td className="py-2.5 pl-3 pr-5 text-right tabular-nums">{n ? c.recipients.filter((r) => r.clickedAt).length : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line-soft md:hidden">
            {list.map((c) => {
              const n = c.recipients.length;
              return (
                <li key={c.id}>
                  <Link href={`/marketing/campaigns/${c.id}`} className="block px-4 py-3 active:bg-tint">
                    <span className="flex items-start justify-between gap-3"><span className="min-w-0 font-semibold">{c.name}</span><CampaignBadge status={c.status} /></span>
                    <span className="mt-0.5 block truncate text-sm text-ink-soft">{c.subject ?? c.smsBody ?? "No content yet"}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-ink-soft">
                      <span className="inline-flex items-center gap-1">{c.channel === "EMAIL" ? <Mail className="size-3.5" aria-hidden /> : <MessageSquare className="size-3.5" aria-hidden />}{c.channel === "EMAIL" ? "Email" : "Text"}</span>
                      <span>· {c.sentAt ? `Sent ${prettyDateTime(c.sentAt)}` : `Created ${prettyDateTime(c.createdAt)}`}</span>
                      {n > 0 && <span className="basis-full">{n} sent, {c.recipients.filter((r) => r.openedAt).length} opened, {c.recipients.filter((r) => r.clickedAt).length} clicked</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
