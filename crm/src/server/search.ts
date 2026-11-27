// Global search: one box finds clients (name, company, email, any phone digits), addresses, and request/quote/job/invoice numbers.
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { clientName } from "./queries";

export type SearchHit = { kind: "client" | "property" | "request" | "quote" | "job" | "invoice"; id: string; title: string; sub: string; href: string };

/** What the query looks like: a record number (#12, 12, ETC-1042), phone digits, or words. Pure, unit-tested. */
export function parseQuery(raw: string) {
  const q = raw.trim().slice(0, 80);
  const ref = q.match(/^etc-?(\d+)$/i);
  const num = ref ? Number(ref[1]) : /^#?\d{1,6}$/.test(q) ? Number(q.replace("#", "")) : null;
  const digits = q.replace(/\D/g, "");
  return { q, num, invoiceRef: !!ref, digits: digits.length >= 4 && digits.length >= q.replace(/[\s()+.-]/g, "").length - 1 ? digits.slice(-10) : null };
}

export async function search(businessId: string, raw: string): Promise<SearchHit[]> {
  const { q, num, invoiceRef, digits } = parseQuery(raw);
  if (q.length < 2 && num == null) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const ci = { contains: q, mode: "insensitive" as const };
  const [clientIds, properties, requests, quotes, jobs, invoices] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Client" WHERE "businessId" = ${businessId} AND (
        ("firstName" || ' ' || "lastName") ILIKE ${like} OR "companyName" ILIKE ${like} OR email ILIKE ${like}
        ${digits ? Prisma.sql`OR regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}` : Prisma.empty}
      ) ORDER BY "archivedAt" NULLS FIRST, "firstName" LIMIT 8`,
    db.property.findMany({ where: { businessId, formatted: ci }, include: { client: true }, take: 5 }),
    db.request.findMany({ where: { businessId, OR: [...(num != null && !invoiceRef ? [{ number: num }] : []), { title: ci }] }, include: { client: true }, take: 4, orderBy: { number: "desc" } }),
    db.quote.findMany({ where: { businessId, OR: [...(num != null && !invoiceRef ? [{ number: num }] : []), { title: ci }] }, include: { client: true }, take: 4, orderBy: { number: "desc" } }),
    db.job.findMany({ where: { businessId, OR: [...(num != null && !invoiceRef ? [{ number: num }] : []), { title: ci }] }, include: { client: true }, take: 4, orderBy: { number: "desc" } }),
    db.invoice.findMany({ where: { businessId, OR: [...(num != null ? [{ number: num }] : []), { subject: ci }] }, include: { client: true }, take: 4, orderBy: { number: "desc" } }),
  ]);
  const clients = clientIds.length ? await db.client.findMany({ where: { id: { in: clientIds.map((c) => c.id) } }, include: { properties: { take: 1, orderBy: { createdAt: "asc" } } } }) : [];
  const order = new Map(clientIds.map((c, i) => [c.id, i]));
  return [
    ...clients.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((c): SearchHit => ({
      kind: "client", id: c.id, title: clientName(c), sub: [c.phone, c.email, c.properties[0]?.formatted].filter(Boolean).join(" · ") + (c.archivedAt ? " · archived" : ""), href: `/clients/${c.id}`,
    })),
    ...properties.map((p): SearchHit => ({ kind: "property", id: p.id, title: p.formatted, sub: clientName(p.client), href: `/clients/${p.clientId}` })),
    ...requests.map((r): SearchHit => ({ kind: "request", id: r.id, title: `Request #${r.number} ${r.title}`, sub: clientName(r.client), href: `/requests/${r.id}` })),
    ...quotes.map((r): SearchHit => ({ kind: "quote", id: r.id, title: `Quote #${r.number}${r.title ? ` ${r.title}` : ""}`, sub: clientName(r.client), href: `/quotes/${r.id}` })),
    ...jobs.map((r): SearchHit => ({ kind: "job", id: r.id, title: `Job #${r.number} ${r.title}`, sub: clientName(r.client), href: `/jobs/${r.id}` })),
    ...invoices.map((r): SearchHit => ({ kind: "invoice", id: r.id, title: `Invoice #${r.number}${r.subject ? ` ${r.subject}` : ""}`, sub: clientName(r.client), href: `/invoices/${r.id}` })),
  ];
}
