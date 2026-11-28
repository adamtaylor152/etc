// Visit report for the client: before & after photos from one visit (linked from the "all done" email).
import type { Answers, ChecklistItem } from "@/server/ops/checklists";
import { Card, Dl } from "@/components/ui";
import { dateOnly, prettyDate, prettyDateTime } from "@/server/dates";
import { db } from "@/server/db";
import { signedMediaPath } from "@/server/media";
import { peekToken } from "@/server/tokens";

export const metadata = { title: { absolute: "Your job report · etc." } };

export default async function VisitReport({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  const t = await peekToken(db, token, ["VISIT_REPORT"]);
  if (!t.ok || !t.token.visitId) return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Get in touch and we&apos;ll send your photos again.</p></Card>;
  const v = await db.visit.findUniqueOrThrow({
    where: { id: t.token.visitId },
    include: { property: true, job: true, attachments: { where: { deletedAt: null, sharedWithClient: true }, orderBy: { createdAt: "asc" } } },
  });
  const group = (k: string) => v.attachments.filter((a) => a.kind === k);
  const vc = await db.visitChecklist.findUnique({ where: { visitId: v.id } });
  const shown = vc ? (vc.items as ChecklistItem[]).filter((i) => i.showClient && i.type !== "PHOTO") : [];
  const answer = (i: ChecklistItem) => { const a = (vc!.answers as Answers)[i.id]; return i.type === "CHECKBOX" ? (a === true ? "✓ Done" : "—") : i.type === "YESNO" ? (a === "yes" ? "Yes" : a === "no" ? "No" : "—") : a == null || a === "" ? "—" : String(a); };
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue">{prettyDate(dateOnly(v.scheduledDate))}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{v.state === "COMPLETED" ? "All done" : "Your visit"}: {v.property.formatted}</h1>
      </div>
      <Card>
        <Dl rows={[
          ["Job", v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title],
          ["Finished", v.completedAt ? prettyDateTime(v.completedAt) : null],
          ["Snow", v.depthCm ? `${v.depthCm} cm` : null],
          ["Ice melt", v.state === "COMPLETED" && v.iceMeltApplied ? "Yes" : null],
        ]} />
      </Card>
      {shown.length > 0 && <Card title="What we did"><Dl rows={shown.map((i) => [i.label, answer(i)] as [string, string])} /></Card>}
      {[["BEFORE", "Before"], ["AFTER", "After"], ["PROOF", "More photos"], ["OTHER", "More photos"]].map(([k, label]) => group(k).length > 0 && (
        <Card key={k} title={label}>
          <div className="grid gap-2 sm:grid-cols-2">
            {group(k).map((a) => (
              <a key={a.id} href={signedMediaPath(a.id, "lg", 30)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- private media via signed URL */}
                <img src={signedMediaPath(a.id, "md", 30)} alt={label} className="w-full rounded-xl" />
              </a>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
