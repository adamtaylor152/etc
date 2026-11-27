// Interac notices arriving as raw email (Cloudflare Email Routing -> Worker -> POST /api/interac/email).
// Trust comes from the email itself: a valid DKIM signature from an interac.ca domain, aligned with From.
// No shared secret to store anywhere. Only "automatically deposited" notices record a payment; anything
// else (deposit-it-yourself links, unmatched payments) goes to the owners.
import { dkimVerify } from "mailauth/lib/dkim/verify";
import PostalMime from "postal-mime";
import { businessId, db } from "../db";
import { enqueue, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { money } from "../money";
import { recordPayment } from "../ops/invoices";
import { clientName } from "../queries";
import { matchInvoice, parseInterac } from "./interac";

type Resolver = NonNullable<NonNullable<Parameters<typeof dkimVerify>[1]>["resolver"]>;

/** True when the message carries a passing, From-aligned DKIM signature from interac.ca (or a subdomain). */
export async function signedByInterac(raw: string | Buffer, resolver?: Resolver): Promise<boolean> {
  const res = await dkimVerify(raw, resolver ? { resolver } : undefined);
  return (res.results ?? []).some((r: { signingDomain?: string; status?: { result?: string; aligned?: string | false } }) =>
    r.status?.result === "pass" && !!r.status.aligned && /(^|\.)interac\.ca$/i.test(r.signingDomain ?? ""));
}

/** Autodeposit notices say the money is already in the account; others ask the recipient to deposit it. Pure. */
export const autoDeposited = (text: string) => /automatically deposited|has been deposited|deposited into your/i.test(text);

export async function parseRawEmail(raw: string | Buffer) {
  const mail = await PostalMime.parse(raw);
  return { from: mail.from?.address ?? "", subject: mail.subject ?? "", text: mail.text ?? (mail.html ?? "").replace(/<[^>]+>/g, " ") };
}

async function tellOwners(bid: string, title: string, body: string) {
  for (const to of env.ownerEmails) await enqueue(db, { businessId: bid, template: "owner.notice", to, priority: 3, props: { title, body, path: "/invoices?tab=OPEN" } });
  kickOutbox();
}

/** Shared by both inbound routes: match the notice to an invoice and record it, or hand it to the owners. */
export async function handleInteracNotice(subject: string, text: string, deposited: boolean) {
  const bid = await businessId();
  const n = parseInterac(subject, text);
  if (n.interacRef && await db.payment.findFirst({ where: { businessId: bid, reference: `Interac ${n.interacRef}` } })) return { duplicate: true };
  const what = `${n.amountCents ? money(n.amountCents) : "An e-Transfer"} from ${n.sender ?? "someone"}`;
  if (!deposited) {
    await tellOwners(bid, `Deposit this e-Transfer: ${what}`, `It wasn't auto-deposited, so it isn't paid yet. Deposit it from the Interac email or your bank, then record it on the invoice.\nMessage: ${n.message ?? "(none)"}`);
    return { matched: null, reason: "not auto-deposited" };
  }
  const open = await db.invoice.findMany({ where: { businessId: bid, status: { in: ["AWAITING_PAYMENT", "DRAFT"] } }, include: { client: true } });
  const hit = matchInvoice(n, open.map((i) => ({ id: i.id, etransferRef: i.etransferRef, balanceCents: i.totalCents - i.amountPaidCents, clientName: clientName(i.client) })));
  if (hit && n.amountCents) {
    await recordPayment({ id: null, businessId: bid }, {
      invoiceId: hit.id, method: "ETRANSFER", amountCents: n.amountCents,
      reference: n.interacRef ? `Interac ${n.interacRef}` : "Interac (auto)", note: [n.sender, n.message].filter(Boolean).join(" · ").slice(0, 300),
    });
    return { matched: hit.etransferRef };
  }
  await tellOwners(bid, `e-Transfer to match: ${what}`, `We couldn't match it to an invoice automatically. Record it on the right invoice.\nMessage: ${n.message ?? "(none)"}`);
  return { matched: null };
}
