// One stop, for whoever is doing it: the checklist, proof photos and the client's signature. The route runner links here
// when a job needs them. No prices, no billing, and only a visit on the signed-in person's own route (owners: any).
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Flash } from "@/components/flash";
import { PhotoUploader } from "@/components/photo-uploader";
import { SignaturePad } from "@/components/signature-pad";
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
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={back} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue">← Back to my route</Link>
      <div>
        <h1 className="font-display text-2xl font-bold">{v.property.formatted.replace(/, Calgary.*$/, "")}</h1>
        <p className="text-base">{clientName(v.job.client)} · {v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title}</p>
        {(v.instructions ?? v.job.instructions) && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-950">{v.instructions ?? v.job.instructions}</p>}
      </div>
      <Flash error={sp.error} />
      {sp.saved && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved.</p>}

      <VisitChecklistCard businessId={v.businessId} visitId={v.id} editable={open} action={stopChecklist} />

      <section className="rounded-lg border border-line bg-white p-4 shadow-card">
        <h2 className="mb-2 text-base font-bold">Before &amp; after photos{v._count.attachments > 0 && <span className="ml-2 text-xs font-semibold text-emerald-700">{v._count.attachments} added</span>}</h2>
        <div className="grid grid-cols-2 gap-2">
          <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "BEFORE" }} label="Before" geo />
          <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "AFTER" }} label="After" geo />
        </div>
      </section>

      {(v.job.requireSignature || signed) && (
        <section className="rounded-lg border border-line bg-white p-4 shadow-card">
          <h2 className="mb-2 text-base font-bold">Client signature{v.job.requireSignature && !signed && <span className="ml-2 text-xs font-semibold text-amber-700">needed before Done</span>}</h2>
          {signed ? (
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="size-4" />Signed by {signed.signerName}</p>
          ) : open && (
            <form action={stopSign} className="space-y-3">
              <input type="hidden" name="visitId" value={v.id} />
              <p className="rounded-lg bg-tint p-3 text-sm font-semibold">“{STATEMENTS.VISIT}”</p>
              <label className="block text-sm font-semibold">Name<input name="name" required defaultValue={clientName(v.job.client)} autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" /></label>
              <SignaturePad height={200} />
              <button className="min-h-12 w-full rounded-lg bg-blue font-semibold text-white">Save signature</button>
            </form>
          )}
        </section>
      )}
      <Link href={back} className="flex min-h-12 items-center justify-center rounded-full bg-navy font-semibold text-white">Back to my route to mark it done</Link>
    </div>
  );
}
