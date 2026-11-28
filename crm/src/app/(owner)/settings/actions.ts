"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { SETTING_LABELS, SettingsSchema } from "@/server/settings";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (v: string) => v || null;

export async function saveBusiness(f: FormData) {
  const user = await requireOwner();
  const num = (k: string) => (s(f, k) ? z.coerce.number().min(-180).max(180).parse(s(f, k)) : null);
  await db.business.update({
    where: { id: user.businessId },
    data: {
      name: z.string().min(1).max(80).parse(s(f, "name")), legalName: opt(s(f, "legalName")), phone: opt(s(f, "phone")),
      helpEmail: opt(s(f, "helpEmail")), etransferEmail: opt(s(f, "etransferEmail")), website: opt(s(f, "website")),
      googleReviewUrl: opt(s(f, "googleReviewUrl")), mailingAddress: opt(s(f, "mailingAddress")), depotAddress: opt(s(f, "depotAddress")), depotLat: num("depotLat"), depotLng: num("depotLng"),
    },
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=business");
}

export async function saveTax(f: FormData) {
  const user = await requireOwner();
  await db.business.update({
    where: { id: user.businessId },
    data: {
      taxRegistered: f.get("taxRegistered") === "on", taxNumber: opt(s(f, "taxNumber")),
      taxRateBps: Math.round(z.coerce.number().min(0).max(30).parse(s(f, "taxRate") || "5") * 100),
      pricesIncludeTax: f.get("pricesIncludeTax") === "on",
      defaultPaymentTerms: z.enum(["DUE_ON_RECEIPT", "NET_7", "NET_15", "NET_30"]).parse(s(f, "terms")),
    },
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=tax");
}

export async function saveAutomations(f: FormData) {
  const user = await requireOwner();
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  // Only the on/off settings live on this form; numbers (review delay, referral amounts) keep their values.
  const toggles = Object.fromEntries(Object.keys(SETTING_LABELS).map((k) => [k, f.get(k) === "on"]));
  const grace = z.coerce.number().int().min(0).max(14).safeParse(s(f, "autoPayGraceDays") || undefined);
  const next = SettingsSchema.parse({ ...(biz.settings as object), ...toggles, ...(grace.success ? { autoPayGraceDays: grace.data } : {}) });
  await db.business.update({ where: { id: biz.id }, data: { settings: next as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
  redirect("/settings?saved=automations");
}

export async function saveSeason(f: FormData) {
  const user = await requireOwner();
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const data = {
    name: z.string().min(1).max(60).parse(s(f, "name")), startsOn: toDbDate(date.parse(s(f, "startsOn"))), endsOn: toDbDate(date.parse(s(f, "endsOn"))),
    defaultTriggerCm: z.coerce.number().int().min(0).max(50).parse(s(f, "defaultTriggerCm")),
  };
  const id = s(f, "id");
  if (id) await db.season.updateMany({ where: { id, businessId: user.businessId }, data });
  else await db.season.create({ data: { ...data, businessId: user.businessId } });
  revalidatePath("/", "layout");
  redirect("/settings?saved=season");
}
