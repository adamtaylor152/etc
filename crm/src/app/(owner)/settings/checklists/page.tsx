// Settings → Checklists: templates that visits fill in on the field view.
import { requireOwner } from "@/server/auth";
import { ChecklistEditor } from "@/components/checklist-editor";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Saved } from "@/components/settings/fields";
import { Card } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { seedStarters, type ChecklistItem } from "@/server/ops/checklists";
import { checklistSave } from "../../checklist-actions";

export const metadata = { title: "Checklists" };

export default async function Checklists({ searchParams }: PageProps<"/settings/checklists">) {
  await requireOwner();
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
      <Flash error={sp.error} />
      <Saved when={!!sp.saved} />
      <div className="max-w-4xl space-y-5">
        {templates.map((t) => (
          <Card key={t.id}>
            <ChecklistEditor action={checklistSave} services={services} t={{ id: t.id, name: t.name, items: t.items as ChecklistItem[], active: t.active, serviceIds: services.filter((s) => s.checklistTemplateId === t.id).map((s) => s.id) }} />
          </Card>
        ))}
        <Card title="New checklist">
          <ChecklistEditor action={checklistSave} services={services} />
        </Card>
      </div>
    </>
  );
}
