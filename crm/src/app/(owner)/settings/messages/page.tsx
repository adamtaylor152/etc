// Settings › Messages: the owner's own wording for client emails and texts, their logo and colour, and the texting
// screen's quick replies. Everything here is optional; untouched, the app sends exactly what it always has.
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { ChevronDown } from "lucide-react";
import { BrandFields } from "@/components/settings/brand-fields";
import { Saved, rowToggle } from "@/components/settings/fields";
import { Badge, Button, Card, Input, Notice } from "@/components/ui";
import { business, db } from "@/server/db";
import { samples } from "@/server/email/samples";
import { templates } from "@/server/email/templates";
import { EMAIL_META, GROUPS, SMS_META, type EmailKey, type SmsKey } from "@/server/email/wording";
import { parseSettings } from "@/server/settings";
import { saveBrand, saveQuickReplies } from "./actions";
import { EmailEditor, SmsEditor } from "./editor";

export const metadata = { title: "Messages & branding" };

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MessageSettings({ searchParams }: PageProps<"/settings/messages">) {
  const user = await requireOwner();
  const sp = await searchParams;
  const biz = await business();
  const settings = parseSettings(biz.settings);
  const saved = new Map((await db.emailTemplateOverride.findMany({ where: { businessId: biz.id, enabled: true } })).map((o) => [o.template, o]));
  const sample = samples();
  const unknown = one(sp.unknown).split(",").filter(Boolean);
  const savedKey = one(sp.saved);
  const row = (key: string, m: { label: string; trigger: string }, editor: React.ReactNode) => (
    <details key={key} id={key} open={savedKey === key} className="group scroll-mt-20 border-t border-line-soft first:border-t-0">
      <summary className="list-none flex min-h-14 cursor-pointer items-center gap-3 py-2.5 hover:bg-tint/60">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold">{m.label}</span>{saved.has(key) && <Badge tone="blue">Your wording</Badge>}</span>
          <span className="block text-sm text-ink-soft">{m.trigger}</span>
        </span>
        <span className={rowToggle}><span className="group-open:hidden">Edit</span><span className="hidden group-open:inline">Close</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></span>
      </summary>
      <div className="pb-5 pt-1">
        <Saved when={savedKey === key} />
        {savedKey === key && unknown.length > 0 && <Notice tone="warn">Heads up: {unknown.map((n) => `{{${n}}}`).join(", ")} isn&apos;t on the list for that message, so it will send as nothing.</Notice>}
        {editor}
      </div>
    </details>
  );
  const group = (g: string, rows: React.ReactNode) => (
    <section key={g} className="mb-5 last:mb-0">
      <h3 className="mb-1 border-b border-line pb-1.5 text-xs font-medium text-ink-soft">{g}</h3>
      {rows}
    </section>
  );
  return (
    <div className="max-w-5xl">
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Messages & branding" sub="Change what clients receive, in your own words. Line items, totals, buttons, links and the footer are always filled in for you." />
      <Flash error={sp.error} />
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card title="Logo & colour">
            <Saved when={savedKey === "brand"} />
            <form action={saveBrand} className="space-y-4">
              <BrandFields logoUrl={settings.logoId ? `/api/media/${settings.logoId}/logo` : null} color={settings.brandColor ?? "#1d6fd8"} businessName={biz.name} />
              <p className="max-w-[70ch] text-xs text-ink-soft">Used on emails, the pages clients open from them (quotes, invoices, booking, their own page) and PDF invoices, quotes and statements. No logo means the “etc.” wordmark.</p>
              <div className="flex flex-wrap gap-2">
                <Button>Save logo &amp; colour</Button>
                {settings.logoId && <Button variant="secondary" name="reset" value="logo">Remove logo</Button>}
                {settings.brandColor && <Button variant="secondary" name="reset" value="color">Back to etc. blue</Button>}
              </div>
            </form>
          </Card>

          <Card title="Quick replies">
            <div id="replies" className="scroll-mt-24">
              <Saved when={savedKey === "replies"} />
              <form action={saveQuickReplies} className="space-y-2">
                <p className="text-sm text-ink-soft">One-tap replies above the message box when you text a client.</p>
                {[...settings.quickReplies, ...Array.from({ length: 8 - settings.quickReplies.length }, () => "")].map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ink-soft" aria-hidden>{i + 1}</span>
                    <Input name="reply" defaultValue={r} maxLength={300} placeholder="Add a reply" aria-label={`Quick reply ${i + 1}`} />
                  </div>
                ))}
                <p className="text-xs text-ink-soft">Clear a line to remove it. Clear them all to get the standard four back.</p>
                <div className="pt-1"><Button>Save replies</Button></div>
              </form>
            </div>
          </Card>
        </div>

        <Card title="Emails">
          {GROUPS.map((g) => group(g, (Object.keys(EMAIL_META) as EmailKey[]).filter((k) => EMAIL_META[k].group === g).map((k) => {
            const o = saved.get(k);
            return row(k, EMAIL_META[k], <EmailEditor k={k} saved={o ? { subject: o.subject, intro: o.intro, closing: o.closing } : null} hasClosing={"closing" in EMAIL_META[k]}
              defaultSubject={(templates[k].subject as (p: object) => string)(sample[k].props)} me={user.email} />);
          })))}
          <p className="mt-4 max-w-[70ch] text-xs text-ink-soft">Notices to you and the team, the sign-in email and campaigns (which have their own editor under Marketing) aren&apos;t listed.</p>
        </Card>

        <Card title="Texts">
          {GROUPS.map((g) => {
            const keys = (Object.keys(SMS_META) as SmsKey[]).filter((k) => SMS_META[k].group === g);
            return keys.length === 0 ? null : group(g, keys.map((k) => row(k, SMS_META[k], <SmsEditor k={k} saved={saved.get(k)?.body ?? null} />)));
          })}
          <p className="mt-4 max-w-[70ch] text-xs text-ink-soft">Texts only go to clients who said yes to them. The link a text is for, who it&apos;s from and “Reply STOP” (where the standard text has it) are always kept.</p>
        </Card>
      </div>
    </div>
  );
}
