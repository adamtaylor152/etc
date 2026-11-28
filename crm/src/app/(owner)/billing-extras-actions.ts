"use server";
// Refunds, account credits and emailing a statement.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { addCredit, removeCredit } from "@/server/ops/credits";
import { billingEmailFor } from "@/server/ops/invoices";
import { refundPayment } from "@/server/ops/refunds";
import { parseStatementRange, statementQuery } from "@/server/statement";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData) => { const p = str(f, "back"); return p.startsWith("/") && !p.startsWith("//") ? p : "/invoices"; };
const withQuery = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;
const cents = (v: string) => Math.round(z.coerce.number().positive().max(100_000).parse(v) * 100);

async function guard(f: FormData, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TransitionError || e instanceof z.ZodError) redirect(withQuery(back(f), `error=${encodeURIComponent(e instanceof z.ZodError ? "Check the amount" : e.message)}`));
    throw e;
  }
}

/** Refund part or all of a payment (id, amount, already = refunded cents the form showed, reason). */
export async function paymentRefund(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => refundPayment(user, {
    paymentId: str(f, "id"), amountCents: cents(str(f, "amount")), expectRefundedCents: z.coerce.number().int().min(0).parse(str(f, "already") || 0), reason: str(f, "reason").slice(0, 200) || undefined,
  }));
  revalidatePath("/", "layout");
  redirect(withQuery(back(f), "refunded=1"));
}

export async function creditAdd(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => addCredit(user, { clientId: str(f, "clientId"), amountCents: cents(str(f, "amount")), reason: str(f, "reason") }));
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function creditRemove(f: FormData) {
  const user = await requireOwner();
  await guard(f, () => removeCredit(user, str(f, "id")));
  revalidatePath("/", "layout");
  redirect(back(f));
}

/** Email the statement on screen (same range) to the client's billing contact, PDF attached. */
export async function statementEmail(f: FormData) {
  const user = await requireOwner();
  const clientId = str(f, "clientId");
  const range = parseStatementRange({ range: str(f, "range"), from: str(f, "from") });
  const page = `/clients/${clientId}/statement?${statementQuery(range)}`;
  const client = await db.client.findFirst({ where: { id: clientId, businessId: user.businessId } });
  if (!client) redirect("/clients");
  const to = await billingEmailFor(db, client);
  if (!to.trim()) redirect(`${page}&error=${encodeURIComponent("This client has no email address")}`);
  await enqueue(db, {
    businessId: user.businessId, template: "client.statement", to, replyTo: env.helpEmail, priority: 3, props: { clientId, ...range },
    dedupeKey: `statement:${clientId}:${Date.now()}`, clientId, entityType: "Client", entityId: clientId,
  });
  kickOutbox();
  redirect(`${page}&sent=${encodeURIComponent(to)}`);
}
