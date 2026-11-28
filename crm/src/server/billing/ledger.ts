// Client billing history: sent invoices add to the balance, payments (net of refunds) take it away. Pure, unit-tested.
export type LedgerRow = { id: string; kind: "invoice" | "payment"; date: Date; label: string; href: string; amountCents: number; balanceCents: number };

export function ledger(
  invoices: { id: string; number: number; status: string; totalCents: number; issuedOn: Date | null; createdAt: Date }[],
  payments: { id: string; invoiceId: string; amountCents: number; refundedCents: number; receivedAt: Date; method: string; invoice?: { number: number } }[],
  since?: Date,
): { rows: LedgerRow[]; balanceCents: number; openingCents: number } {
  const all = [
    ...invoices.filter((i) => i.status !== "DRAFT" && i.status !== "VOID").map((i) => ({
      id: i.id, kind: "invoice" as const, date: i.issuedOn ?? i.createdAt, label: `Invoice #${i.number}${i.status === "BAD_DEBT" ? " (written off)" : ""}`, href: `/invoices/${i.id}`,
      amountCents: i.status === "BAD_DEBT" ? 0 : i.totalCents,
    })),
    ...payments.map((p) => ({
      id: p.id, kind: "payment" as const, date: p.receivedAt, href: `/invoices/${p.invoiceId}`,
      label: `Payment${p.invoice ? ` for #${p.invoice.number}` : ""} · ${p.method === "ETRANSFER" ? "e-Transfer" : p.method.charAt(0) + p.method.slice(1).toLowerCase()}${p.refundedCents <= 0 ? "" : p.refundedCents >= p.amountCents ? " (refunded)" : " (part refunded)"}`,
      amountCents: -(p.amountCents - p.refundedCents),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "invoice" ? -1 : 1));
  let bal = 0, opening = 0;
  const rows: LedgerRow[] = [];
  for (const r of all) {
    bal += r.amountCents;
    if (since && r.date < since) { opening = bal; continue; }
    rows.push({ ...r, balanceCents: bal });
  }
  return { rows, balanceCents: bal, openingCents: opening };
}
