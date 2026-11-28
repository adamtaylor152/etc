"use server";
import { headers } from "next/headers";
import { saveSignature } from "@/server/ops/signatures";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { approveQuote, declineQuote, requestQuoteChanges } from "@/server/ops/quotes";
import { quoteOptions } from "@/server/status/quote";
import { TransitionError } from "@/server/status/visit";
import { peekToken } from "@/server/tokens";

async function quoteFor(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["QUOTE"]);
  if (!t.ok || !t.token.quoteId) redirect(`/q/${encodeURIComponent(token)}`);
  return { token, quoteId: t.token.quoteId };
}

export async function clientApprove(f: FormData) {
  const { token, quoteId } = await quoteFor(f);
  const h = await headers();
  const name = String(f.get("name") ?? "").trim().slice(0, 100);
  if (!name) redirect(`/q/${token}?error=${encodeURIComponent("Type your name to approve")}`);
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? null;
  const q = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
  // A quote with options needs exactly one of them chosen; the signature below is recorded against that choice.
  const option = String(f.get("option") ?? "");
  const selected = f.getAll("selected").map(String);
  const offered = quoteOptions(q.options);
  if (offered.length && !offered.some((o) => o.key === option)) redirect(`/q/${token}?error=${encodeURIComponent("Choose one of the options to approve")}`);
  // Signature first: a missing/blank one stops the approval before anything changes.
  try {
    await saveSignature({ businessId: q.businessId, kind: "QUOTE", quoteId, clientId: q.clientId, dataUrl: String(f.get("signature") ?? ""), signerName: name, ip, userAgent: h.get("user-agent"), inPerson: false, quoteChoice: offered.length ? { option, selected } : undefined });
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/q/${token}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  try {
    await approveQuote(quoteId, { name, selected, option, ip });
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/q/${token}?error=${encodeURIComponent("This quote can't be approved any more. Give us a call.")}`);
    throw e;
  }
  redirect(`/q/${token}?approved=1`);
}

export async function clientRequestChanges(f: FormData) {
  const { token, quoteId } = await quoteFor(f);
  const message = String(f.get("message") ?? "").trim().slice(0, 2000);
  if (!message) redirect(`/q/${token}?error=${encodeURIComponent("Tell us what you'd like changed")}`);
  try {
    await requestQuoteChanges(quoteId, message);
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/q/${token}?error=${encodeURIComponent("This quote can't be changed any more. Give us a call.")}`);
    throw e;
  }
  redirect(`/q/${token}?changes=1`);
}

/** "No thanks": the reason is optional. The owner is emailed. */
export async function clientDecline(f: FormData) {
  const { token, quoteId } = await quoteFor(f);
  try {
    await declineQuote(quoteId, String(f.get("reason") ?? "").trim().slice(0, 2000));
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/q/${token}?error=${encodeURIComponent("This quote can't be declined any more. Give us a call.")}`);
    throw e;
  }
  redirect(`/q/${token}?declined=1`);
}
