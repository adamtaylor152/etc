/* eslint-disable @next/next/no-img-element -- private photos/signatures via signed URLs, not optimizable */
// Visit report for the client: before & after photos from one visit (linked from the "all done" email).
import type { Answers, ChecklistItem } from "@/server/ops/checklists";
import { Help, LinkProblem, PageTitle } from "@/components/public/kit";
import { Badge, Card, Dl } from "@/components/ui";
import { dateOnly, prettyDate, prettyDateTime } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { signedMediaPath } from "@/server/media";
import { peekToken } from "@/server/tokens";

export const metadata = { title: { absolute: "Your job report · etc." } };

export default async function VisitReport({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  const t = await peekToken(db, token, ["VISIT_REPORT"]);
  if (!t.ok || !t.token.visitId) return <LinkProblem title="This link has expired">Get in touch and we&apos;ll send your photos again.</LinkProblem>;
  const v = await db.visit.findUniqueOrThrow({
    where: { id: t.token.visitId },
    include: { property: true, job: true, attachments: { where: { deletedAt: null, sharedWithClient: true }, orderBy: { createdAt: "asc" } } },
  });
  const group = (k: string) => v.attachments.filter((a) => a.kind === k);
  const sig = await db.signature.findFirst({ where: { visitId: v.id, kind: "VISIT" }, orderBy: { signedAt: "desc" } });
  const vc = await db.visitChecklist.findUnique({ where: { visitId: v.id } });
  const shown = vc ? (vc.items as ChecklistItem[]).filter((i) => i.showClient && i.type !== "PHOTO") : [];
  const answer = (i: ChecklistItem) => { const a = (vc!.answers as Answers)[i.id]; return i.type === "CHECKBOX" ? (a === true ? "✓ Done" : "—") : i.type === "YESNO" ? (a === "yes" ? "Yes" : a === "no" ? "No" : "—") : a == null || a === "" ? "—" : String(a); };
  return (
    <>
      <PageTitle eyebrow={prettyDate(dateOnly(v.scheduledDate))} aside={v.state === "COMPLETED" ? <Badge tone="green">Done</Badge> : undefined}
        title={<>{v.state === "COMPLETED" ? "All done" : "Your visit"}: {v.property.formatted}</>} />
      <div className="grid gap-5">
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
              {group(k).map((a, i) => (
                <a key={a.id} href={signedMediaPath(a.id, "lg", 30)} target="_blank" rel="noreferrer">
                  <img src={signedMediaPath(a.id, "md", 30)} alt={`${label} photo ${i + 1}`} className="w-full rounded-lg" />
                </a>
              ))}
            </div>
          </Card>
        ))}
        {sig && <Card title="Signed off"><div className="flex items-center gap-3"><img src={signedMediaPath(sig.attachmentId, "sm", 30)} alt={`Signature of ${sig.signerName}`} className="h-14 w-36 shrink-0 rounded-lg border border-line bg-white object-contain" /><span>{sig.signerName}<span className="block text-sm text-ink-soft">{sig.statement}</span></span></div></Card>}
      </div>
      <Help phone={env.phone} email={env.helpEmail} />
    </>
  );
}
