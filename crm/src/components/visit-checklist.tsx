// Field-view checklist: answer items, photos for photo items, save. "Done" is blocked server-side until required items are in.
import { Check } from "lucide-react";
import { checklistAnswer } from "@/app/(owner)/checklist-actions";
import { db } from "@/server/db";
import { missingRequired, visitChecklist, type Answers, type ChecklistItem } from "@/server/ops/checklists";
import { PhotoUploader } from "./photo-uploader";

export async function VisitChecklistCard({ businessId, visitId, editable }: { businessId: string; visitId: string; editable: boolean }) {
  const vc = await visitChecklist(businessId, visitId);
  if (!vc) return null;
  const items = vc.items as ChecklistItem[];
  const answers = vc.answers as Answers;
  const tags = (await db.attachment.findMany({ where: { visitId, deletedAt: null, caption: { startsWith: "checklist:" } }, select: { caption: true } })).map((a) => a.caption!);
  const missing = missingRequired(items, answers, tags);
  const inp = "min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm";
  return (
    <section className="my-4 rounded-lg border border-line bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Checklist · {vc.templateName}</h2>
        {missing.length ? <span className="text-xs font-semibold text-amber-700">{missing.length} required left</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="size-3.5" />Complete</span>}
      </div>
      <form action={checklistAnswer} className="space-y-3">
        <input type="hidden" name="visitId" value={visitId} />
        {items.map((it) => (
          <div key={it.id}>
            <input type="hidden" name="itemId" value={it.id} /><input type="hidden" name={`t_${it.id}`} value={it.type} />
            {it.type === "CHECKBOX" ? (
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" name={`a_${it.id}`} defaultChecked={answers[it.id] === true} disabled={!editable} className="size-6" /><span>{it.label}{it.required && <span className="text-red-700"> *</span>}</span></label>
            ) : (
              <div>
                <p className="mb-1 text-sm font-semibold">{it.label}{it.required && <span className="text-red-700"> *</span>}</p>
                {it.type === "YESNO" && (
                  <div className="flex gap-4 text-sm">{["yes", "no"].map((v) => <label key={v} className="flex items-center gap-1.5"><input type="radio" name={`a_${it.id}`} value={v} defaultChecked={answers[it.id] === v} disabled={!editable} className="size-5" />{v === "yes" ? "Yes" : "No"}</label>)}</div>
                )}
                {it.type === "TEXT" && <textarea name={`a_${it.id}`} defaultValue={String(answers[it.id] ?? "")} rows={2} disabled={!editable} className={inp} />}
                {it.type === "NUMBER" && <input name={`a_${it.id}`} type="number" inputMode="decimal" defaultValue={answers[it.id] == null ? "" : String(answers[it.id])} disabled={!editable} className={`${inp} max-w-40`} />}
                {it.type === "PHOTO" && (tags.includes(`checklist:${it.id}`)
                  ? <p className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="size-4" />Photo added</p>
                  : editable ? <div className="max-w-xs"><PhotoUploader endpoint="/api/uploads" fields={{ visitId, kind: "PROOF", caption: `checklist:${it.id}` }} label="Take photo" /></div> : <p className="text-sm text-ink-soft">No photo</p>)}
              </div>
            )}
          </div>
        ))}
        {editable && <button className="min-h-10 rounded-lg bg-navy px-4 text-sm font-semibold text-white">Save checklist</button>}
      </form>
    </section>
  );
}
