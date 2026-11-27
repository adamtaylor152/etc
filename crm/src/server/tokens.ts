// Link tokens: 32 random bytes (base64url) in the link, only the sha256 in the DB.
// Used for owner login, owner deep links from emails, and every customer-facing page (quote, invoice, upload, hub).
import { createHash, randomBytes } from "node:crypto";
import type { LinkToken, TokenPurpose } from "@/generated/prisma/client";
import type { Db } from "./db";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newRawToken = () => randomBytes(32).toString("base64url");

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const TOKEN_RULES: Record<TokenPurpose, { ttlMs: number; maxUses: number | null }> = {
  LOGIN: { ttlMs: 20 * MINUTE, maxUses: 1 },
  OWNER_DEEP_LINK: { ttlMs: 7 * DAY, maxUses: 10 },
  QUOTE: { ttlMs: 60 * DAY, maxUses: null },
  INVOICE: { ttlMs: 180 * DAY, maxUses: null },
  CLIENT_HUB: { ttlMs: 90 * DAY, maxUses: null },
  PHOTO_UPLOAD: { ttlMs: 14 * DAY, maxUses: null },
  VISIT_REPORT: { ttlMs: 365 * DAY, maxUses: null },
};

type Refs = Partial<Pick<LinkToken, "userId" | "clientId" | "requestId" | "quoteId" | "invoiceId" | "jobId" | "visitId" | "redirectPath">>;

export async function mintToken(db: Db, businessId: string, purpose: TokenPurpose, refs: Refs = {}, now = new Date()) {
  const raw = newRawToken();
  const rule = TOKEN_RULES[purpose];
  await db.linkToken.create({
    data: { businessId, purpose, tokenHash: sha256(raw), expiresAt: new Date(now.getTime() + rule.ttlMs), maxUses: rule.maxUses, ...refs },
  });
  return raw;
}

export type TokenProblem = "missing" | "wrong_purpose" | "revoked" | "expired" | "used_up";

/** Pure check, unit-tested. */
export function checkToken(row: Pick<LinkToken, "purpose" | "revokedAt" | "expiresAt" | "maxUses" | "useCount"> | null,
                           purposes: TokenPurpose[], now = new Date()): TokenProblem | null {
  if (!row) return "missing";
  if (!purposes.includes(row.purpose)) return "wrong_purpose";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt <= now) return "expired";
  if (row.maxUses != null && row.useCount >= row.maxUses) return "used_up";
  return null;
}

/** Look up without using it (GET pages). */
export async function peekToken(db: Db, raw: string, purposes: TokenPurpose[]) {
  const row = raw ? await db.linkToken.findUnique({ where: { tokenHash: sha256(raw) } }) : null;
  const problem = checkToken(row, purposes);
  return problem ? { ok: false as const, problem } : { ok: true as const, token: row! };
}

/** Use it (POST). The conditional update makes concurrent double-use safe for single-use tokens. */
export async function consumeToken(db: Db, raw: string, purposes: TokenPurpose[]) {
  const peek = await peekToken(db, raw, purposes);
  if (!peek.ok) return peek;
  const t = peek.token;
  const res = await db.linkToken.updateMany({
    where: { id: t.id, useCount: t.useCount, revokedAt: null },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  return res.count === 1 ? peek : { ok: false as const, problem: "used_up" as TokenProblem };
}
