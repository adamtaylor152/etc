"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { businessId, db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { limited } from "@/server/http";

/** Self-serve hub link. Same answer whether or not the email is a client (no account probing). */
export async function emailHubLink(f: FormData) {
  const email = z.email().max(200).safeParse(String(f.get("email") ?? "").trim().toLowerCase()).data;
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "?";
  // The IP limit first: once it trips, this caller stops using up the allowance of the address they typed.
  if (email && !(await limited(`hub-link-ip:${ip}`, 10, 3_600_000)) && !(await limited(`hub-link-email:${email}`, 3, 3_600_000))) {
    const bid = await businessId();
    const c = await db.client.findFirst({ where: { businessId: bid, email, archivedAt: null } });
    if (c) {
      await enqueue(db, { businessId: bid, template: "hub.link", to: c.email, replyTo: env.helpEmail, priority: 2, props: { clientId: c.id }, clientId: c.id });
      kickOutbox();
    }
  }
  redirect("/hub?sent=1");
}
