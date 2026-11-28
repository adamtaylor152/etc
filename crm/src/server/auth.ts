// Sessions. Cookie holds a random value; the DB holds its sha256.
// Checked in every layout, page, action and route (a layout alone does not stop its pages rendering).
// requireOwner is the default; tests/unit/crew-access.test.ts fails if a page, action or route skips it.
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { env } from "./env";
import { newRawToken, sha256 } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;
const cookieName = () => (env.secure ? "__Host-etc_session" : "etc_session");

export async function createSession(userId: string, businessId: string) {
  const raw = newRawToken();
  const h = await headers();
  await db.session.create({
    data: {
      id: sha256(raw), userId, businessId, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
      userAgent: h.get("user-agent")?.slice(0, 300), ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim(),
    },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(cookieName(), raw, {
    httpOnly: true, secure: env.secure, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export const currentUser = cache(async () => {
  const raw = (await cookies()).get(cookieName())?.value;
  if (!raw) return null;
  const s = await db.session.findUnique({ where: { id: sha256(raw) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  if (Date.now() - s.lastSeenAt.getTime() > DAY) {
    // sliding expiry, at most one write a day
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) } });
  }
  return s.user;
});

/** Anyone signed in, crew included. Only the crew surface uses this: the route runner, its API and photo uploads. */
export async function requireUser(next?: string) {
  const u = await currentUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return u;
}

/** Owners only. Crew are sent to their route: they never see prices, billing, clients or settings. */
export async function requireOwner(next?: string) {
  const u = await requireUser(next);
  if (u.role !== "OWNER") redirect("/run");
  return u;
}

/** For API routes: the signed-in owner, or null (crew and signed-out callers alike). */
export async function currentOwner() {
  const u = await currentUser();
  return u?.role === "OWNER" ? u : null;
}

export async function signOut() {
  const jar = await cookies();
  const raw = jar.get(cookieName())?.value;
  if (raw) await db.session.deleteMany({ where: { id: sha256(raw) } });
  jar.delete(cookieName());
}

/** Only allow in-app relative redirects. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
