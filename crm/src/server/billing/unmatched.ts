// Suggesting which invoice(s) an unmatched payment belongs to, and validating how it's split. Pure, unit-tested.

export type OpenInvoice = { id: string; number: number; etransferRef: string; balanceCents: number; clientName: string; email: string; issuedOn: string | null };
export type Suggestion = { invoice: OpenInvoice; score: number; reasons: string[] };

const words = (s: string | null | undefined) => (s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

/**
 * Rank open invoices for a payment. Signals: exact balance, a balance the payment covers in full alongside others,
 * shared name words (last names count most), digits in the message that look like an invoice number, and recency.
 */
export function suggestInvoices(p: { amountCents: number; sender: string | null; message: string | null }, open: OpenInvoice[], limit = 5): Suggestion[] {
  const senderWords = words(p.sender);
  const msgWords = words(p.message);
  const msgNumbers = new Set((p.message ?? "").match(/\d{1,6}/g) ?? []);
  const scored = open.map((inv) => {
    let score = 0;
    const reasons: string[] = [];
    if (inv.balanceCents === p.amountCents) { score += 50; reasons.push("same amount"); }
    else if (inv.balanceCents < p.amountCents) { score += 5; reasons.push("payment covers it"); }
    const nameWords = words(inv.clientName);
    const last = nameWords.at(-1);
    const shared = nameWords.filter((w) => senderWords.includes(w) || msgWords.includes(w));
    if (last && shared.includes(last)) { score += 35; reasons.push("same last name"); }
    else if (shared.length) { score += 20; reasons.push("name match"); }
    const emailUser = inv.email.split("@")[0]?.toLowerCase();
    if (emailUser && emailUser.length > 2 && (p.message ?? "").toLowerCase().includes(emailUser)) { score += 20; reasons.push("email in message"); }
    if (msgNumbers.has(String(inv.number))) { score += 30; reasons.push(`mentions #${inv.number}`); }
    return { invoice: inv, score, reasons };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || (b.invoice.issuedOn ?? "").localeCompare(a.invoice.issuedOn ?? "")).slice(0, limit);
}

export type Allocation = { invoiceId: string; amountCents: number };

/** Throws a readable message if a split doesn't add up. Returns allocations with zero rows removed. */
export function validateAllocations(remainingCents: number, allocations: Allocation[], balances: Map<string, number>): Allocation[] {
  const rows = allocations.filter((a) => a.invoiceId && a.amountCents > 0);
  if (!rows.length) throw new Error("Pick an invoice and an amount");
  if (new Set(rows.map((r) => r.invoiceId)).size !== rows.length) throw new Error("Each invoice can only appear once");
  const total = rows.reduce((a, r) => a + r.amountCents, 0);
  if (total > remainingCents) throw new Error(`That's more than the payment (${(remainingCents / 100).toFixed(2)} left)`);
  for (const r of rows) {
    const bal = balances.get(r.invoiceId);
    if (bal == null) throw new Error("That invoice isn't open any more");
    if (r.amountCents > bal) throw new Error("An amount is more than that invoice's balance");
  }
  return rows;
}
