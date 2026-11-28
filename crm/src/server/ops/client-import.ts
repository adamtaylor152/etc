// Clients in and out as CSV, possible duplicates, and merging a duplicate into the client you keep.
import { saveClient, type ClientInput } from "../clients";
import { parseCsv } from "../csv";
import { db } from "../db";
import { clientName } from "../queries";
import { logActivity } from "../records";
import { toE164 } from "../sms";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };

export const CLIENT_COLUMNS = ["First name", "Last name", "Company", "Email", "Phone", "Address", "Tags", "Lead source", "Notes"] as const;
const ALIASES: Record<string, (typeof CLIENT_COLUMNS)[number]> = {
  "first name": "First name", firstname: "First name", first: "First name", "last name": "Last name", lastname: "Last name", last: "Last name", surname: "Last name",
  company: "Company", "company name": "Company", email: "Email", "e-mail": "Email", "email address": "Email", phone: "Phone", mobile: "Phone", "phone number": "Phone", cell: "Phone",
  address: "Address", "street address": "Address", "property address": "Address", tags: "Tags", "lead source": "Lead source", source: "Lead source", notes: "Notes", note: "Notes",
};
export const MAX_IMPORT_ROWS = 2000;

/** CSV text -> one record per row keyed by our column names. "Name" is split into first/last. Pure, unit-tested. */
export function mapClientRows(text: string) {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new TransitionError("That file is empty");
  const keys = head.map((h) => { const k = h.trim().toLowerCase(); return k === "name" || k === "full name" || k === "client" ? "Name" : ALIASES[k] ?? null; });
  if (!keys.includes("First name") && !keys.includes("Name") && !keys.includes("Company")) throw new TransitionError('The first row needs column names, including "First name" (or "Name")');
  if (body.length > MAX_IMPORT_ROWS) throw new TransitionError(`That's ${body.length} rows; import up to ${MAX_IMPORT_ROWS} at a time`);
  return body.map((cells) => {
    const r: Partial<Record<(typeof CLIENT_COLUMNS)[number] | "Name", string>> = {};
    keys.forEach((k, i) => { if (k && cells[i]?.trim()) r[k] = cells[i].trim(); });
    if (r.Name && !r["First name"]) { const [first, ...rest] = r.Name.split(/\s+/); r["First name"] = first; r["Last name"] ??= rest.join(" "); }
    if (!r["First name"] && r.Company) r["First name"] = r.Company;
    return r;
  });
}

const toInput = (r: ReturnType<typeof mapClientRows>[number]): ClientInput => ({
  firstName: r["First name"] ?? "", lastName: r["Last name"] ?? "", companyName: r.Company,
  emails: r.Email ? [{ address: r.Email.toLowerCase(), label: "Main" }] : [], phones: r.Phone ? [{ number: r.Phone, label: "Mobile", sms: true }] : [],
  leadSource: r["Lead source"], tags: (r.Tags ?? "").split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20), notes: r.Notes,
  followUpQuotes: true, followUpInvoices: true, visitReminders: true, marketingOptOut: false, smsOptIn: false, contacts: [],
  property: r.Address && r.Address.length >= 3 ? { formatted: r.Address } : undefined,
});

/** Creates the rows that aren't already clients (matched by email or phone). Never changes an existing client. */
export async function importClients(user: Actor, text: string) {
  const rows = mapClientRows(text);
  const existing = await db.client.findMany({ where: { businessId: user.businessId }, select: { email: true, phone: true } });
  const emails = new Set(existing.map((c) => c.email).filter(Boolean)), phones = new Set(existing.flatMap((c) => toE164(c.phone) ?? []));
  const out = { created: 0, skipped: 0, errors: [] as string[] };
  for (const [i, r] of rows.entries()) {
    const email = r.Email?.toLowerCase(), phone = toE164(r.Phone);
    if ((email && emails.has(email)) || (phone && phones.has(phone))) { out.skipped++; continue; }
    try {
      const id = await saveClient(user, toInput(r));
      await db.client.update({ where: { id }, data: { source: "IMPORT" } });
      if (email) emails.add(email);
      if (phone) phones.add(phone);
      out.created++;
    } catch (e) {
      if (out.errors.length < 20) out.errors.push(`Row ${i + 2}: ${e instanceof TransitionError ? e.message : (e as { issues?: { message: string }[] }).issues?.[0]?.message ?? "couldn't be read"}`);
    }
  }
  if (out.created) await logActivity(db, { businessId: user.businessId, actorType: "USER", actorUserId: user.id, type: "client.imported", entityType: "Business", entityId: user.businessId, data: { created: out.created, skipped: out.skipped } });
  return out;
}

/** Other clients who look like the same person: same email, phone, full name or address. */
export async function possibleDuplicates(businessId: string, clientId: string) {
  const c = await db.client.findFirstOrThrow({ where: { id: clientId, businessId }, include: { properties: true } });
  const addresses = c.properties.map((p) => p.normalized).filter(Boolean);
  return db.client.findMany({
    where: {
      businessId, id: { not: c.id }, archivedAt: null,
      OR: [
        ...(c.email ? [{ email: c.email }] : []), ...(c.phone ? [{ phone: c.phone }] : []),
        ...(c.lastName ? [{ firstName: { equals: c.firstName, mode: "insensitive" as const }, lastName: { equals: c.lastName, mode: "insensitive" as const } }] : []),
        ...(addresses.length ? [{ properties: { some: { normalized: { in: addresses } } } }] : []),
      ],
    },
    take: 5, orderBy: { createdAt: "asc" },
  });
}

