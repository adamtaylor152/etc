// Campaign editor: content (email blocks or text), audience with live count, test send, send now or schedule; results once sent.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { CampaignBlocks } from "@/components/campaign-blocks";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { CampaignBadge } from "@/components/marketing/campaign-status";
import { Button, Card, Field, Input, Notice, Stat, Textarea, btn, inputCls } from "@/components/ui";
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
  const days = Math.ceil(audience.length / CAMPAIGN_EMAILS_PER_DAY);
  const email = c.channel === "EMAIL";
  const tick = "flex min-h-10 items-center gap-2 text-sm";
  return (
    <>
      <DetailHeader back={{ href: "/marketing/campaigns", label: "Campaigns" }} kind={email ? "Email campaign" : "Text campaign"} status={<CampaignBadge status={c.status} />} title={c.name}
        sub={c.status === "SCHEDULED" && c.scheduledFor ? `Goes out ${prettyDateTime(c.scheduledFor)}.` : undefined}
        actions={<>
          {queued > 0 && <form action={campaignCancel}><input type="hidden" name="id" value={c.id} /><ConfirmButton message={`Cancel this campaign? ${queued} message${queued === 1 ? "" : "s"} not sent yet will never go out. This can't be undone (duplicate it to send again).`} className={btn("danger")}>Cancel {queued} unsent</ConfirmButton></form>}
          <form action={campaignDuplicate}><input type="hidden" name="id" value={c.id} /><Button variant="secondary">Duplicate</Button></form>
        </>} />
      <Flash error={sp.error} />
      {typeof sp.cancelled === "string" && <Notice tone="good">Cancelled. {sp.cancelled} message{sp.cancelled === "1" ? "" : "s"} will not be sent.</Notice>}
      {sp.copied && <Notice>This is a copy: same content and audience, nothing sent. Edit it and send when ready.</Notice>}
      {sp.saved && <Notice tone="good">Saved.</Notice>}
      {sp.tested && <Notice tone="good">Test sent to the owners&apos; inboxes.</Notice>}
      {typeof sp.sent === "string" && <Notice tone="good">Queued for {sp.sent} client{sp.sent === "1" ? "" : "s"}{Number(sp.days) > 1 ? `, spread over ${sp.days} days to stay under the daily email limit` : ""}.</Notice>}
      {!draft && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Recipients" value={r.length} />
            <Stat label="Sent" value={r.filter((x) => x.status === "SENT").length || "Queued"} />
            <Stat label="Opened (approx.)" value={r.filter((x) => x.openedAt).length} />
            <Stat label="Clicked" value={r.filter((x) => x.clickedAt).length} />
          </div>
          <Notice>This campaign is no longer a draft, so its content and audience can&apos;t be changed. Duplicate it to send something like it again.</Notice>
        </>
      )}
      <form action={campaignSave} className="space-y-5">
        <input type="hidden" name="id" value={c.id} />
        <Card title={email ? "Email" : "Text message"}>
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Campaign name" hint="Only you see this."><Input name="name" defaultValue={c.name} disabled={!draft} /></Field>
              {email && <Field label="Subject"><Input name="subject" defaultValue={c.subject ?? ""} disabled={!draft} placeholder="e.g. Spring cleanup spots are open" /></Field>}
            </div>
            {email ? (
              <>
                <CampaignBlocks initial={c.blocks as Block[]} disabled={!draft} />
                {!biz.mailingAddress && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950">Add your business mailing address in <Link href="/settings#business" className="underline">Settings</Link> before sending (Canada&apos;s anti-spam law requires it).</p>}
              </>
            ) : (
              <div className="max-w-2xl">
                <Field label="Text message">
                  <Textarea name="smsBody" defaultValue={c.smsBody ?? ""} disabled={!draft} rows={4} maxLength={600} />
                </Field>
                <p className="mt-1 text-xs text-ink-soft">“Reply STOP to opt out.” is added. {c.smsBody ? `${segments(`${c.smsBody} Reply STOP to opt out.`).parts} text segment(s) per person.` : ""} Texts never go out between 9 pm and 9 am.</p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Who gets it">
          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Clients"><select name="a_status" defaultValue={a.status} disabled={!draft} className={inputCls}><option value="any">Everyone</option><option value="active">Active</option><option value="past">Past clients</option><option value="lead">Leads</option></select></Field>
                <Field label="Snow plan"><select name="a_plan" defaultValue={a.hasSnowPlan} disabled={!draft} className={inputCls}><option value="any">Any</option><option value="yes">Has one</option><option value="no">Doesn&apos;t</option></select></Field>
                <Field label="Open quote"><select name="a_quote" defaultValue={a.hasOpenQuote} disabled={!draft} className={inputCls}><option value="any">Any</option><option value="yes">Has one</option><option value="no">Doesn&apos;t</option></select></Field>
                <Field label="Had a service containing"><Input name="a_service" defaultValue={a.service} disabled={!draft} placeholder="e.g. window" /></Field>
                <Field label="Last visit after"><Input type="date" name="a_after" defaultValue={a.lastVisitAfter} disabled={!draft} className="tabular-nums" /></Field>
                <Field label="Last visit before"><Input type="date" name="a_before" defaultValue={a.lastVisitBefore} disabled={!draft} className="tabular-nums" /></Field>
              </div>
              {tags.length > 0 && <fieldset><legend className="text-sm font-semibold">Tags (any)</legend><div className="flex flex-wrap gap-x-5">{tags.map((t) => <label key={t} className={tick}><input type="checkbox" name="a_tag" value={t} defaultChecked={a.tags.includes(t)} disabled={!draft} className="size-5" />{t}</label>)}</div></fieldset>}
              {communities.length > 0 && <details open={a.communities.length > 0} className="rounded-lg border border-line"><summary className="flex min-h-11 items-center px-3 text-sm font-semibold">Communities<span className="ml-2 font-normal text-ink-soft">{a.communities.length ? `${a.communities.length} chosen` : "all (open to pick some)"}</span></summary><div className="grid max-h-72 grid-cols-2 gap-x-5 overflow-y-auto border-t border-line-soft px-3 py-1 sm:grid-cols-3">{communities.map((x) => <label key={x.communityCode} className={tick}><input type="checkbox" name="a_community" value={x.communityCode} defaultChecked={a.communities.includes(x.communityCode)} disabled={!draft} className="size-5 shrink-0" />{x.community.name}</label>)}</div></details>}
            </div>
            {draft && (
              <div className="space-y-3 self-start rounded-lg bg-tint p-4 lg:sticky lg:top-20">
                <div>
                  <p className="font-display text-[1.7rem] font-semibold leading-none tabular-nums">{audience.length}</p>
                  <p className="mt-1.5 text-sm text-ink-soft">client{audience.length === 1 ? "" : "s"} can receive this{email ? " (express or implied consent, not unsubscribed)" : " (said yes to texts, haven't replied STOP)"}.{email && days > 1 && ` Sends over ${days} days.`}</p>
                </div>
                <Button variant="secondary" name="next" value="save" className="w-full">Save &amp; update count</Button>
                {email && <Button variant="secondary" name="next" value="test" className="w-full">Send a test to the owners</Button>}
                <Field label="Send at (optional)" hint="Leave blank to send now."><Input type="datetime-local" name="at" className="tabular-nums" /></Field>
                <ConfirmButton name="next" value="send" message={`Send this campaign to ${audience.length} ${audience.length === 1 ? "person" : "people"}? This can't be undone.`} className={btn("primary", "min-h-11 w-full")}>Send to {audience.length}</ConfirmButton>
              </div>
            )}
          </div>
        </Card>
      </form>
    </>
  );
}
