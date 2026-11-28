// Interac notices arriving as raw email (Cloudflare Email Routing -> Worker -> POST /api/interac/email).
// Three checks, because anyone can email the inbox a genuine Interac notice that was sent to THEM: the Worker's shared
// secret (the route), a valid DKIM signature from an interac.ca domain aligned with From, and a signed To header
// naming our e-Transfer address. Only "automatically deposited" notices record a payment; anything else
// (deposit-it-yourself links, unmatched payments) goes to the owners.
import { timingSafeEqual } from "node:crypto";
import { dkimVerify } from "mailauth/lib/dkim/verify";
import PostalMime from "postal-mime";
import { business, businessId, db } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { money } from "../money";
import { recordPayment } from "../ops/invoices";
import { queueUnmatched } from "../ops/unmatched";
import { clientName } from "../queries";
import { classifyInterac, matchInvoice, parseInterac } from "./interac";

type Resolver = NonNullable<NonNullable<Parameters<typeof dkimVerify>[1]>["resolver"]>;
type DkimResult = { signingDomain?: string; status?: { result?: string; aligned?: string | false }; signingHeaders?: { headers?: string[] } };

/**
 * Null unless the message carries a passing, From-aligned DKIM signature from interac.ca (or a subdomain). Otherwise
 * the addresses in the To header(s) that signature covers: a To header added or changed afterwards is not in the list.
 */
export async function interacRecipients(raw: string | Buffer, resolver?: Resolver): Promise<string[] | null> {
  const res = await dkimVerify(raw, resolver ? { resolver } : undefined);
  const ok = ((res.results ?? []) as DkimResult[]).filter((r) => r.status?.result === "pass" && !!r.status.aligned && /(^|\.)interac\.ca$/i.test(r.signingDomain ?? ""));
  if (!ok.length) return null;
  return ok.flatMap((r) => (r.signingHeaders?.headers ?? []).filter((h) => /^to\s*:/i.test(h)))
    .flatMap((h) => h.replace(/^to\s*:/i, "").match(/[^\s<>,;:"()]+@[^\s<>,;:"()]+/g) ?? []).map((a) => a.toLowerCase());
}

export const signedByInterac = async (raw: string | Buffer, resolver?: Resolver) => (await interacRecipients(raw, resolver)) !== null;

/** Was it sent to us? `ours` empty (no e-Transfer address configured) = can't tell, so yes. Pure. */
export const addressedToUs = (recipients: string[], ours: string[]) =>
  !ours.length || recipients.some((r) => ours.some((o) => o.trim().toLowerCase() === r));

/** Where clients send e-Transfers: the Settings value and/or ETRANSFER_EMAIL. */
export async function etransferAddresses() {
  return [(await business()).etransferEmail, env.etransferEmail].filter((a): a is string => !!a?.trim());
}

/** Both inbound routes: the Worker's shared secret (INTERAC_INBOUND_SECRET, 16+ chars) in `x-etc-secret`. Unset = closed. */
export function inboundAuthorized(req: Request) {
  const want = Buffer.from(process.env.INTERAC_INBOUND_SECRET ?? ""), got = Buffer.from(req.headers.get("x-etc-secret") ?? "");
  return want.length >= 16 && want.length === got.length && timingSafeEqual(want, got);
}

/** Autodeposit notices say the money is already in the account; others ask the recipient to deposit it. Pure. */
export const autoDeposited = (text: string) => /automatically deposited|has been deposited|deposited into your/i.test(text);

export async function parseRawEmail(raw: string | Buffer) {
  const mail = await PostalMime.parse(raw);
  return { from: mail.from?.address ?? "", subject: mail.subject ?? "", text: mail.text ?? (mail.html ?? "").replace(/<[^>]+>/g, " ") };
}

async function tellOwners(bid: string, title: string, body: string, path = "/invoices?tab=OPEN") {
  for (const to of env.ownerEmails) await enqueue(db, { businessId: bid, template: "owner.notice", to, priority: 3, props: { title, body, path } });
  kickOutbox();
}

/** Shared by both inbound routes: match the notice to an invoice and record it, or hand it to the owners. */
export async function handleInteracNotice(subject: string, text: string, deposited: boolean) {
  const kind = classifyInterac(subject, text);
  if (kind !== "payment") return { ignored: kind === "setup" ? "Autodeposit set-up email (owner has the forwarded copy)" : "not a payment notice" };
  const bid = await businessId();
  const n = parseInterac(subject, text);
  // Payments recorded before the claim row below existed.
  if (n.interacRef && await db.payment.findFirst({ where: { businessId: bid, reference: `Interac ${n.interacRef}` } })) return { duplicate: true };
  const what = `${n.amountCents ? money(n.amountCents) : "An e-Transfer"} from ${n.sender ?? "someone"}`;
  if (!deposited) {
    await tellOwners(bid, `Deposit this e-Transfer: ${what}`, `It wasn't auto-deposited, so it isn't paid yet. Deposit it from the Interac email or your bank, then record it on the invoice.\nMessage: ${n.message ?? "(none)"}`);
    return { matched: null, reason: "not auto-deposited" };
  }
  const note = [n.sender, n.message].filter(Boolean).join(" · ").slice(0, 300);
  // No Interac reference number = nothing to tell a redelivery from a second payment, so never record it automatically.
  if (n.amountCents && n.interacRef) {
    const open = await db.invoice.findMany({ where: { businessId: bid, status: { in: ["AWAITING_PAYMENT", "DRAFT"] } }, include: { client: true } });
    const hit = matchInvoice(n, open.map((i) => ({ id: i.id, etransferRef: i.etransferRef, balanceCents: i.totalCents - i.amountPaidCents, clientName: clientName(i.client), allowPartial: i.allowPartial })));
    const { amountCents, interacRef } = n;
    try {
      // The unique (business, providerRef) row is the claim: a redelivery, or the same notice arriving on the other
      // inbound route at the same moment, fails here and rolls back instead of recording the money twice.
      await db.$transaction(async (tx) => {
        const u = await tx.unmatchedPayment.create({
          data: { businessId: bid, source: "interac", amountCents, sender: n.sender, message: n.message?.slice(0, 500), providerRef: interacRef, ...(hit ? { status: "APPLIED", resolvedAt: new Date() } : {}) },
        });
        if (hit) await recordPayment({ id: null, businessId: bid }, { invoiceId: hit.id, method: "ETRANSFER", amountCents, reference: `Interac ${interacRef}`, note, unmatchedPaymentId: u.id }, tx);
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return { duplicate: true };
      throw e;
    }
    if (hit) {
      kickOutbox(); // the receipt
      return { matched: hit.etransferRef };
    }
  } else if (n.amountCents) {
    await queueUnmatched(bid, { source: "interac", amountCents: n.amountCents, sender: n.sender, message: n.message, providerRef: null });
  }
  await tellOwners(bid, `e-Transfer to match: ${what}`, `We couldn't match it to an invoice automatically. It's waiting in Payments → To match, with suggested invoices.\nMessage: ${n.message ?? "(none)"}`, "/payments/unmatched");
  return { matched: null, queued: !!n.amountCents };
}