/** Every table that points at a client. tests/unit/client-merge.test.ts fails if the schema gains one that isn't listed. */
export const CLIENT_REFS = [
  "linkToken", "property", "request", "quote", "job", "invoice", "payment", "attachment", "note", "activityEvent", "emailMessage",
  "textMessage", "clientContact", "callLog", "task", "reviewRequest", "clientCredit", "campaignRecipient",
] as const;

type Points = { emails: unknown; phones: unknown; email: string; phone: string | null };
/** Emails and phones of both, the kept client's first. Pure, unit-tested. */
export function mergeContactPoints(keep: Points, dup: Points) {
  const list = <T extends Record<string, unknown>>(json: unknown, single: string | null, key: string, extra: Record<string, unknown>) =>
    (Array.isArray(json) && json.length ? (json as T[]) : single ? [{ [key]: single, ...extra } as unknown as T] : []);
  const uniq = <T extends Record<string, unknown>>(xs: T[], key: string) => xs.filter((x, i) => xs.findIndex((y) => y[key] === x[key]) === i);
  const emails = uniq([...list(keep.emails, keep.email, "address", { label: "Main" }), ...list(dup.emails, dup.email, "address", { label: "Other" })], "address").slice(0, 6);
  const phones = uniq([...list(keep.phones, keep.phone, "number", { label: "Mobile", sms: true }), ...list(dup.phones, dup.phone, "number", { label: "Other", sms: false })], "number").slice(0, 6);
  return { emails, phones };
}

/**
 * Moves everything from `dupId` onto `keepId` and deletes the duplicate. Cannot be undone. The delete at the end is the
 * safety net: if anything still pointed at the duplicate, the database refuses and the whole merge rolls back.
 */
export async function mergeClients(user: Actor, keepId: string, dupId: string) {
  if (keepId === dupId) throw new TransitionError("Pick a different client to merge in");
  await db.$transaction(async (tx) => {
    const [keep, dup] = await Promise.all([keepId, dupId].map((id) => tx.client.findFirstOrThrow({ where: { id, businessId: user.businessId } })));
    const where = { clientId: dup.id }, data = { clientId: keep.id };
    // Same campaign sent to both: keep one recipient row (unique per campaign + client).
    const mine = await tx.campaignRecipient.findMany({ where: { clientId: keep.id }, select: { campaignId: true } });
    await tx.campaignRecipient.deleteMany({ where: { clientId: dup.id, campaignId: { in: mine.map((m) => m.campaignId) } } });
    for (const t of CLIENT_REFS) await (tx[t] as unknown as { updateMany: (a: { where: typeof where; data: typeof data }) => Promise<unknown> }).updateMany({ where, data });
    await tx.activityEvent.updateMany({ where: { actorClientId: dup.id }, data: { actorClientId: keep.id } });
    // Referrals: the kept client takes over as referrer; as referee, one row per client, and nobody refers themselves.
    await tx.referral.updateMany({ where: { referrerId: dup.id }, data: { referrerId: keep.id } });
    if (await tx.referral.count({ where: { refereeId: keep.id } })) await tx.referral.deleteMany({ where: { refereeId: dup.id } });
    else await tx.referral.updateMany({ where: { refereeId: dup.id }, data: { refereeId: keep.id } });
    await tx.referral.deleteMany({ where: { referrerId: keep.id, refereeId: keep.id } });
    await tx.client.updateMany({ where: { referredById: dup.id }, data: { referredById: keep.id } });
    const referredById = keep.referredById ?? (dup.referredById !== keep.id ? dup.referredById : null);
    const { emails, phones } = mergeContactPoints(keep, dup);
    const consent = [keep.emailMarketingConsentAt, dup.emailMarketingConsentAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    await tx.client.update({
      where: { id: keep.id },
      data: {
        emails: emails as object[], phones: phones as object[], email: keep.email || dup.email, phone: keep.phone ?? dup.phone,
        tags: [...new Set([...keep.tags, ...dup.tags])].slice(0, 20), notes: [keep.notes, dup.notes].filter(Boolean).join("\n\n") || null,
        companyName: keep.companyName ?? dup.companyName, leadSource: keep.leadSource ?? dup.leadSource, referralCode: keep.referralCode ?? dup.referralCode, referredById,
        // Opt-outs win: if either record said stop, we stop.
        marketingOptOut: keep.marketingOptOut || dup.marketingOptOut, smsOptOutAt: keep.smsOptOutAt ?? dup.smsOptOutAt,
        emailMarketingConsentAt: consent, emailMarketingConsentSource: keep.emailMarketingConsentSource ?? dup.emailMarketingConsentSource,
      },
    });
    await tx.client.delete({ where: { id: dup.id } });
    await logActivity(tx, { businessId: user.businessId, actorType: "USER", actorUserId: user.id, type: "client.merged", entityType: "Client", entityId: keep.id, clientId: keep.id, data: { merged: clientName(dup), email: dup.email } });
  });
}
