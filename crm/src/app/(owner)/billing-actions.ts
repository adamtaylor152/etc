"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { kickOutbox } from "@/server/email/outbox";
import { billingRun, deletePayment, invoiceFixedJob, invoiceUnbilled, markSent, recordPayment, sendInvoice, setBadDebt, voidInvoice } from "@/server/ops/invoices";
import { TransitionError } from "@/server/status/visit";
import { mintToken } from "@/server/tokens";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData) => { const p = str(f, "back"); return p.startsWith("/") && !p.startsWith("//") ? p : "/invoices"; };

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
    await recordPayment(user, { invoiceId: str(f, "invoiceId"), method, amountCents, reference: str(f, "reference").slice(0, 100), note: str(f, "note").slice(0, 300) });
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

export async function sendAllDrafts(f: FormData) {
  const user = await requireOwner();
  const drafts = await db.invoice.findMany({ where: { businessId: user.businessId, status: "DRAFT" }, select: { id: true } });
  await guard(f, async () => { for (const d of drafts) await sendInvoice(user, d.id); });
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
