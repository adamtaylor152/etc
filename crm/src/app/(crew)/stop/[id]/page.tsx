// One stop, for whoever is doing it: the checklist, proof photos and the client's signature. The route runner links here
// when a job needs them. No prices, no billing, and only a visit on the signed-in person's own route (owners: any).
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, TriangleAlert } from "lucide-react";
import { Flash } from "@/components/flash";
import { PhotoUploader } from "@/components/photo-uploader";
import { SignaturePad } from "@/components/signature-pad";
import { Badge, Card, Field, Input, Notice, btn } from "@/components/ui";
import { VisitChecklistCard } from "@/components/visit-checklist";
import { requireUser } from "@/server/auth";
import { dateOnly, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { STATEMENTS } from "@/server/ops/signatures";
import { clientName } from "@/server/queries";
import { visitScope } from "@/server/runner";
import { stopChecklist, stopSign } from "./actions";

export const metadata = { title: "Stop" };

export default async function Stop({ params, searchParams }: PageProps<"/stop/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/stop/${id}`);
  const sp = await searchParams;
  const v = await db.visit.findFirst({
    where: { id, businessId: user.businessId, ...visitScope(user) },
    include: { job: { include: { client: true } }, property: true, _count: { select: { attachments: { where: { deletedAt: null, kind: { in: ["BEFORE", "AFTER"] } } } } } },
  });
  if (!v) notFound();
  const signed = await db.signature.findFirst({ where: { visitId: v.id, kind: "VISIT" }, orderBy: { signedAt: "desc" } });
  const open = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state);
  const back = `/run?date=${dateOnly(v.scheduledDate) ?? todayLocal()}`;
  const notes = v.instructions ?? v.job.instructions;
  return (
    <div className="mx-auto max-w-lg">
      <Link href={back} className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-ink-soft hover:text-navy"><ChevronLeft className="size-4" aria-hidden />My route</Link>
      <div className="mb-5">
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight [overflow-wrap:anywhere]">{v.property.formatted.replace(/, Calgary.*$/, "")}</h1>
        <p className="mt-1 text-base text-ink-soft">{clientName(v.job.client)} · {v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title}</p>
        {notes && (
          <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-300 bg-amber-100 p-3 text-base font-medium text-amber-950">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /><p className="min-w-0 whitespace-pre-line">{notes}</p>
          </div>
        )}
      </div>
      <Flash error={sp.error} />
      {sp.saved && <Notice tone="good">Saved.</Notice>}

      <div className="space-y-5">
        <VisitChecklistCard businessId={v.businessId} visitId={v.id} editable={open} action={stopChecklist} primary />

        <Card title="Before and after photos" actions={v._count.attachments > 0 && <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-emerald-700"><Check className="size-3.5" aria-hidden />{v._count.attachments} added</span>}>
          <div className="grid grid-cols-2 gap-2">
            <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "BEFORE" }} label="Before" geo />
            <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "AFTER" }} label="After" geo />
          </div>
        </Card>

        {(v.job.requireSignature || signed) && (
          <Card title="Client signature" actions={!signed && v.job.requireSignature && <Badge tone="amber">Needed before Done</Badge>}>
            {signed ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Check className="size-4" aria-hidden />Signed by {signed.signerName}</p>
            ) : open ? (
              <form action={stopSign} className="space-y-3">
                <input type="hidden" name="visitId" value={v.id} />
                <p className="rounded-lg bg-tint p-3 text-base leading-relaxed">“{STATEMENTS.VISIT}”</p>
                <Field label="Name"><Input name="name" required defaultValue={clientName(v.job.client)} autoComplete="off" className="min-h-11" /></Field>
                <SignaturePad height={220} />
                <button className={btn("primary", "min-h-14! w-full text-base!")}>Save signature</button>
              </form>
            ) : <p className="text-sm text-ink-soft">Not signed. The stop is closed, so a signature can no longer be added here.</p>}
          </Card>
        )}
        <Link href={back} className={btn("secondary", "min-h-14! w-full text-base!")}>{open ? "Back to my route to mark it done" : "Back to my route"}</Link>
      </div>
    </div>
  );
}
