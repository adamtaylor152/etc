"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { approveQuote, requestQuoteChanges } from "@/server/ops/quotes";
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
  try {
    await approveQuote(quoteId, { name, selected: f.getAll("selected").map(String), ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? null });
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
