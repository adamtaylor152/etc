"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { kickOutbox } from "@/server/email/outbox";
import { recordPaymentKeepingExtra } from "@/server/ops/credits";
import { billingRun, deletePayment, invoiceFixedJob, invoiceUnbilled, markSent, sendInvoice, setBadDebt, updateDraftInvoice, voidInvoice } from "@/server/ops/invoices";
import { TransitionError } from "@/server/status/visit";
import { mintToken } from "@/server/tokens";
import { safePath } from "@/server/safe-path";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData) => { const p = str(f, "back"); return safePath(p, "/invoices"); };

async function guard<T>(f: FormData, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TransitionError || e instanceof z.ZodError) {
      const to = back(f);
      redirect(`${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(e instanceof z.ZodError ? "Check the amount" : e.message)}`);
    }
    throw e;
  }
}

export async function invoiceCreate(f: FormData) {
  const user = await requireOwner();
  const inv = await guard(f, () => {
    const jobId = str(f, "jobId") || undefined;
    if (str(f, "fixed") === "1" && jobId) return invoiceFixedJob(user, jobId);
    return invoiceUnbilled(user, { clientId: str(f, "clientId"), jobId, snowEventId: str(f, "snowEventId") || undefined });
  });
  revalidatePath("/", "layout");
  redirect(`/invoices/${inv.id}`);
}

export async function invoiceSend(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => sendInvoice(user, str(f, "id")));
  revalidatePath("/", "layout");
  redirect(`${back(f)}${back(f).includes("?") ? "&" : "?"}sent=1`);
}

/** Save a draft's lines (lineId[] / lineName[] / lineDesc[] / lineQty[] / linePrice[] / lineDate[]), discount, terms and message. */
export async function invoiceUpdate(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id");
  await guard(f, () => {
    const [ids, names, descs, qtys, prices, dates] = ["lineId", "lineName", "lineDesc", "lineQty", "linePrice", "lineDate"].map((k) => f.getAll(k).map(String));
    const dollars = z.coerce.number().min(0).max(100_000);
    // A row with no name is a removed (or never filled) line.
    const lines = names.map((name, i) => ({ i, name })).filter((r) => r.name.trim()).map(({ i, name }) => ({
      id: ids[i] || undefined, name, description: descs[i]?.trim().slice(0, 500), quantity: z.coerce.number().positive().max(10_000).parse(qtys[i]),
      unitPriceCents: Math.round(dollars.parse(prices[i] || 0) * 100), serviceDate: /^\d{4}-\d{2}-\d{2}$/.test(dates[i] ?? "") ? toDbDate(dates[i]) : null,
    }));
    return updateDraftInvoice(user, id, {
      lines, discountCents: Math.round(dollars.parse(str(f, "discount") || 0) * 100),
      paymentTerms: z.enum(["DUE_ON_RECEIPT", "NET_7", "NET_15", "NET_30"]).parse(str(f, "paymentTerms")), message: str(f, "message").slice(0, 2000),
    });
  });
  revalidatePath("/", "layout");
  redirect(`/invoices/${id}`);
}

export async function invoiceMarkSent(f: FormData) {
  const user = await requireOwner();
  await markSent(user, str(f, "id"));
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function invoiceVoid(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => voidInvoice(user, str(f, "id"), str(f, "reason").slice(0, 300)));
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function invoiceBadDebt(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => setBadDebt(user, str(f, "id"), str(f, "bad") === "1"));
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function paymentRecord(f: FormData) {
  const user = await requireOwner();
  await guard(f, async () => {
    const amountCents = Math.round(z.coerce.number().positive().max(100_000).parse(str(f, "amount")) * 100);
    const method = z.enum(["CASH", "ETRANSFER", "CHEQUE", "OTHER"]).parse(str(f, "method"));
    // More than the balance is refused unless the owner ticked "keep the extra as account credit".
    await recordPaymentKeepingExtra(user, { invoiceId: str(f, "invoiceId"), method, amountCents, reference: str(f, "reference").slice(0, 100), note: str(f, "note").slice(0, 300), keepExtra: str(f, "keepExtra") === "on" });
  });
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function paymentDelete(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => deletePayment(user, str(f, "id")));
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function runBilling(f: FormData) {
  const user = await requireOwner();
  const n = await guard(f, () => billingRun(user));
  revalidatePath("/", "layout");
  redirect(`/billing?made=${n}`);
}

/** Billing run: send the ticked drafts (id[]). */
export async function sendDrafts(f: FormData) {
  const user = await requireOwner();
  const drafts = await db.invoice.findMany({ where: { businessId: user.businessId, status: "DRAFT", id: { in: f.getAll("id").map(String) } }, select: { id: true }, orderBy: { number: "asc" } });
  await guard(f, async () => {
    if (!drafts.length) throw new TransitionError("Tick at least one draft to send");
    for (const d of drafts) await sendInvoice(user, d.id);
  });
  kickOutbox();
  revalidatePath("/", "layout");
  redirect(`/billing?sent=${drafts.length}`);
}

/** Open the client's view of an invoice (mints a fresh link). */
export async function viewAsClient(f: FormData) {
  const user = await requireOwner();
  const inv = await db.invoice.findFirstOrThrow({ where: { id: str(f, "id"), businessId: user.businessId } });
  redirect(`/i/${await mintToken(db, user.businessId, "INVOICE", { invoiceId: inv.id, clientId: inv.clientId })}`);
}
