"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { checkoutForInvoice, stripeEnabled } from "@/server/stripe";
import { peekToken } from "@/server/tokens";

/** Creates a Checkout Session for the current balance only when the client clicks Pay. */
export async function payByCard(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["INVOICE"]);
  if (!t.ok || !t.token.invoiceId || !stripeEnabled()) redirect(`/i/${encodeURIComponent(token)}`);
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: t.token.invoiceId }, include: { client: true } });
  const balance = inv.totalCents - inv.amountPaidCents;
  if (inv.status !== "AWAITING_PAYMENT" || balance < 50) redirect(`/i/${token}`); // Stripe's minimum is $0.50
  let url: string | null = null;
  try {
    const s = await checkoutForInvoice({ id: inv.id, businessId: inv.businessId, number: inv.number, balanceCents: balance, email: inv.client.email }, token);
    await db.invoice.update({ where: { id: inv.id }, data: { stripeCheckoutSessionId: s.id } });
    url = s.url;
  } catch (e) {
    console.error("stripe checkout failed", e);
  }
  redirect(url ?? `/i/${token}?error=${encodeURIComponent("Card payments aren't working right now. Please try e-Transfer or cash.")}`);
}
