"use server";
// Team members: who can sign in, as owner or crew, their schedule colour, and their hourly cost (job profit).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";

const Person = z.object({
  name: z.string().trim().min(1, "Add a name").max(80), email: z.email("That email doesn't look right").trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1d6fd8"),
  cost: z.coerce.number().min(0).max(500).default(0), active: z.boolean(), role: z.enum(["OWNER", "CREW"]).default("CREW"),
});

export async function teamSave(f: FormData) {
  const user = await requireOwner();
  const id = String(f.get("id") ?? "");
  const r = Person.safeParse({ name: f.get("name"), email: f.get("email"), phone: f.get("phone") || undefined, color: f.get("color") || undefined, cost: f.get("cost") || 0, role: f.get("role") || undefined, active: id ? f.get("active") === "on" : true });
  if (!r.success) redirect(`/settings/team?error=${encodeURIComponent(r.error.issues[0].message)}`);
  const p = r.data;
  if (id === user.id && !p.active) redirect(`/settings/team?error=${encodeURIComponent("You can't turn off your own access")}`);
  if (id === user.id && p.role !== "OWNER") redirect(`/settings/team?error=${encodeURIComponent("You can't remove your own owner access")}`);
  const data = { role: p.role, name: p.name, email: p.email, phone: p.phone || null, color: p.color, hourlyCostCents: Math.round(p.cost * 100), active: p.active };
  const clash = await db.user.findFirst({ where: { businessId: user.businessId, email: p.email, NOT: id ? { id } : undefined } });
  if (clash) redirect(`/settings/team?error=${encodeURIComponent("Someone on the team already uses that email")}`);
  if (id) await db.user.updateMany({ where: { id, businessId: user.businessId }, data });
  else await db.user.create({ data: { ...data, businessId: user.businessId } });
  revalidatePath("/", "layout");
  redirect("/settings/team?saved=1");
}
