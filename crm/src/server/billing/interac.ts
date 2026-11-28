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
  // Strict on purpose: only "ETC-1042" (any case, a space either side of the hyphen is fine). Loose text like
  // "walks etc 12" or "ETC 1042" is not a reference; those go to the owners to match by hand.
  const refs = [...new Set([...text.matchAll(/\bETC ?- ?(\d{1,6})\b/gi)].map((m) => `ETC-${m[1]}`))];
  const interacRef = text.match(/Reference (?:Number|#)\s*:?\s*([A-Za-z0-9]{8,})/i)?.[1] ?? null;
  return { amountCents, sender, refs, message, ...(interacRef ? { interacRef } : {}) };
}

type Candidate = { id: string; etransferRef: string; balanceCents: number; clientName: string; allowPartial?: boolean };

/**
 * Best invoice for a notice. A reference alone is not enough (anyone can type someone else's ETC- number): the amount
 * must also fit the invoice (its balance exactly, or less when it takes part payments) or the sender's last name must
 * be the client's. Without a reference: a unique open invoice with the same balance and sender name. Else by hand.
 */
export function matchInvoice(n: InteracNotice, open: Candidate[]): Candidate | null {
  const last = n.sender?.trim().toLowerCase().split(/\s+/).at(-1) ?? "";
  const named = (c: Candidate) => last.length > 1 && c.clientName.toLowerCase().split(/[\s-]+/).includes(last);
  for (const ref of n.refs) {
    const hit = open.find((c) => c.etransferRef.toUpperCase() === ref.toUpperCase());
    if (!hit) continue;
    const fits = n.amountCents != null && n.amountCents > 0 && (n.amountCents === hit.balanceCents || (!!hit.allowPartial && n.amountCents < hit.balanceCents));
    return fits || named(hit) ? hit : null;
  }
  if (n.amountCents == null || !last) return null;
  const byAmountAndName = open.filter((c) => c.balanceCents === n.amountCents && named(c));
  return byAmountAndName.length === 1 ? byAmountAndName[0] : null;
}

/**
 * What kind of Interac email this is. Only "payment" notices (someone sent money, with an amount) touch invoices;
 * Autodeposit set-up/confirmation emails and anything else are left to the forwarded copy in the owner inbox.
 */
export function classifyInterac(subject: string, body: string): "payment" | "setup" | "other" {
  const text = `${subject}\n${body}`;
  if (/auto-?deposit/i.test(text) && /(confirm|verify|regist|activ|set ?up)/i.test(text) && !/sent you \$|has sent you \$/i.test(text)) return "setup";
  const n = parseInterac(subject, body);
  if (n.amountCents != null && /(sent you|has sent you|e-?Transfer from|you('ve| have) received)/i.test(text)) return "payment";
  return "other";
}
