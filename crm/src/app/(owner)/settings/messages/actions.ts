"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { enqueue, kickOutbox, renderMessage } from "@/server/email/outbox";
import { allowedVars, emailMeta, SMS_META, smsMeta, unknownVars, withRequired, type EmailKey, type SmsKey } from "@/server/email/wording";
import { MediaError, saveLogo } from "@/server/media";
import { SettingsSchema, type Settings } from "@/server/settings";

const PAGE = "/settings/messages";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\r\n/g, "\n").trim();
const fail = (msg: string, hash = ""): never => redirect(`${PAGE}?error=${encodeURIComponent(msg)}${hash}`);

/** The editor's fields for one email, blank = the built-in wording. */
function wording(f: FormData, key: string) {
  const meta = emailMeta(key) ?? fail("That email can't be changed here");
  return { subject: s(f, "subject").replace(/\s+/g, " ").slice(0, 150) || null, intro: s(f, "intro").slice(0, 2000) || null, closing: (meta.closing && s(f, "closing").slice(0, 1000)) || null };
}

export async function saveWording(f: FormData) {
  const user = await requireOwner();
  const key = s(f, "key"), sms = smsMeta(key);
  let data: { subject: string | null; intro: string | null; closing: string | null; body: string | null };
  if (sms) {
    // Stored with the required parts already put back, so what the owner sees saved is what goes out.
    const body = s(f, "body") ? withRequired(s(f, "body").slice(0, 600), key as SmsKey).body : "";
    data = { subject: null, intro: null, closing: null, body: body && body !== SMS_META[key as SmsKey].text ? body : null };
  } else data = { ...wording(f, key), body: null };
  const where = { businessId: user.businessId, template: key };
  if (Object.values(data).every((v) => v === null)) await db.emailTemplateOverride.deleteMany({ where });
  else await db.emailTemplateOverride.upsert({ where: { businessId_template: where }, create: { ...where, ...data }, update: { ...data, enabled: true } });
  const unknown = unknownVars(Object.values(data).join(" "), allowedVars(key));
  redirect(`${PAGE}?saved=${key}${unknown.length ? `&unknown=${unknown.join(",")}` : ""}#${key}`);
}

export async function resetWording(f: FormData) {
  const user = await requireOwner();
  await db.emailTemplateOverride.deleteMany({ where: { businessId: user.businessId, template: s(f, "key") } });
  redirect(`${PAGE}?saved=${s(f, "key")}#${s(f, "key")}`);
}

/** The email as a client would get it, made-up details, with what is in the editor right now (saved or not). */
export async function previewWording(_prev: unknown, f: FormData) {
  const user = await requireOwner();
  const key = s(f, "key") as EmailKey;
  const w = wording(f, key);
  const m = await renderMessage({ template: "owner.template_test", props: { template: key, wording: w }, businessId: user.businessId, to: user.email });
  return { html: m.html, subject: m.subject?.replace(/^Test: /, "") };
}

/** Email that same preview to the signed-in owner, through the outbox like any other email. No redirect: the editor keeps what was typed. */
export async function sendTest(_prev: unknown, f: FormData) {
  const user = await requireOwner();
  const key = s(f, "key") as EmailKey;
  await enqueue(db, { businessId: user.businessId, template: "owner.template_test", to: user.email, priority: 3, props: { template: key, wording: wording(f, key) } });
  kickOutbox();
  return { to: user.email, at: Date.now() };
}

async function patchSettings(businessId: string, patch: Partial<Record<keyof Settings, unknown>>) {
  const biz = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const next = SettingsSchema.safeParse({ ...(biz.settings as object), ...patch });
  if (!next.success) return fail(next.error.issues[0].message);
  await db.business.update({ where: { id: biz.id }, data: { settings: next.data as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
}

/** Colour and/or a new logo. `reset` names what goes back to the etc. look: "color" or "logo". */
export async function saveBrand(f: FormData) {
  const user = await requireOwner();
  const reset = s(f, "reset"), file = f.get("logo");
  const patch: Partial<Record<keyof Settings, unknown>> = reset === "color" ? { brandColor: null } : reset === "logo" ? { logoId: null } : { brandColor: s(f, "brandColor").toLowerCase().replace("#1d6fd8", "") || null }; // etc. blue = no colour of their own
  if (!reset && file instanceof File && file.size > 0) {
    try {
      // The old logo's file stays: emails already sent still point at it.
      patch.logoId = (await saveLogo(user.businessId, { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type }, user.id)).id;
    } catch (e) {
      if (e instanceof MediaError) fail(e.message);
      throw e;
    }
  }
  await patchSettings(user.businessId, patch);
  redirect(`${PAGE}?saved=brand`);
}

export async function saveQuickReplies(f: FormData) {
  const user = await requireOwner();
  const quickReplies = f.getAll("reply").map((v) => String(v).trim()).filter(Boolean);
  await patchSettings(user.businessId, { quickReplies: quickReplies.length ? quickReplies : undefined }); // none left = back to the built-in four
  redirect(`${PAGE}?saved=replies#replies`);
}
