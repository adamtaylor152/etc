// Creating/editing clients the Jobber way: several phones (label, receives texts) and emails, extra contacts,
// lead source, communication preferences, and a first property. phone/email columns mirror the first entry
// so everything older (outbox, texting, booking upserts) keeps working unchanged.
import { z } from "zod";
import { db } from "./db";
import { normalizeAddress } from "./booking/create";
import { communityFor } from "./communities";
import { logActivity } from "./records";
import { toE164 } from "./sms";
import { adoptTexts } from "./ops/texts";
import { TransitionError } from "./status/visit";

export const PhoneEntry = z.object({ number: z.string().trim().max(40), label: z.string().trim().max(20).default("Mobile"), sms: z.boolean().default(true) });
export const EmailEntry = z.object({ address: z.string().trim().toLowerCase().max(200), label: z.string().trim().max(20).default("Main") });
const Contact = z.object({
  id: z.string().optional(), role: z.string().trim().max(40).optional(), firstName: z.string().trim().max(80), lastName: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(40).optional(), email: z.string().trim().toLowerCase().max(200).optional(), isBilling: z.boolean().default(false), receivesTexts: z.boolean().default(false),
});
export const PropertyInput = z.object({
  formatted: z.string().trim().min(3).max(300), label: z.string().trim().max(60).optional(),
  lat: z.number().nullish(), lng: z.number().nullish(), placeId: z.string().max(300).nullish(), postalCode: z.string().max(12).nullish(),
  communityCode: z.string().max(10).nullish(), accessNotes: z.string().max(1000).nullish(), gateCode: z.string().max(60).nullish(),
  petNotes: z.string().max(300).nullish(), hazards: z.string().max(500).nullish(),
});
export const ClientInput = z.object({
  title: z.string().trim().max(10).optional(), firstName: z.string().trim().min(1, "Add a first name").max(80), lastName: z.string().trim().max(80).default(""),
  companyName: z.string().trim().max(120).optional(),
  phones: z.array(PhoneEntry).max(6).default([]), emails: z.array(EmailEntry).max(6).default([]),
  leadSource: z.string().trim().max(60).optional(), tags: z.array(z.string().trim().toLowerCase().max(40)).max(20).default([]),
  notes: z.string().max(5000).optional(),
  followUpQuotes: z.boolean().default(true), followUpInvoices: z.boolean().default(true), visitReminders: z.boolean().default(true),
  marketingOptOut: z.boolean().default(false), smsOptIn: z.boolean().default(false),
  contacts: z.array(Contact).max(10).default([]),
  property: PropertyInput.optional(),
});
export type ClientInput = z.infer<typeof ClientInput>;

/** Drop blank rows, validate emails, dedupe. Pure, unit-tested. */
export function cleanContactPoints(input: Pick<ClientInput, "phones" | "emails">) {
  const seenP = new Set<string>(), seenE = new Set<string>();
  const phones = input.phones.filter((p) => p.number).map((p) => ({ ...p, number: toE164(p.number) ?? p.number }))
    .filter((p) => !seenP.has(p.number) && seenP.add(p.number));
  const emails = input.emails.filter((e) => e.address);
  for (const e of emails) if (!z.email().safeParse(e.address).success) throw new TransitionError(`"${e.address}" isn't an email address`);
  return { phones, emails: emails.filter((e) => !seenE.has(e.address) && seenE.add(e.address)) };
}

export async function propertyData(businessId: string, clientId: string, p: z.infer<typeof PropertyInput>) {
  const communityCode = p.communityCode || (await communityFor(p.lat, p.lng));
  return {
    businessId, clientId, formatted: p.formatted, normalized: normalizeAddress(p.formatted), label: p.label || null,
    lat: p.lat ?? null, lng: p.lng ?? null, placeId: p.placeId || null, postalCode: p.postalCode || null,
    geocodeSource: p.lat != null ? ("PLACES_AUTOCOMPLETE" as const) : ("NONE" as const),
    communityCode: communityCode || null, accessNotes: p.accessNotes || null, gateCode: p.gateCode || null, petNotes: p.petNotes || null, hazards: p.hazards || null,
  };
}

