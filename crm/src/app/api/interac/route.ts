// Inbound Interac e-Transfer notices (forwarded by a Cloudflare Email Worker, see README).
// Auth: shared secret header. Matched -> e-Transfer payment recorded (receipt emailed). Unmatched -> owners told.
import { timingSafeEqual } from "node:crypto";
import { matchInvoice, parseInterac } from "@/server/billing/interac";
import { businessId, db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { money } from "@/server/money";
import { recordPayment } from "@/server/ops/invoices";
import { clientName } from "@/server/queries";

function authorized(req: Request) {
  const want = process.env.INTERAC_INBOUND_SECRET ?? "";
  const got = req.headers.get("x-etc-secret") ?? "";
  return want.length >= 16 && want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null) as { from?: string; subject?: string; text?: string } | null;
  if (!body?.text) return Response.json({ error: "text required" }, { status: 400 });
  if (body.from && !/interac\.ca$/i.test(body.from.replace(/[>\s]/g, ""))) return Response.json({ ok: true, ignored: "not from Interac" });

  const bid = await businessId();
  const n = parseInterac(body.subject ?? "", body.text);
  if (n.interacRef && await db.payment.findFirst({ where: { businessId: bid, reference: `Interac ${n.interacRef}` } })) return Response.json({ ok: true, duplicate: true });

  const open = await db.invoice.findMany({ where: { businessId: bid, status: { in: ["AWAITING_PAYMENT", "DRAFT"] } }, include: { client: true } });
  const hit = matchInvoice(n, open.map((i) => ({ id: i.id, etransferRef: i.etransferRef, balanceCents: i.totalCents - i.amountPaidCents, clientName: clientName(i.client) })));
  if (hit && n.amountCents) {
    await recordPayment({ id: null, businessId: bid }, {
      invoiceId: hit.id, method: "ETRANSFER", amountCents: n.amountCents,
      reference: n.interacRef ? `Interac ${n.interacRef}` : "Interac (auto)", note: [n.sender, n.message].filter(Boolean).join(" · ").slice(0, 300),
    });
    return Response.json({ ok: true, matched: hit.etransferRef });
  }
  for (const to of env.ownerEmails) {
    await enqueue(db, {
      businessId: bid, template: "owner.notice", to, priority: 3,
      props: { title: `e-Transfer to match: ${n.amountCents ? money(n.amountCents) : "unknown amount"}`, body: `From ${n.sender ?? "unknown"}.\nMessage: ${n.message ?? "(none)"}\nWe couldn't match it to an invoice automatically. Record it on the right invoice.`, path: "/invoices?tab=OPEN" },
    });
  }
  kickOutbox();
  return Response.json({ ok: true, matched: null });
}
