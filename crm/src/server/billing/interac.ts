// Interac e-Transfer auto-matching. There's no public Interac API, so with Autodeposit on, the bank's
// "you've received money" email is forwarded (Cloudflare Email Routing -> Worker -> POST /api/interac).
// We parse amount, sender and the message (where clients type ETC-1042) and match it to an invoice.
// Pure, unit-tested. ponytail: regexes on stable bits (amount, "ETC-n", sender name), not exact layouts,
// because Interac/bank templates change; anything unmatched goes to the owners to apply by hand.

export type InteracNotice = { amountCents: number | null; sender: string | null; refs: string[]; message: string | null; interacRef?: string | null };

export function parseInterac(subject: string, body: string): InteracNotice {
  const text = `${subject}\n${body}`.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const money = text.match(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:\(?CAD\)?)?/i);
  const amountCents = money ? Math.round(Number(money[1].replace(/,/g, "")) * 100) : null;
  const sender =
    text.match(/(?:INTERAC e-Transfer|e-Transfer)[:\s]+(.+?)\s+(?:sent you|has sent you|sent)\s/i)?.[1]?.trim() ??
    text.match(/(?:[Ff]rom|[Ss]ent by)[:\s]+([A-Z][\w'.-]+(?: [A-Z][\w'.-]+){0,3})/)?.[1]?.trim() ?? null;
  const message = text.match(/message[^:\n]*:\s*(.+)/i)?.[1]?.trim() ?? null;
  const refs = [...new Set([...text.matchAll(/\bETC[-\s#]?(\d{1,6})\b/gi)].map((m) => `ETC-${m[1]}`))];
  const interacRef = text.match(/Reference (?:Number|#)\s*:?\s*([A-Za-z0-9]{8,})/i)?.[1] ?? null;
  return { amountCents, sender, refs, message, ...(interacRef ? { interacRef } : {}) };
}

type Candidate = { id: string; etransferRef: string; balanceCents: number; clientName: string };

/** Best invoice for a notice: exact reference first; otherwise a unique open invoice with the same balance and sender name. */
export function matchInvoice(n: InteracNotice, open: Candidate[]): Candidate | null {
  for (const ref of n.refs) {
    const hit = open.find((c) => c.etransferRef.toUpperCase() === ref.toUpperCase());
    if (hit) return hit;
  }
  if (n.amountCents == null || !n.sender) return null;
  const last = n.sender.toLowerCase().split(" ").at(-1)!;
  const byAmountAndName = open.filter((c) => c.balanceCents === n.amountCents && c.clientName.toLowerCase().includes(last));
  return byAmountAndName.length === 1 ? byAmountAndName[0] : null;
}
