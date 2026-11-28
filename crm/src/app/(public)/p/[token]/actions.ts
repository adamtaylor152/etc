"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { answerPrice } from "@/server/ops/drive-size";
import { peekToken } from "@/server/tokens";

export async function answer(f: FormData) {
  const token = String(f.get("t") ?? "");
  const t = await peekToken(db, token, ["PRICE_CHANGE"]);
  if (t.ok && t.token.jobId) await answerPrice(t.token.jobId, f.get("yes") === "1");
  redirect(`/p/${encodeURIComponent(token)}`);
}
