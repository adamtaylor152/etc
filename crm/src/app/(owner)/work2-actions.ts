"use server";
// Manual requests, jobs (with times, people and extra visits), custom invoices, and collecting payment across invoices.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PaymentMethod } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { fromLocalInput } from "@/server/dates";
import { db } from "@/server/db";
import { createCustomInvoice, recordPayment } from "@/server/ops/invoices";
import { createOneOffJob } from "@/server/ops/jobs";
import { createRequest } from "@/server/ops/requests";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const cents = (v: string) => Math.round(Number(v || 0) * 100);
const day = /^\d{4}-\d{2}-\d{2}$/;
function fail(path: string, e: unknown): never {
  if (e instanceof TransitionError || e instanceof z.ZodError) redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the form" : e.message)}`);
  throw e;
}
/** Repeated line rows: lineName[], lineQty[], linePrice[] (dollars). */
const linesFrom = (f: FormData) => {
  const names = f.getAll("lineName").map(String), qtys = f.getAll("lineQty").map(String), prices = f.getAll("linePrice").map(String), descs = f.getAll("lineDesc").map(String);
  return names.map((name, i) => ({ name: name.trim(), description: descs[i]?.trim() || undefined, quantity: Number(qtys[i] || 1) || 1, unitPriceCents: cents(prices[i]) })).filter((l) => l.name);
};

export async function requestCreate(f: FormData) {
  const user = await requireOwner();
  const back = `/requests/new?client=${str(f, "clientId")}`;
  let id = "";
  try {
    const date = str(f, "assessDate"), time = str(f, "assessTime");
    const at = f.get("assessment") === "on" && day.test(date) ? fromLocalInput(`${date}T${time || "09:00"}`) : null;
    id = (await createRequest(user, {
      clientId: str(f, "clientId"), propertyId: str(f, "propertyId") || null, title: str(f, "title"), details: str(f, "details"),
      services: f.getAll("service").map(String), assessmentAt: at, assigneeIds: f.getAll("userId").map(String),
    })).id;
  } catch (e) { fail(back, e); }
  revalidatePath("/", "layout");
  redirect(`/requests/${id}`);
}

export async function jobCreateFull(f: FormData) {
  const user = await requireOwner();
  const back = `/jobs/new?client=${str(f, "clientId")}`;
  let id = "";
  try {
    const date = str(f, "date");
    if (date && !day.test(date)) throw new TransitionError("Check the date");
    const st = str(f, "startTime"), et = str(f, "endTime");
    const lines = linesFrom(f);
    if (!lines.length) throw new TransitionError("Add at least one line item");
    id = (await createOneOffJob(user, {
      clientId: str(f, "clientId"), propertyId: str(f, "propertyId"), title: z.string().trim().min(1, "Give the job a title").max(120).parse(str(f, "title")),
      instructions: str(f, "instructions").slice(0, 2000), lines, date: f.get("later") === "on" ? null : date || null,
      billingType: str(f, "billingType") === "FIXED_PRICE" ? "FIXED_PRICE" : "PER_VISIT",
      startAt: date && st && f.get("later") !== "on" ? fromLocalInput(`${date}T${st}`) : null, endAt: date && et && f.get("later") !== "on" ? fromLocalInput(`${date}T${et}`) : null,
      moreDates: f.getAll("moreDate").map(String).filter((d) => day.test(d)), assigneeIds: f.getAll("userId").map(String), requestId: str(f, "requestId") || null,
      checklistTemplateId: str(f, "checklistTemplateId") === "none" ? null : str(f, "checklistTemplateId") || undefined,
    })).id;
  } catch (e) { fail(back, e); }
  revalidatePath("/", "layout");
  redirect(`/jobs/${id}`);
}

export async function invoiceCustom(f: FormData) {
  const user = await requireOwner();
  const back = `/invoices/new?client=${str(f, "clientId")}`;
  let id = "";
  try {
    id = (await createCustomInvoice(user, { clientId: str(f, "clientId"), propertyId: str(f, "propertyId") || null, jobId: str(f, "jobId") || null, subject: str(f, "subject"), lines: linesFrom(f) })).id;
  } catch (e) { fail(back, e); }
  revalidatePath("/", "layout");
  redirect(`/invoices/${id}`);
}

const METHODS: PaymentMethod[] = ["CASH", "ETRANSFER", "CHEQUE", "CARD", "OTHER"];

/** Collect payment: one amount per open invoice (Jobber's collect-payment table). */
export async function collectPayments(f: FormData) {
  const user = await requireOwner();
  const clientId = str(f, "clientId");
  const back = `/clients/${clientId}/collect`;
  const method = METHODS.find((m) => m === str(f, "method")) ?? "CASH";
  const when = str(f, "date");
  const ids = f.getAll("invoiceId").map(String);
  const rows = ids.map((id) => ({ id, cents: cents(str(f, `amount_${id}`)) })).filter((r) => r.cents > 0);
  try {
    if (!rows.length) throw new TransitionError("Enter an amount for at least one invoice");
    const open = await db.invoice.findMany({ where: { id: { in: rows.map((r) => r.id) }, businessId: user.businessId, clientId } });
    for (const r of rows) {
      const inv = open.find((i) => i.id === r.id);
      if (!inv) throw new TransitionError("An invoice changed. Refresh and try again.");
      if (r.cents > inv.totalCents - inv.amountPaidCents) throw new TransitionError(`That's more than invoice #${inv.number} owes`);
    }
    for (const r of rows) {
      await recordPayment(user, { invoiceId: r.id, method, amountCents: r.cents, reference: str(f, "reference") || undefined, note: str(f, "note") || undefined, receivedAt: day.test(when) ? fromLocalInput(`${when}T12:00`) ?? undefined : undefined });
    }
  } catch (e) { fail(back, e); }
  revalidatePath("/", "layout");
  redirect(`/clients/${clientId}?paid=1`);
}

export async function invoiceAllowPartial(f: FormData) {
  const user = await requireOwner();
  await db.invoice.updateMany({ where: { id: str(f, "id"), businessId: user.businessId }, data: { allowPartial: str(f, "on") === "1" } });
  revalidatePath(`/invoices/${str(f, "id")}`);
}
