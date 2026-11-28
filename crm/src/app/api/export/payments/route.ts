// CSV of payments for bookkeeping/taxes: /api/export/payments?from=2026-01-01&to=2026-12-31
import { currentOwner } from "@/server/auth";
import { db } from "@/server/db";
import { addDays, localDayStart, TZ } from "@/server/dates";
import { clientName } from "@/server/queries";

const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

export async function GET(req: Request) {
  const user = await currentOwner();
  if (!user) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  const payments = await db.payment.findMany({
    where: {
      businessId: user.businessId,
      receivedAt: { ...(from ? { gte: localDayStart(from) } : {}), ...(to ? { lt: localDayStart(addDays(to, 1)) } : {}) },
    },
    include: { client: true, invoice: true }, orderBy: { receivedAt: "asc" },
  });
  const rows = [["Date", "Client", "Invoice", "Method", "Amount", "Refunded", "Stripe fee", "Reference", "Note"]];
  for (const p of payments) {
    rows.push([
      p.receivedAt.toLocaleDateString("en-CA", { timeZone: TZ }), clientName(p.client), `#${p.invoice.number}`, p.method,
      (p.amountCents / 100).toFixed(2), (p.refundedCents / 100).toFixed(2), p.feeCents != null ? (p.feeCents / 100).toFixed(2) : "", p.reference ?? "", p.note ?? "",
    ]);
  }
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="etc-payments${from ? `-${from}` : ""}.csv"`, "Cache-Control": "no-store" },
  });
}
