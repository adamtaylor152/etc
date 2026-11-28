// Settings → Checklists: templates that visits fill in on the field view.
import { ChecklistEditor } from "@/components/checklist-editor";
import { DetailHeader } from "@/components/detail-header";
import { businessId, db } from "@/server/db";
import { seedStarters, type ChecklistItem } from "@/server/ops/checklists";
import { checklistSave } from "../../checklist-actions";

export const metadata = { title: "Checklists" };

export default async function Checklists({ searchParams }: PageProps<"/settings/checklists">) {
  const sp = await searchParams;
  const bid = await businessId();
  await seedStarters(bid); // first visit: two starter templates to edit
  const [templates, services] = await Promise.all([
    db.checklistTemplate.findMany({ where: { businessId: bid }, orderBy: { createdAt: "asc" } }),
    db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Checklists" sub="Each visit on a job with a checklist gets its own copy. Required items must be done before the visit can be marked Done." />
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
      <div className="max-w-4xl space-y-5">
        {templates.map((t) => (
          <section key={t.id} className="rounded-lg border border-line bg-white p-4 shadow-card">
            <ChecklistEditor action={checklistSave} services={services} t={{ id: t.id, name: t.name, items: t.items as ChecklistItem[], active: t.active, serviceIds: services.filter((s) => s.checklistTemplateId === t.id).map((s) => s.id) }} />
          </section>
        ))}
        <section className="rounded-lg border border-dashed border-line bg-white p-4">
          <h2 className="mb-3 text-base font-bold">New checklist</h2>
          <ChecklistEditor action={checklistSave} services={services} />
        </section>
      </div>
    </>
  );
}
