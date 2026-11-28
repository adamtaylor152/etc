"use client";
// Editors for one email and one text (Settings › Messages). The rules (variables, required parts, segments) are the
// same pure functions the server uses when it sends.
import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { primaryWhenOpen } from "@/components/settings/fields";
import { Button, Field, Input, Textarea, btn } from "@/components/ui";
import { allowedVars, fill, SMS_META, unknownVars, VAR_HELP, withRequired, type SmsKey, type Wording } from "@/server/email/wording";
import { segments } from "@/server/segments";
import { previewWording, resetWording, saveWording, sendTest } from "./actions";

/** The fill-ins this message can use, as chips: click one to copy it, then paste it where it should go. */
function Vars({ k }: { k: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (v: string) => navigator.clipboard?.writeText(`{{${v}}}`).then(() => { setCopied(v); setTimeout(() => setCopied((c) => (c === v ? null : c)), 1500); }).catch(() => {});
  return (
    <div>
      <p className="text-sm font-semibold">Fill-ins</p>
      <p className="mb-2 text-xs text-ink-soft">Click one to copy it, then paste it into your wording. It is swapped for the real thing when the message goes out.</p>
      <ul className="space-y-1.5">
        {allowedVars(k).map((v) => (
          <li key={v} className="flex items-start gap-2 text-xs">
            <button type="button" onClick={() => copy(v)} aria-label={`Copy {{${v}}}`}
              className="min-h-7 shrink-0 rounded-full border border-line bg-tint px-2.5 font-mono text-xs max-sm:min-h-11 max-sm:px-3.5 text-navy hover:border-blue/40 hover:bg-blue/8">{`{{${v}}}`}</button>
            <span className="pt-1.5 text-ink-soft max-sm:pt-3.5">{copied === v ? <span role="status" className="font-medium text-emerald-800">Copied</span> : VAR_HELP[v]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
const Unknown = ({ names }: { names: string[] }) => names.length === 0 ? null : (
  <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950">
    {names.map((n) => `{{${n}}}`).join(", ")} {names.length === 1 ? "isn't" : "aren't"} on the list for this message, so {names.length === 1 ? "it" : "they"} will send as nothing. Check the spelling.
  </p>
);

export function EmailEditor({ k, saved, defaultSubject, hasClosing, me }: { k: string; saved: Wording | null; defaultSubject: string; hasClosing: boolean; me: string }) {
  const [preview, previewAction, busy] = useActionState(previewWording, null);
  const [sent, sendAction, sending] = useActionState(sendTest, null);
  // Controlled: React clears a form's own fields after an action, and Preview must not wipe what was typed.
  const [w, setW] = useState({ subject: saved?.subject ?? "", intro: saved?.intro ?? "", closing: saved?.closing ?? "" });
  const field = (name: keyof typeof w) => ({ name, value: w[name], onChange: (e: { target: { value: string } }) => setW({ ...w, [name]: e.target.value }) });
  const blank = "Leave blank to keep the standard wording (Preview shows it)";
  return (
    <form action={saveWording} className="space-y-4">
      <input type="hidden" name="key" value={k} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] [&>*]:min-w-0">
        <div className="space-y-3">
          <Field label="Subject"><Input {...field("subject")} placeholder={defaultSubject} maxLength={150} /></Field>
          <Field label="Opening message" hint="Plain text, under the heading. A blank line starts a new paragraph."><Textarea {...field("intro")} rows={5} placeholder={blank} maxLength={2000} /></Field>
          {hasClosing && <Field label="Closing note"><Textarea {...field("closing")} rows={2} placeholder={blank} maxLength={1000} /></Field>}
          <Unknown names={unknownVars(Object.values(w).join(" "), allowedVars(k))} />
        </div>
        <Vars k={k} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className={primaryWhenOpen}>Save wording</Button>
        <Button variant="secondary" formAction={previewAction} disabled={busy}>{busy ? "Loading…" : "Preview"}</Button>
        <Button variant="secondary" formAction={sendAction} disabled={sending} title={`Emails this version to ${me}`}>Send me a test</Button>
        {saved && <ConfirmButton formAction={resetWording} message="Go back to the standard wording for this email?" className={btn("danger")}>Reset to default</ConfirmButton>}
      </div>
      {sent && <p key={sent.at} role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900">Test sent to {sent.to}, with a made-up client and amounts.</p>}
      {preview && (
        <div className="rounded-lg bg-tint p-3 sm:p-4">
          <div className="mx-auto max-w-[600px]">
            <p className="mb-2 text-sm"><span className="text-ink-soft">Subject</span> <span className="font-semibold">{preview.subject ?? defaultSubject}</span></p>
            {/* sandbox: the email is our own HTML, but nothing in a preview should be able to run or navigate. */}
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="block h-[40rem] w-full rounded-lg border border-line bg-white" />
            <p className="mt-2 text-xs text-ink-soft">Shown at the width of an email, with a made-up client and amounts.</p>
          </div>
        </div>
      )}
    </form>
  );
}

export function SmsEditor({ k, saved }: { k: SmsKey; saved: string | null }) {
  const meta = SMS_META[k];
  const [body, setBody] = useState(saved ?? meta.text);
  const final = withRequired(body, k);
  const sample = fill(final.body, meta.sample);
  const seg = segments(sample);
  return (
    <form action={saveWording} className="space-y-4">
      <input type="hidden" name="key" value={k} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] [&>*]:min-w-0">
        <div className="space-y-3">
          <Textarea name="body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} aria-label={`${meta.label} text`} />
          <Unknown names={unknownVars(body, allowedVars(k))} />
          {body.trim() && final.added.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950">This text has to say {final.added.join(" and ")}, so we&apos;ll add it to the end.</p>}
          <div className="rounded-lg bg-tint p-3">
            <p className="mb-2 text-xs font-medium text-ink-soft">What the client gets</p>
            <p className="ml-auto w-fit max-w-[22rem] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-blue px-3.5 py-2 text-[15px] leading-snug text-white">{body.trim() ? sample : fill(meta.text, meta.sample)}</p>
            <p className={`mt-2 text-xs ${sample.length > 300 ? "font-semibold text-red-700" : "text-ink-soft"}`}>
              {sample.length} characters · {seg.parts} text{seg.parts === 1 ? "" : "s"} per send{seg.unicode ? " (emoji or special characters make texts shorter)" : ""}, with a made-up name and address. Real ones can be longer.
              {sample.length > 300 && " Texts over 300 characters are cut off."}
            </p>
          </div>
        </div>
        <Vars k={k} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className={primaryWhenOpen}>Save wording</Button>
        {saved && <ConfirmButton formAction={resetWording} message="Go back to the standard wording for this text?" className={btn("danger")}>Reset to default</ConfirmButton>}
      </div>
    </form>
  );
}
