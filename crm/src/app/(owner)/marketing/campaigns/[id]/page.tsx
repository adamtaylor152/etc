// Campaign editor: content (email blocks or text), audience with live count, test send, send now or schedule; results once sent.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { CampaignBlocks } from "@/components/campaign-blocks";
import { DetailHeader } from "@/components/detail-header";
import { Badge } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { prettyDateTime } from "@/server/dates";
import { Audience, audienceClients, CAMPAIGN_EMAILS_PER_DAY, campaignQueued, type Block } from "@/server/ops/campaigns";
import { segments } from "@/server/segments";
import { campaignCancel, campaignDuplicate, campaignSave } from "../../campaign-actions";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params, searchParams }: PageProps<"/marketing/campaigns/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const c = await db.campaign.findFirst({ where: { id, businessId: bid }, include: { recipients: true } });
  if (!c) notFound();
  if (c.automation) redirect(`/marketing/automations/${c.automation.toLowerCase()}`);
  const a = Audience.parse(c.audience);
  const draft = c.status === "DRAFT";
  const [queued, audience, biz, tagRows, communities] = await Promise.all([
    draft ? 0 : campaignQueued(bid, c.id), // still waiting in the outbox: what Cancel would stop
    draft ? audienceClients(bid, a, c.channel) : Promise.resolve([]),
    db.business.findUniqueOrThrow({ where: { id: bid } }),
    db.client.findMany({ where: { businessId: bid }, select: { tags: true } }),
    db.serviceCommunity.findMany({ where: { businessId: bid, active: true }, include: { community: true } }),
  ]);
  const tags = [...new Set(tagRows.flatMap((t) => t.tags))].sort();
  const r = c.recipients;
  const sel = "min-h-9 rounded-lg border border-line bg-white px-2 text-sm";
  const days = Math.ceil(audience.length / CAMPAIGN_EMAILS_PER_DAY);
  return (
    <>
      <DetailHeader back={{ href: "/marketing/campaigns", label: "Campaigns" }} kind={c.channel === "EMAIL" ? "Email campaign" : "Text campaign"} status={<Badge tone={c.status === "SENT" ? "green" : c.status === "DRAFT" || c.status === "CANCELLED" ? "gray" : "blue"}>{c.status.toLowerCase()}</Badge>} title={c.name}
        sub={c.status === "SCHEDULED" && c.scheduledFor ? `Goes out ${prettyDateTime(c.scheduledFor)}.` : undefined}
        actions={<div className="flex gap-2">
          {queued > 0 && <form action={campaignCancel}><input type="hidden" name="id" value={c.id} /><ConfirmButton message={`Cancel this campaign? ${queued} message${queued === 1 ? "" : "s"} not sent yet will never go out. This can't be undone (duplicate it to send again).`} className="min-h-10 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50">Cancel {queued} unsent</ConfirmButton></form>}
          <form action={campaignDuplicate}><input type="hidden" name="id" value={c.id} /><button className="min-h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">Duplicate</button></form>
        </div>} />
      {typeof sp.cancelled === "string" && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">Cancelled. {sp.cancelled} message{sp.cancelled === "1" ? "" : "s"} will not be sent.</p>}
      {sp.copied && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">This is a copy: same content and audience, nothing sent. Edit it and send when ready.</p>}
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      {sp.tested && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">Test sent to the owners&apos; inboxes.</p>}
      {typeof sp.sent === "string" && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">Queued for {sp.sent} client{sp.sent === "1" ? "" : "s"}{Number(sp.days) > 1 ? `, spread over ${sp.days} days to stay under the daily email limit` : ""}.</p>}
      {!draft && (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          {[["Recipients", r.length], ["Sent", r.filter((x) => x.status === "SENT").length || "queued"], ["Opened (approx.)", r.filter((x) => x.openedAt).length], ["Clicked", r.filter((x) => x.clickedAt).length]].map(([l, v]) => (
            <section key={String(l)} className="rounded-lg border border-line bg-white p-4 shadow-card"><h2 className="text-sm font-bold">{l}</h2><p className="mt-2 font-display text-2xl font-bold">{v}</p></section>
          ))}
        </div>
      )}
      <form action={campaignSave} className="grid gap-5 lg:grid-cols-3">
        <input type="hidden" name="id" value={c.id} />
        <section className="space-y-3 rounded-lg border border-line bg-white p-4 shadow-card lg:col-span-2">
          <label className="block text-sm font-semibold">Campaign name (internal)<input name="name" defaultValue={c.name} disabled={!draft} className="mt-1 min-h-10 w-full rounded-lg border border-line px-3" /></label>
          {c.channel === "EMAIL" ? (
            <>
              <label className="block text-sm font-semibold">Subject<input name="subject" defaultValue={c.subject ?? ""} disabled={!draft} placeholder="e.g. Spring cleanup spots are open" className="mt-1 min-h-10 w-full rounded-lg border border-line px-3" /></label>
              <CampaignBlocks initial={c.blocks as Block[]} disabled={!draft} />
              {!biz.mailingAddress && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Add your business mailing address in <Link href="/settings" className="font-semibold underline">Settings</Link> before sending (Canada&apos;s anti-spam law requires it).</p>}
            </>
          ) : (
            <label className="block text-sm font-semibold">Text message
              <textarea name="smsBody" defaultValue={c.smsBody ?? ""} disabled={!draft} rows={4} maxLength={600} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
              <span className="text-xs font-normal text-ink-soft">“Reply STOP to opt out.” is added. {c.smsBody ? `${segments(`${c.smsBody} Reply STOP to opt out.`).parts} text segment(s) per person.` : ""} Texts never go out between 9 pm and 9 am.</span>
            </label>
          )}
        </section>
        <section className="space-y-3 rounded-lg border border-line bg-white p-4 text-sm shadow-card">
          <h2 className="text-base font-bold">Audience</h2>
          <label className="flex items-center justify-between gap-2">Clients<select name="a_status" defaultValue={a.status} disabled={!draft} className={sel}><option value="any">Everyone</option><option value="active">Active</option><option value="past">Past clients</option><option value="lead">Leads</option></select></label>
          <label className="flex items-center justify-between gap-2">Snow plan<select name="a_plan" defaultValue={a.hasSnowPlan} disabled={!draft} className={sel}><option value="any">Any</option><option value="yes">Has one</option><option value="no">Doesn&apos;t</option></select></label>
          <label className="flex items-center justify-between gap-2">Open quote<select name="a_quote" defaultValue={a.hasOpenQuote} disabled={!draft} className={sel}><option value="any">Any</option><option value="yes">Has one</option><option value="no">Doesn&apos;t</option></select></label>
          <label className="block">Had a service containing<input name="a_service" defaultValue={a.service} disabled={!draft} placeholder="e.g. window" className={`${sel} mt-1 w-full`} /></label>
          <div className="grid grid-cols-2 gap-2"><label>Last visit after<input type="date" name="a_after" defaultValue={a.lastVisitAfter} disabled={!draft} className={`${sel} mt-1 w-full`} /></label><label>Last visit before<input type="date" name="a_before" defaultValue={a.lastVisitBefore} disabled={!draft} className={`${sel} mt-1 w-full`} /></label></div>
          {tags.length > 0 && <fieldset><legend className="mb-1">Tags (any)</legend><div className="flex flex-wrap gap-x-3">{tags.map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="a_tag" value={t} defaultChecked={a.tags.includes(t)} disabled={!draft} className="size-4" />{t}</label>)}</div></fieldset>}
          {communities.length > 0 && <fieldset><legend className="mb-1">Communities</legend><div className="flex flex-wrap gap-x-3">{communities.map((x) => <label key={x.communityCode} className="flex items-center gap-1"><input type="checkbox" name="a_community" value={x.communityCode} defaultChecked={a.communities.includes(x.communityCode)} disabled={!draft} className="size-4" />{x.community.name}</label>)}</div></fieldset>}
          {draft && (
            <>
              <p className="rounded-lg bg-tint p-3"><span className="font-display text-2xl font-bold">{audience.length}</span> client{audience.length === 1 ? "" : "s"} can receive this{c.channel === "EMAIL" ? " (express or implied consent, not unsubscribed)" : " (said yes to texts, haven't replied STOP)"}.{c.channel === "EMAIL" && days > 1 && ` Sends over ${days} days.`}</p>
              <button name="next" value="save" className="min-h-10 w-full rounded-lg border border-line font-semibold hover:bg-tint">Save &amp; update count</button>
              {c.channel === "EMAIL" && <button name="next" value="test" className="min-h-10 w-full rounded-lg border border-line font-semibold hover:bg-tint">Send a test to the owners</button>}
              <label className="block">Send at (optional)<input type="datetime-local" name="at" className={`${sel} mt-1 w-full`} /></label>
              <button name="next" value="send" className="min-h-11 w-full rounded-lg bg-blue font-semibold text-white">Send to {audience.length}</button>
            </>
          )}
        </section>
      </form>
    </>
  );
}
