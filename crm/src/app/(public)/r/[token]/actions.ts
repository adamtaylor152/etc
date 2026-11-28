"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { leaveFeedback, rate } from "@/server/ops/marketing";
import { peekToken } from "@/server/tokens";

async function reviewFor(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["REVIEW"]);
  if (!t.ok || !t.token.redirectPath) redirect(`/r/${encodeURIComponent(token)}`);
  return { token, reviewId: t.token.redirectPath };
}

export async function rateAction(f: FormData) {
  const { token, reviewId } = await reviewFor(f);
  const r = await db.reviewRequest.findUnique({ where: { id: reviewId } });
  if (r && !r.rating) await rate(reviewId, Number(f.get("rating") ?? 0));
  redirect(`/r/${token}`);
}

export async function feedbackAction(f: FormData) {
  const { token, reviewId } = await reviewFor(f);
  const text = String(f.get("feedback") ?? "").trim();
  if (text) await leaveFeedback(reviewId, text);
  redirect(`/r/${token}?sent=1`);
}
