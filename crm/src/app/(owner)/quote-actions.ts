"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { archiveQuote, convertQuote, createQuote, declineQuote, markQuoteApproved, reopenQuote, saveQuoteTemplate, sendQuote, updateQuote, type QuoteLineInput } from "@/server/ops/quotes";
import { OPTION_KEYS } from "@/server/status/quote";
import { TransitionError } from "@/server/status/visit";
import { mintToken } from "@/server/tokens";
import { safePath } from "@/server/safe-path";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData, fallback: string) => { const p = s(f, "back"); return safePath(p, fallback); };

/** Indexed rows: line_0_name, line_0_qty, line_0_price, line_0_optional, line_0_selected, line_0_option, line_0_photo... Blank names are skipped. */
function parseLines(f: FormData): QuoteLineInput[] {
  const out: QuoteLineInput[] = [];
  for (let i = 0; i < 40; i++) {
    const name = s(f, `line_${i}_name`);
    if (!name) continue;
    out.push({
      name: name.slice(0, 200), description: s(f, `line_${i}_desc`).slice(0, 500),
      quantity: z.coerce.number().positive().max(10_000).parse(s(f, `line_${i}_qty`) || "1"),
      unitPriceCents: Math.round(z.coerce.number().min(0).max(100_000).parse(s(f, `line_${i}_price`) || "0") * 100),
      isOptional: f.get(`line_${i}_optional`) === "on", isSelected: f.get(`line_${i}_selected`) === "on",
      optionKey: OPTION_KEYS.find((k) => k === s(f, `line_${i}_option`)) ?? null, photoId: s(f, `line_${i}_photo`) || null,
    });
  }
  return out;
}

/** opt_a_name ... opt_d_name plus the opt_recommended radio. Options no line uses are dropped when the quote is saved. */
const parseOptions = (f: FormData) => OPTION_KEYS.map((key) => ({ key, name: s(f, `opt_${key}_name`), recommended: s(f, "opt_recommended") === key }));

async function guard(f: FormData, fallback: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TransitionError || e instanceof z.ZodError) {
      const to = back(f, fallback);
      redirect(`${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(e instanceof z.ZodError ? "Check the prices and quantities" : e.message)}`);
    }
    throw e;
  }
}

export async function quoteCreate(f: FormData) {
  const user = await requireOwner();
  let id = "";
  await guard(f, `/quotes/new?client=${encodeURIComponent(s(f, "clientId"))}`, async () => {
    id = (await createQuote(user, {
      clientId: s(f, "clientId"), propertyId: s(f, "propertyId") || null, requestId: s(f, "requestId") || null,
      title: z.string().min(1).max(150).parse(s(f, "title")), message: s(f, "message").slice(0, 3000), lines: parseLines(f), options: parseOptions(f),
      from: { templateId: s(f, "templateId") || undefined, quoteId: s(f, "similarId") || undefined },
    })).id;
  });
  revalidatePath("/", "layout");
  redirect(`/quotes/${id}`);
}

export async function quoteUpdate(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  const percent = s(f, "discountType") === "PERCENT";
  const via = s(f, "send") === "sms" ? "SMS" : "EMAIL";
  await guard(f, `/quotes/${id}`, () => updateQuote(user, id, {
    title: z.string().min(1).max(150).parse(s(f, "title")), message: s(f, "message").slice(0, 3000),
    validUntil: s(f, "validUntil") || null,
    // x100 either way: dollars -> cents, percent -> hundredths of a percent
    discount: { type: percent ? "PERCENT" : "FIXED", value: Math.round(z.coerce.number().min(0).max(percent ? 100 : 100_000).parse(s(f, "discount") || "0") * 100) },
    lines: parseLines(f), options: parseOptions(f),
    deposit: { type: s(f, "depositType"), value: s(f, "depositType") === "FIXED" ? Math.round(Number(s(f, "depositValue") || 0) * 100) : Number(s(f, "depositValue") || 0), required: f.get("depositRequired") === "on" },
  }));
  if (f.get("send")) await guard(f, `/quotes/${id}`, () => sendQuote(user, id, via));
  revalidatePath("/", "layout");
  redirect(`/quotes/${id}${f.get("send") ? `?sent=${via === "SMS" ? "text" : "1"}` : "?saved=1"}`);
}

export async function quoteSend(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  const via = s(f, "via") === "SMS" ? "SMS" : "EMAIL";
  await guard(f, `/quotes/${id}`, () => sendQuote(user, id, via));
  revalidatePath("/", "layout");
  redirect(`/quotes/${id}?sent=${via === "SMS" ? "text" : "1"}`);
}

/** Owner marks a quote declined / lost (the client said no by phone, went elsewhere...). */
export async function quoteDecline(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  await guard(f, `/quotes/${id}`, () => declineQuote(id, s(f, "reason").slice(0, 2000), user));
  revalidatePath("/", "layout");
  redirect(`/quotes/${id}`);
}

export async function quoteReopen(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  await guard(f, `/quotes/${id}`, () => reopenQuote(user, id));
  revalidatePath("/", "layout");
  redirect(`/quotes/${id}`);
}

export async function quoteSaveTemplate(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  const name = s(f, "name").slice(0, 80);
  await guard(f, `/quotes/${id}`, async () => {
    if (!name) throw new TransitionError("Give the template a name");
    await saveQuoteTemplate(user, id, name);
  });
  redirect(`/quotes/${id}?template=1`);
}

export async function quoteMarkApproved(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  await guard(f, `/quotes/${id}`, () => markQuoteApproved(user, id, s(f, "option")));
  revalidatePath("/", "layout");
  redirect(`/quotes/${id}`);
}

export async function quoteConvert(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  let jobId = "";
  await guard(f, `/quotes/${id}`, async () => {
    const date = s(f, "date");
    const job = await convertQuote(user, id, { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, billingType: s(f, "billingType") === "FIXED_PRICE" ? "FIXED_PRICE" : "PER_VISIT", skipDeposit: f.get("skipDeposit") === "on" });
    jobId = job.id;
  });
  revalidatePath("/", "layout");
  redirect(`/jobs/${jobId}`);
}

export async function quoteArchive(f: FormData) {
  const user = await requireOwner();
  const id = s(f, "id");
  await guard(f, `/quotes/${id}`, () => archiveQuote(user, id));
  revalidatePath("/", "layout");
  redirect("/quotes");
}

export async function quoteViewAsClient(f: FormData) {
  const user = await requireOwner();
  const q = await db.quote.findFirstOrThrow({ where: { id: s(f, "id"), businessId: user.businessId } });
  redirect(`/q/${await mintToken(db, user.businessId, "QUOTE", { quoteId: q.id, clientId: q.clientId })}`);
}

export async function sendHubLink(f: FormData) {
  const user = await requireOwner();
  const c = await db.client.findFirstOrThrow({ where: { id: s(f, "clientId"), businessId: user.businessId } });
  await enqueue(db, { businessId: user.businessId, template: "hub.link", to: c.email, replyTo: env.helpEmail, priority: 3, props: { clientId: c.id }, clientId: c.id });
  kickOutbox();
  redirect(`/clients/${c.id}?hub=sent`);
}
