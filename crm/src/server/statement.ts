// A client's statement for a range: lifetime, since the last zero balance, or from a date. One loader for the
// on-screen page, the PDF and the email, so all three always show the same rows.
import { ledger } from "./billing/ledger";
import { localDayStart } from "./dates";
import { db } from "./db";

export type StatementRange = { range: "lifetime" | "zero" | "from"; from?: string };
/** ?range=zero | ?range=from&from=YYYY-MM-DD; anything else is lifetime. Pure, unit-tested. */
export function parseStatementRange(sp: { range?: unknown; from?: unknown }): StatementRange {
  if (sp.range === "zero") return { range: "zero" };
  if (sp.range === "from" && typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) return { range: "from", from: sp.from };
  return { range: "lifetime" };
}
export const statementQuery = (r: StatementRange) => `range=${r.range}${r.from ? `&from=${r.from}` : ""}`;

export async function loadStatement(businessId: string, clientId: string, r: StatementRange) {
  const client = await db.client.findFirst({
    where: { id: clientId, businessId },
    include: { invoices: true, payments: { include: { invoice: { select: { number: true } } } }, properties: { take: 1, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
  });
  if (!client) return null;
  const biz = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  let since: Date | undefined;
  if (r.range === "zero") { const lastZero = [...ledger(client.invoices, client.payments).rows].reverse().find((x) => x.balanceCents === 0); since = lastZero ? new Date(lastZero.date.getTime() + 1) : undefined; }
  if (r.range === "from" && r.from) since = localDayStart(r.from);
  return { client, biz, since, st: ledger(client.invoices, client.payments, since) };
}
