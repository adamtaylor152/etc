"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/server/auth";
import { businessId, db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { limited } from "@/server/http";

export async function requestLogin(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const next = safeNext(String(form.get("next") ?? "/"));
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "?";
  // Same answer whether or not the email is an owner, so the page never reveals who has access.
  if (email && !(await limited(`login:${email}`, 5, 900_000)) && !(await limited(`login-ip:${ip}`, 20, 900_000))) {
    const bid = await businessId();
    const user = await db.user.findFirst({ where: { businessId: bid, email, active: true } });
    if (user) {
      await enqueue(db, { businessId: bid, template: "owner.login", to: user.email, priority: 1, props: { userId: user.id, next } });
      kickOutbox();
    }
  }
  redirect("/login/sent");
}
