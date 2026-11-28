// Drawn signatures on quotes, visits (job completion) and invoices. The image is stored like a photo;
// we keep who signed, the exact statement, a hash of the document at that moment, IP and browser.
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SignatureKind } from "@/generated/prisma/client";
import { db } from "../db";
import { logActivity } from "../records";
import { saveImage } from "../media";
import { optionLines, quoteDiscountCents, quoteOptions, quoteTotals } from "../status/quote";
import { TransitionError } from "../status/visit";

export const STATEMENTS: Record<SignatureKind, string> = {
  QUOTE: "I approve this quote and authorize etc. to do the work described.",
  VISIT: "The work was completed to my satisfaction.",
  INVOICE: "I confirm I received the work and this invoice.",
};

/** "data:image/png;base64,..." -> PNG bytes (max 300 KB). Pure, unit-tested. */
export function decodeSignature(dataUrl: string): Buffer {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) throw new TransitionError("Please sign in the box");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 100 || buf.length > 300_000) throw new TransitionError("Please sign in the box");
  return buf;
}

/** How many pixels have ink (dark and not transparent) in raw RGBA data. Pure, unit-tested. */
export function inkPixels(raw: Uint8Array, channels = 4) {
  let n = 0;
  for (let i = 0; i < raw.length; i += channels) {
    const a = channels === 4 ? raw[i + 3] : 255;
    if (a > 64 && raw[i] + raw[i + 1] + raw[i + 2] < 384) n++;
  }
  return n;
}

/** Stable hash of what was signed (line items + totals). Pure, unit-tested. */
export function docHash(doc: unknown) {
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

/**
 * What a quote signature covers. With option sets it is the option being approved (`choice`, or the one already on
 * record): its key and name, only its lines plus the common ones with the extras as ticked, and that option's total.
 */
export async function quoteDoc(quoteId: string, choice?: { option: string; selected: string[] }) {
  const q = await db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  const row = (l: (typeof q.lineItems)[number]) => [l.name, String(l.quantity), l.unitPriceCents, l.isOptional, l.isSelected];
  const option = quoteOptions(q.options).find((o) => o.key === (choice?.option ?? q.chosenOption));
  if (!option) return { number: q.number, total: q.totalCents, discount: q.discountCents, lines: q.lineItems.map(row) };
  const lines = optionLines(q.lineItems, option.key).map((l) => (choice ? { ...l, isSelected: !l.isOptional || choice.selected.includes(l.id) } : l));
  const discount = quoteDiscountCents(lines, q);
  const { totalCents } = quoteTotals(lines, discount, await db.business.findUniqueOrThrow({ where: { id: q.businessId } }));
  return { number: q.number, total: totalCents, discount, option: [option.key, option.name], lines: lines.map(row) };
}
export async function invoiceDoc(invoiceId: string) {
  const i = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  return { number: i.number, total: i.totalCents, lines: i.lineItems.map((l) => [l.name, String(l.quantity), l.unitPriceCents, l.totalCents]) };
}

export async function saveSignature(input: {
  businessId: string; kind: SignatureKind; quoteId?: string; visitId?: string; invoiceId?: string; clientId: string;
  dataUrl: string; signerName: string; ip?: string | null; userAgent?: string | null; inPerson: boolean; actorUserId?: string;
  quoteChoice?: { option: string; selected: string[] }; // the option (and extras) being approved with this signature
}) {
  const name = input.signerName.trim().slice(0, 100);
  if (!name) throw new TransitionError("Type your name");
  const png = decodeSignature(input.dataUrl);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (inkPixels(data, info.channels) < 150) throw new TransitionError("That signature is too small. Sign with your finger or mouse in the box.");
  // White background so the signature reads on any page (the stored variants are WebP).
  const flat = await sharp(png).flatten({ background: "#ffffff" }).png().toBuffer();
  const att = await saveImage(input.businessId, { bytes: flat, contentType: "image/png" }, {
    kind: "DOCUMENT", uploadedByType: input.inPerson ? "USER" : "CLIENT", uploadedById: input.actorUserId, clientId: input.clientId,
    quoteId: input.quoteId, visitId: input.visitId, caption: `Signature: ${name}`,
  });
  const doc = input.quoteId ? await quoteDoc(input.quoteId, input.quoteChoice) : input.invoiceId ? await invoiceDoc(input.invoiceId) : null;
  const sig = await db.signature.create({
    data: {
      businessId: input.businessId, kind: input.kind, quoteId: input.quoteId, visitId: input.visitId, invoiceId: input.invoiceId, attachmentId: att.id,
      signerName: name, statement: STATEMENTS[input.kind], docHash: doc ? docHash(doc) : null, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null, inPerson: input.inPerson,
    },
  });
  const entity = input.quoteId ? ["Quote", input.quoteId] : input.invoiceId ? ["Invoice", input.invoiceId] : ["Visit", input.visitId!];
  await logActivity(db, { businessId: input.businessId, type: `${entity[0].toLowerCase()}.signed`, entityType: entity[0], entityId: entity[1], actorType: input.inPerson ? "USER" : "CLIENT", actorUserId: input.actorUserId, actorClientId: input.inPerson ? undefined : input.clientId, clientId: input.clientId, data: { name, ...(doc && "option" in doc && doc.option ? { option: doc.option[1] } : {}) } });
  return sig;
}

/** Visit completion: if the job needs a signature, one must exist for this visit. */
export async function assertSigned(businessId: string, visitId: string, requireSignature: boolean) {
  if (!requireSignature) return;
  if (!(await db.signature.count({ where: { businessId, visitId, kind: "VISIT" } }))) throw new TransitionError("Get the client's signature first");
}
