"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { moved, newKey, serviceInput } from "@/server/ops/price-book";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");
const on = (f: FormData, k: string) => f.get(k) === "on";

/** Create (no id) or edit a service. The key is set once, on create, and never changes. */
export async function serviceSave(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  let data;
  try {
    data = serviceInput({
      name: s(f, "name"), description: s(f, "description"), category: s(f, "category"), pricingMode: s(f, "pricingMode"), price: s(f, "price"),
      unit: s(f, "unit"), isAddon: on(f, "isAddon"), duration: s(f, "duration"), cost: s(f, "cost"), taxExempt: on(f, "taxExempt"),
      checklistTemplateId: s(f, "checklistTemplateId"), bookable: on(f, "bookable"), bookingLabel: s(f, "bookingLabel"), active: on(f, "active"),
    });
  } catch (e) {
    if (e instanceof z.ZodError) redirect(`/settings/price-book?error=${encodeURIComponent(e.issues[0].message)}${id ? `&open=${id}` : ""}`);
    throw e;
  }
  if (data.checklistTemplateId) await db.checklistTemplate.findFirstOrThrow({ where: { id: data.checklistTemplateId, businessId: user.businessId } });
  if (id) await db.service.updateMany({ where: { id, businessId: user.businessId }, data });
  else {
    const all = await db.service.findMany({ where: { businessId: user.businessId }, select: { key: true, sortOrder: true } });
    await db.service.create({ data: { ...data, businessId: user.businessId, key: newKey(data.name, all.map((x) => x.key)), sortOrder: Math.max(-1, ...all.map((x) => x.sortOrder)) + 1 } });
  }
  revalidatePath("/settings/price-book");
  redirect("/settings/price-book?saved=1");
}

/** Archive / restore. Services are never deleted: quotes, jobs and snow pricing may point at them. */
export async function serviceArchive(f: FormData) {
  const user = await requireOwner();
  await db.service.updateMany({ where: { id: s(f, "id"), businessId: user.businessId }, data: { active: f.get("active") === "1" } });
  revalidatePath("/settings/price-book");
}

export async function serviceMove(f: FormData) {
  const user = await requireOwner();
  const rows = await db.service.findMany({ where: { businessId: user.businessId }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, sortOrder: true } }); // the page's order
  const order = moved(rows.map((r) => r.id), s(f, "id"), f.get("dir") === "up" ? -1 : 1);
  // Renumber the lot: existing orders may have gaps or ties.
  await db.$transaction(order.flatMap((id, i) => (rows.find((r) => r.id === id)!.sortOrder === i ? [] : [db.service.update({ where: { id }, data: { sortOrder: i } })])));
  revalidatePath("/settings/price-book");
}
