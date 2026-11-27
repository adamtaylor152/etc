"use server";
import { redirect } from "next/navigation";
import { createSession, safeNext, signOut } from "@/server/auth";
import { db } from "@/server/db";
import { consumeToken } from "@/server/tokens";

export async function continueSignIn(form: FormData) {
  const res = await consumeToken(db, String(form.get("t") ?? ""), ["LOGIN", "OWNER_DEEP_LINK"]);
  if (!res.ok || !res.token.userId) redirect("/login?error=link");
  const user = await db.user.findUnique({ where: { id: res.token.userId } });
  if (!user?.active || user.businessId !== res.token.businessId) redirect("/login?error=link");
  await createSession(user.id, user.businessId);
  redirect(safeNext(res.token.redirectPath));
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
