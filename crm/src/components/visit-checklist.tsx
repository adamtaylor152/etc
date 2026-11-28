// Field-view checklist: answer items, photos for photo items, save. "Done" is blocked server-side until required items are in.
import { Check } from "lucide-react";
import { checklistAnswer } from "@/app/(owner)/checklist-actions";
import { db } from "@/server/db";
import { missingRequired, visitChecklist, type Answers, type ChecklistItem } from "@/server/ops/checklists";
import { PhotoUploader } from "./photo-uploader";
import { Card, btn, inputCls } from "./ui";

/** `primary`: Save is the main action of the page it sits on (the crew's stop page); elsewhere it stays secondary.
 * `action`: who saves it. The owner's visit page by default; the crew's stop page passes its own (scoped to their route). */
export async function VisitChecklistCard({ businessId, visitId, editable, action = checklistAnswer, primary = false }: { businessId: string; visitId: string; editable: boolean; action?: (f: FormData) => Promise<void>; primary?: boolean }) {
  const vc = await visitChecklist(businessId, visitId);
  if (!vc) return null;
  const items = vc.items as ChecklistItem[];
  const answers = vc.answers as Answers;
  const tags = (await db.attachment.findMany({ where: { visitId, deletedAt: null, caption: { startsWith: "checklist:" } }, select: { caption: true } })).map((a) => a.caption!);
  const missing = missingRequired(items, answers, tags);
  const req = <span className="text-red-700" title="Required"> *</span>;
  return (
    <Card title={<>Checklist <span className="font-sans text-sm font-normal text-ink-soft">· {vc.templateName}</span></>}
      actions={missing.length ? <span className="text-xs font-semibold tabular-nums text-amber-800">{missing.length} required left</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="size-3.5" aria-hidden />Complete</span>}>
      <form action={action}>
        <input type="hidden" name="visitId" value={visitId} />
        <div className="divide-y divide-line-soft">
          {items.map((it) => (
            <div key={it.id} className="py-2 first:pt-0">
              <input type="hidden" name="itemId" value={it.id} /><input type="hidden" name={`t_${it.id}`} value={it.type} />
              {it.type === "CHECKBOX" ? (
                <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name={`a_${it.id}`} defaultChecked={answers[it.id] === true} disabled={!editable} className="size-6 shrink-0" /><span>{it.label}{it.required && req}</span></label>
              ) : (
                <div className="py-1">
                  <p className="mb-1.5 text-sm font-semibold">{it.label}{it.required && req}</p>
                  {it.type === "YESNO" && (
                    <div className="flex gap-2 text-sm">{["yes", "no"].map((v) => <label key={v} className="flex min-h-11 min-w-24 items-center gap-2 rounded-lg border border-line bg-white px-3 has-checked:border-blue has-checked:bg-blue/5 has-disabled:bg-tint"><input type="radio" name={`a_${it.id}`} value={v} defaultChecked={answers[it.id] === v} disabled={!editable} className="size-5" />{v === "yes" ? "Yes" : "No"}</label>)}</div>
                  )}
                  {it.type === "TEXT" && <textarea name={`a_${it.id}`} defaultValue={String(answers[it.id] ?? "")} rows={2} disabled={!editable} aria-label={it.label} className={inputCls} />}
                  {it.type === "NUMBER" && <input name={`a_${it.id}`} type="number" inputMode="decimal" defaultValue={answers[it.id] == null ? "" : String(answers[it.id])} disabled={!editable} aria-label={it.label} className={`${inputCls} max-w-40`} />}
                  {it.type === "PHOTO" && (tags.includes(`checklist:${it.id}`)
                    ? <p className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="size-4" aria-hidden />Photo added</p>
                    : editable ? <div className="max-w-xs"><PhotoUploader endpoint="/api/uploads" fields={{ visitId, kind: "PROOF", caption: `checklist:${it.id}` }} label="Take photo" /></div> : <p className="text-sm text-ink-soft">No photo</p>)}
                </div>
              )}
            </div>
          ))}
        </div>
        {editable
          ? <button className={btn(primary ? "primary" : "secondary", `mt-3 min-h-11! ${primary ? "w-full" : ""}`)}>Save checklist</button>
          : <p className="mt-3 text-xs text-ink-soft">This visit is closed, so the checklist can no longer be changed.</p>}
      </form>
    </Card>
  );
}
