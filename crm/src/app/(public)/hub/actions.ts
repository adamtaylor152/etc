"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { businessId, db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { limited } from "@/server/http";

/** Self-serve hub link. Same answer whether or not the email is a client (no account probing). */
export async function emailHubLink(f: FormData) {
  const email = String(f.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "?";
  if (email && !limited(`hub:${email}`, 3, 3_600_000) && !limited(`hub-ip:${ip}`, 10, 3_600_000)) {
    const bid = await businessId();
    const c = await db.client.findFirst({ where: { businessId: bid, email, archivedAt: null } });
    if (c) {
      await enqueue(db, { businessId: bid, template: "hub.link", to: c.email, replyTo: env.helpEmail, priority: 2, props: { clientId: c.id }, clientId: c.id });
      kickOutbox();
    }
  }
  redirect("/hub?sent=1");
}
