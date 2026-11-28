"use client";
// Editors for one email and one text (Settings › Messages). The rules (variables, required parts, segments) are the
// same pure functions the server uses when it sends.
import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, Field, Input, Textarea, btn } from "@/components/ui";
import { allowedVars, fill, SMS_META, unknownVars, VAR_HELP, withRequired, type SmsKey, type Wording } from "@/server/email/wording";
import { segments } from "@/server/segments";
import { previewWording, resetWording, saveWording, sendTest } from "./actions";

function Vars({ k }: { k: string }) {
  return (
    <p className="text-xs text-ink-soft">
      You can use: {allowedVars(k).map((v, i) => <span key={v}>{i > 0 && ", "}<code className="rounded bg-tint px-1 text-navy">{`{{${v}}}`}</code> {VAR_HELP[v]}</span>)}.
    </p>
  );
}
const Unknown = ({ names }: { names: string[] }) => names.length === 0 ? null : (
  <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
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
    <form action={saveWording} className="space-y-3">
      <input type="hidden" name="key" value={k} />
      <Field label="Subject"><Input {...field("subject")} placeholder={defaultSubject} maxLength={150} /></Field>
      <Field label="Opening message" hint="Plain text, under the heading. A blank line starts a new paragraph."><Textarea {...field("intro")} rows={4} placeholder={blank} maxLength={2000} /></Field>
      {hasClosing && <Field label="Closing note"><Textarea {...field("closing")} rows={2} placeholder={blank} maxLength={1000} /></Field>}
      <Vars k={k} />
      <Unknown names={unknownVars(Object.values(w).join(" "), allowedVars(k))} />
      <div className="flex flex-wrap gap-2">
        <Button>Save</Button>
        <Button variant="secondary" formAction={previewAction} disabled={busy}>{busy ? "Loading…" : "Preview"}</Button>
        <Button variant="secondary" formAction={sendAction} disabled={sending} title={`Emails this version to ${me}`}>Send me a test</Button>
        {saved && <ConfirmButton formAction={resetWording} message="Go back to the standard wording for this email?" className={btn("danger")}>Reset to default</ConfirmButton>}
      </div>
      {sent && <p key={sent.at} role="status" className="text-sm font-medium text-emerald-800">Test sent to {sent.to}, with a made-up client and amounts.</p>}
      {preview && (
        <div>
          <p className="mb-1 text-sm"><span className="text-ink-soft">Subject:</span> <b>{preview.subject ?? defaultSubject}</b> <span className="text-ink-soft">· made-up client and amounts</span></p>
          {/* sandbox: the email is our own HTML, but nothing in a preview should be able to run or navigate. */}
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[36rem] w-full rounded-lg border border-line bg-white" />
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
    <form action={saveWording} className="space-y-2">
      <input type="hidden" name="key" value={k} />
      <Textarea name="body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} aria-label={`${meta.label} text`} />
      <Vars k={k} />
      <Unknown names={unknownVars(body, allowedVars(k))} />
      {body.trim() && final.added.length > 0 && <p className="text-sm text-amber-900">This text has to say {final.added.join(" and ")}, so we&apos;ll add it to the end.</p>}
      <p className="rounded-lg bg-tint p-2 text-sm">{body.trim() ? sample : fill(meta.text, meta.sample)}</p>
      <p className={`text-xs ${sample.length > 300 ? "font-semibold text-red-700" : "text-ink-soft"}`}>
        {sample.length} characters · {seg.parts} text{seg.parts === 1 ? "" : "s"} per send{seg.unicode ? " (emoji or special characters make texts shorter)" : ""}, with a made-up name and address. Real ones can be longer.
        {sample.length > 300 && " Texts over 300 characters are cut off."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button>Save</Button>
        {saved && <ConfirmButton formAction={resetWording} message="Go back to the standard wording for this text?" className={btn("danger")}>Reset to default</ConfirmButton>}
      </div>
    </form>
  );
}