type Actor = { id: string; businessId: string };

export async function saveClient(user: Actor, raw: unknown, clientId?: string) {
  const input = ClientInput.parse(raw);
  const { phones, emails } = cleanContactPoints(input);
  const data = {
    title: input.title || null, firstName: input.firstName, lastName: input.lastName, companyName: input.companyName || null,
    phones, emails, phone: phones[0]?.number ?? null, email: emails[0]?.address ?? "",
    leadSource: input.leadSource || null, tags: [...new Set(input.tags.filter(Boolean))], notes: input.notes || null,
    followUpQuotes: input.followUpQuotes, followUpInvoices: input.followUpInvoices, visitReminders: input.visitReminders,
    marketingOptOut: input.marketingOptOut, smsOptIn: input.smsOptIn,
  };
  const id = await db.$transaction(async (tx) => {
    let id = clientId;
    if (id) {
      const old = await tx.client.findFirstOrThrow({ where: { id, businessId: user.businessId } });
      // A corrected address gets a fresh start: the bounce flag belonged to the old one.
      await tx.client.update({ where: { id }, data: { ...data, ...(old.email.toLowerCase() !== data.email.toLowerCase() ? { emailBouncedAt: null } : {}) } });
    } else {
      id = (await tx.client.create({ data: { ...data, businessId: user.businessId, source: "MANUAL" } })).id;
      await logActivity(tx, { businessId: user.businessId, actorType: "USER", actorUserId: user.id, type: "client.created", entityType: "Client", entityId: id, clientId: id });
    }
    // Contacts: replace the set (simple, and the form always sends all of them).
    const keep = input.contacts.filter((c) => c.firstName);
    await tx.clientContact.deleteMany({ where: { clientId: id, id: { notIn: keep.flatMap((c) => (c.id ? [c.id] : [])) } } });
    for (const c of keep) {
      const row = { role: c.role || null, firstName: c.firstName, lastName: c.lastName, phone: c.phone ? toE164(c.phone) ?? c.phone : null, email: c.email || null, isBilling: c.isBilling, receivesTexts: c.receivesTexts };
      if (c.id) await tx.clientContact.updateMany({ where: { id: c.id, clientId: id }, data: row });
      else await tx.clientContact.create({ data: { ...row, businessId: user.businessId, clientId: id } });
    }
    if (input.property && !clientId) {
      await tx.property.create({ data: { ...(await propertyData(user.businessId, id, input.property)), isDefault: true } });
    }
    return id;
  });
  for (const p of phones) await adoptTexts(user.businessId, id, p.number); // earlier texts from these numbers join the client
  return id;
}

/** Every number a client can be reached at (their phones + contacts' phones), as E.164. */
export function numbersOf(c: { phone: string | null; phones: unknown; contacts?: { phone: string | null }[] }) {
  const list = [c.phone, ...(Array.isArray(c.phones) ? (c.phones as { number?: string }[]).map((p) => p.number) : []), ...(c.contacts ?? []).map((x) => x.phone)];
  return [...new Set(list.map((n) => toE164(n)).filter((n): n is string => !!n))];
}

export const LEAD_SOURCES = ["Google", "Website", "Referral", "Facebook", "Nextdoor", "Door hanger", "Drove by", "Repeat client", "Other"];
export const PHONE_LABELS = ["Mobile", "Home", "Work", "Other"];
export const TITLES = ["", "Mr.", "Ms.", "Mrs.", "Dr."];

/** Communities for pickers: our service area first, then the rest of Calgary. */
export async function communityOptions(businessId: string) {
  const [mine, all] = await Promise.all([
    db.serviceCommunity.findMany({ where: { businessId, active: true }, select: { communityCode: true } }),
    db.community.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const ours = new Set(mine.map((m) => m.communityCode));
  return [...all.filter((c) => ours.has(c.code)), ...all.filter((c) => !ours.has(c.code))];
}

export const mapsKey = () => process.env.GOOGLE_MAPS_KEY || undefined;
