"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveSignature } from "@/server/ops/signatures";
import { TransitionError } from "@/server/status/visit";
import { tipCents } from "@/server/billing/adjustments";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { checkoutForInvoice, stripeEnabled } from "@/server/stripe";
import { peekToken } from "@/server/tokens";

/** Creates a Checkout Session for the current balance only when the client clicks Pay. */
export async function payByCard(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["INVOICE"]);
  if (!t.ok || !t.token.invoiceId || !stripeEnabled()) redirect(`/i/${encodeURIComponent(token)}`);
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: t.token.invoiceId }, include: { client: true } });
  const owed = inv.totalCents - inv.amountPaidCents;
  // Partial payments (when allowed): any amount from $0.50 up to the balance.
  const asked = inv.allowPartial && f.get("amount") ? Math.round(Number(f.get("amount")) * 100) : owed;
  const balance = Number.isFinite(asked) ? Math.min(owed, Math.max(50, asked)) : owed;
  if (inv.status !== "AWAITING_PAYMENT" || balance < 50) redirect(`/i/${token}`); // Stripe's minimum is $0.50
  // Optional tip, only when the business turned tips on: a preset percent, or the amount typed under "Other" when no preset is picked.
  const tip = (await getSettings(db, inv.businessId)).tipsEnabled ? tipCents(inv.totalCents, String(f.get("tip") || (f.get("tipCustom") ? "custom" : "")), String(f.get("tipCustom") ?? "")) : 0;
  let url: string | null = null;
  try {
    const s = await checkoutForInvoice({ id: inv.id, businessId: inv.businessId, number: inv.number, balanceCents: balance, email: inv.client.email, tipCents: tip }, token);
    await db.invoice.update({ where: { id: inv.id }, data: { stripeCheckoutSessionId: s.id } });
    url = s.url;
  } catch (e) {
    console.error("stripe checkout failed", e);
  }
  redirect(url ?? `/i/${token}?error=${encodeURIComponent("Card payments aren't working right now. Please try e-Transfer or cash.")}`);
}

/** Optional "sign to confirm" on the invoice page. */
export async function clientSignInvoice(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["INVOICE"]);
  if (!t.ok || !t.token.invoiceId) redirect(`/i/${encodeURIComponent(token)}`);
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: t.token.invoiceId } });
  const h = await headers();
  try {
    await saveSignature({ businessId: inv.businessId, kind: "INVOICE", invoiceId: inv.id, clientId: inv.clientId, dataUrl: String(f.get("signature") ?? ""), signerName: String(f.get("name") ?? ""), ip: h.get("cf-connecting-ip"), userAgent: h.get("user-agent"), inPerson: false });
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/i/${encodeURIComponent(token)}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/i/${encodeURIComponent(token)}?signed=1`);
}
