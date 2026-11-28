// Settings › Messages: the owner's own wording for client emails and texts, their logo and colour, and the texting
// screen's quick replies. Everything here is optional; untouched, the app sends exactly what it always has.
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
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
  const row = (key: string, m: { label: string; trigger: string }, editor: React.ReactNode) => (
    <details key={key} id={key} open={one(sp.saved) === key} className="scroll-mt-20 border-t border-line py-3 first:border-t-0">
      <summary className="cursor-pointer">
        <span className="font-semibold">{m.label}</span> {saved.has(key) && <Badge tone="blue">Your wording</Badge>}
        <span className="block text-sm text-ink-soft">{m.trigger}</span>
      </summary>
      <div className="mt-3">{editor}</div>
    </details>
  );
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Messages & branding" sub="Change what clients receive, in your own words. Line items, totals, buttons, links and the footer are always filled in for you." />
      <Flash error={sp.error} />
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.{unknown.length > 0 && ` Heads up: ${unknown.map((n) => `{{${n}}}`).join(", ")} isn't on the list for that message, so it will send as nothing.`}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Logo & colour">
          <form action={saveBrand} className="space-y-3">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- private media, owner session */}
              {settings.logoId ? <img src={`/api/media/${settings.logoId}/logo`} alt="Your logo" className="h-12 w-auto max-w-48 rounded border border-line bg-white p-1" />
                : <span className="rounded bg-navy px-3 py-1 font-display text-2xl font-bold text-white">etc<span className="text-sky">.</span></span>}
              <Field label={settings.logoId ? "Replace logo" : "Logo"} hint="PNG or JPG, wide rather than tall. It shows on a white background."><input type="file" name="logo" accept="image/*" className="text-sm" /></Field>
            </div>
            <Field label="Brand colour" hint="Buttons and links. Light colours are refused so white button text stays readable.">
              <input type="color" name="brandColor" defaultValue={settings.brandColor ?? "#1d6fd8"} className="h-10 w-20 rounded border border-line bg-white" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button>Save</Button>
              {settings.logoId && <Button variant="secondary" name="reset" value="logo">Remove logo</Button>}
              {settings.brandColor && <Button variant="secondary" name="reset" value="color">Back to etc. blue</Button>}
            </div>
            <p className="text-xs text-ink-soft">Used on emails, the pages clients open from them (quotes, invoices, booking, their own page) and PDF invoices, quotes and statements. No logo means the “etc.” wordmark.</p>
          </form>
        </Card>

        <Card title="Quick replies">
          <form id="replies" action={saveQuickReplies} className="scroll-mt-20 space-y-2">
            <p className="text-sm text-ink-soft">One-tap replies above the message box when you text a client.</p>
            {[...settings.quickReplies, ...Array.from({ length: 8 - settings.quickReplies.length }, () => "")].map((r, i) => (
              <Input key={i} name="reply" defaultValue={r} maxLength={300} placeholder="Add a reply" aria-label={`Quick reply ${i + 1}`} />
            ))}
            <p className="text-xs text-ink-soft">Clear a line to remove it. Clear them all to get the standard four back.</p>
            <Button>Save replies</Button>
          </form>
        </Card>

        <Card title="Emails">
          {GROUPS.map((g) => (
            <section key={g} className="mb-4 last:mb-0">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{g}</h3>
              {(Object.keys(EMAIL_META) as EmailKey[]).filter((k) => EMAIL_META[k].group === g).map((k) => {
                const o = saved.get(k);
                return row(k, EMAIL_META[k], <EmailEditor k={k} saved={o ? { subject: o.subject, intro: o.intro, closing: o.closing } : null} hasClosing={"closing" in EMAIL_META[k]}
                  defaultSubject={(templates[k].subject as (p: object) => string)(sample[k].props)} me={user.email} />);
              })}
            </section>
          ))}
          <p className="text-xs text-ink-soft">Notices to you and the team, the sign-in email and campaigns (which have their own editor under Marketing) aren&apos;t listed.</p>
        </Card>

        <Card title="Texts">
          {GROUPS.map((g) => {
            const keys = (Object.keys(SMS_META) as SmsKey[]).filter((k) => SMS_META[k].group === g);
            return keys.length === 0 ? null : (
              <section key={g} className="mb-4 last:mb-0">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{g}</h3>
                {keys.map((k) => row(k, SMS_META[k], <SmsEditor k={k} saved={saved.get(k)?.body ?? null} />))}
              </section>
            );
          })}
          <p className="text-xs text-ink-soft">Texts only go to clients who said yes to them. The link a text is for, who it&apos;s from and “Reply STOP” (where the standard text has it) are always kept.</p>
        </Card>
      </div>
    </>
  );
}
