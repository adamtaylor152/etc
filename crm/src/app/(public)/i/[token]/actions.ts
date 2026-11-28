"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveSignature } from "@/server/ops/signatures";
import { TransitionError } from "@/server/status/visit";
import { db } from "@/server/db";
import { cardsOffered, customerFor } from "@/server/ops/autopay";
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
  // A deposit paid from its quote's page (right after approving) comes back to that page.
  const qt = String(f.get("q") ?? "");
  const q = qt ? await peekToken(db, qt, ["QUOTE"]) : null;
  const back = q?.ok && inv.quoteId && q.token.quoteId === inv.quoteId ? `/q/${qt}` : `/i/${token}`;
  let url: string | null = null;
  try {
    // "Save this card" / "charge it automatically" (the client's own tick boxes): Checkout keeps the card on their Stripe Customer.
    const autoPay = f.get("autopay") === "on";
    const keep = (autoPay || f.get("save") === "on") && !inv.client.cardPaymentMethodId && (await cardsOffered(inv.businessId));
    const save = keep ? { customerId: await customerFor(inv.client), clientId: inv.clientId, autoPay } : undefined;
    const s = await checkoutForInvoice({ id: inv.id, businessId: inv.businessId, number: inv.number, balanceCents: balance, email: inv.client.email }, back, save);
    await db.invoice.update({ where: { id: inv.id }, data: { stripeCheckoutSessionId: s.id } });
    url = s.url;
  } catch (e) {
    console.error("stripe checkout failed", e);
  }
  redirect(url ?? `${back}?error=${encodeURIComponent("Card payments aren't working right now. Please try e-Transfer or cash.")}`);
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
