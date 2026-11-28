// Security-review fixes whose rule lives in the database: an e-Transfer notice is recorded once however often (and
// however simultaneously) it arrives, a public booking never edits an existing client, a merge revokes the duplicate's
// client-page links, an expired quote can't be approved, crew reach only their own route. Nothing is sent: the outbox
// doesn't run under vitest.
import { beforeAll, describe, expect, it } from "vitest";
import { handleInteracNotice } from "@/server/billing/interac-email";
import { createBooking } from "@/server/booking/create";
import { bookingLabels, validate } from "@/server/booking/validate";
import { addDays, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { mergeClients } from "@/server/ops/client-import";
import { createCustomInvoice, sendInvoice } from "@/server/ops/invoices";
import { recordReferral, referralCodeFor } from "@/server/ops/marketing";
import { approveQuote } from "@/server/ops/quotes";
import { nextNumber } from "@/server/records";
import { visitScope } from "@/server/runner";
import { mintToken, peekToken, sweepExpiredTokens } from "@/server/tokens";

let bid: string, owner: { id: string; businessId: string };
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const client = (first: string, last: string, extra: Record<string, unknown> = {}) =>
  db.client.create({ data: { businessId: bid, firstName: first, lastName: last, email: `${first}-${last}@example.com`.toLowerCase(), source: "MANUAL", ...extra } });

beforeAll(async () => {
  bid = await businessId();
  owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
});

describe("Interac notices", () => {
  /** A sent invoice and the notice a bank would send for it. */
  async function sentInvoice() {
    const t = tag();
    const c = await client("Iris", `Tester${t}`);
    const draft = await createCustomInvoice(owner, { clientId: c.id, subject: "Snow clearing", lines: [{ name: "Driveway", quantity: 1, unitPriceCents: 4000 }] });
    await sendInvoice(owner, draft.id);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    const notice = (o: { cents?: number; sender?: string; message?: string; ref?: string | null } = {}) => [
      `INTERAC e-Transfer: ${o.sender ?? `IRIS TESTER${t.toUpperCase()}`} sent you money.`,
      `${o.sender ?? `IRIS TESTER${t.toUpperCase()}`} sent you $${((o.cents ?? inv.totalCents) / 100).toFixed(2)} (CAD) and the money has been automatically deposited into your bank account.\nMessage: ${o.message ?? inv.etransferRef}` +
        (o.ref === null ? "" : `\nReference Number: ${o.ref ?? `CA${t}`}`),
    ] as const;
    const state = () => db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    return { t, inv, notice, state };
  }

  it("the same notice arriving five times at once is one payment", async () => {
    const { t, inv, notice, state } = await sentInvoice();
    const results = await Promise.all(Array.from({ length: 5 }, () => handleInteracNotice(...notice(), true)));
    expect(results.filter((r) => "matched" in r && r.matched === inv.etransferRef)).toHaveLength(1);
    expect(results.filter((r) => "duplicate" in r)).toHaveLength(4);
    expect(await handleInteracNotice(...notice(), true)).toEqual({ duplicate: true }); // and a redelivery later
    const after = await state();
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ amountCents: inv.totalCents, method: "ETRANSFER", reference: `Interac CA${t}` });
    expect(after.status).toBe("PAID");
    // The claim row that makes it atomic: applied, linked to the payment, never shown as "to match".
    const claim = await db.unmatchedPayment.findUniqueOrThrow({ where: { businessId_providerRef: { businessId: bid, providerRef: `CA${t}` } }, include: { payments: true } });
    expect(claim.status).toBe("APPLIED");
    expect(claim.payments.map((p) => p.id)).toEqual([after.payments[0].id]);
  }, 30_000);

  it("a notice with no Interac reference number is never recorded automatically", async () => {
    const { inv, notice, state } = await sentInvoice();
    const before = await db.unmatchedPayment.count({ where: { businessId: bid, providerRef: null, status: "OPEN" } });
    expect(await handleInteracNotice(...notice({ ref: null }), true)).toEqual({ matched: null, queued: true });
    expect((await state()).payments).toHaveLength(0);
    expect(await db.unmatchedPayment.count({ where: { businessId: bid, providerRef: null, status: "OPEN" } })).toBe(before + 1);
    expect(inv.status).toBe("AWAITING_PAYMENT");
  }, 30_000);

  it("someone else's invoice number in the message doesn't pay that invoice", async () => {
    const { t, notice, state } = await sentInvoice();
    // $5 from a stranger, with this invoice's ETC- number typed in: to the owners, not onto the invoice.
    expect(await handleInteracNotice(...notice({ cents: 500, sender: "MALLORY OTHER" }), true)).toEqual({ matched: null, queued: true });
    expect((await state()).payments).toHaveLength(0);
    const queued = await db.unmatchedPayment.findUniqueOrThrow({ where: { businessId_providerRef: { businessId: bid, providerRef: `CA${t}` } } });
    expect(queued).toMatchObject({ status: "OPEN", amountCents: 500, sender: "MALLORY OTHER" });
    expect(await handleInteracNotice(...notice({ cents: 500, sender: "MALLORY OTHER" }), true)).toEqual({ duplicate: true }); // queued once
    // Loose text is not a reference at all.
    const loose = await sentInvoice();
    await handleInteracNotice(...loose.notice({ sender: "MALLORY OTHER", cents: 123, message: `walks etc ${loose.inv.number}` }), true);
    expect((await loose.state()).payments).toHaveLength(0);
  }, 30_000);
});

describe("public booking with an existing client's email", () => {
  const book = async (email: string, address: string, extra: Record<string, unknown> = {}) => validate({
    name: "Somebody Else", email, phone: "403-555-0199", address, access: "gate code 9999, key under the mat", payment: "Cash", plan: "One-time visit",
    services: ["Snow shovelling"], size: "Large", extraWalk: true, ...extra,
  }, todayLocal(), bookingLabels(await db.service.findMany({ where: { businessId: bid, active: true, bookable: true } })));

  it("makes the request but changes nothing about the client or their property", async () => {
    const t = tag(), address = `${t} Parkland Blvd SE, Calgary`;
    const c = await client("Erin", `Existing${t}`);
    const first = await createBooking(await book(c.email, address, { size: "Standard", extraWalk: false, access: "side gate", phone: "" }), { businessId: bid, source: "BOOKING_FORM", clientId: c.id, sendEmails: false });
    const prop = await db.property.findFirstOrThrow({ where: { clientId: c.id } });
    expect(prop).toMatchObject({ accessNotes: "side gate", driveSize: "STANDARD", extraWalk: false });

    const res = await createBooking(await book(c.email, address), { businessId: bid, source: "BOOKING_FORM", sendEmails: false });
    expect(res).toMatchObject({ clientId: c.id, clientCreated: false });
    expect(res.requestId).not.toBe(first.requestId);
    expect(res.jobId).toBeTruthy(); // the shovelling job is still booked, as before
    expect(await db.property.findUniqueOrThrow({ where: { id: prop.id } })).toMatchObject({ accessNotes: "side gate", driveSize: "STANDARD", extraWalk: false });
    expect(await db.client.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ phone: null, firstName: "Erin", smsOptIn: false, emailMarketingConsentAt: null });
    // What they typed is still on the request for the owner to read.
    expect((await db.request.findUniqueOrThrow({ where: { id: res.requestId } })).accessNotes).toBe("gate code 9999, key under the mat");

    // The signed-in client page (meta.clientId) keeps today's behaviour: their own details do update.
    await createBooking(await book(c.email, address), { businessId: bid, source: "CLIENT_HUB", clientId: c.id, propertyId: prop.id, sendEmails: false });
    expect(await db.property.findUniqueOrThrow({ where: { id: prop.id } })).toMatchObject({ accessNotes: "gate code 9999, key under the mat", driveSize: "LARGE", extraWalk: true });
  }, 30_000);

  it("a new client is created as before, and only a new client can be a referral", async () => {
    const t = tag();
    const referrer = await client("Rae", `Referrer${t}`);
    const code = await referralCodeFor(referrer.id);
    const existing = await client("Otis", `Oldtimer${t}`);
    expect(await recordReferral(bid, existing.id, code, false)).toBeNull();
    expect(await db.referral.count({ where: { refereeId: existing.id } })).toBe(0);
    expect((await db.client.findUniqueOrThrow({ where: { id: existing.id } })).referredById).toBeNull();

    const res = await createBooking(await book(`new-${t}@example.com`, `${t} Newcomer Rd SE, Calgary`), { businessId: bid, source: "BOOKING_FORM", sendEmails: false });
    expect(res.clientCreated).toBe(true);
    expect(await db.client.findUniqueOrThrow({ where: { id: res.clientId } })).toMatchObject({ phone: "403-555-0199", firstName: "Somebody" });
    expect(await db.property.findFirstOrThrow({ where: { clientId: res.clientId } })).toMatchObject({ accessNotes: "gate code 9999, key under the mat", driveSize: "LARGE", extraWalk: true });
    expect(await recordReferral(bid, res.clientId, code, res.clientCreated)).toMatchObject({ referrerId: referrer.id, refereeId: res.clientId });
  }, 30_000);
});

describe("merging clients", () => {
  it("revokes the duplicate's client-page links instead of handing them to the kept client", async () => {
    const t = tag();
    const keep = await client("Kay", `Keeper${t}`), dup = await client("Dee", `Duplicate${t}`);
    const draft = await createCustomInvoice(owner, { clientId: dup.id, subject: "Yard work", lines: [{ name: "Raking", quantity: 1, unitPriceCents: 2000 }] });
    const [keepHub, dupHub, dupInvoice] = await Promise.all([
      mintToken(db, bid, "CLIENT_HUB", { clientId: keep.id }), mintToken(db, bid, "CLIENT_HUB", { clientId: dup.id }),
      mintToken(db, bid, "INVOICE", { invoiceId: draft.id, clientId: dup.id }),
    ]);
    await mergeClients(owner, keep.id, dup.id);
    expect(await peekToken(db, dupHub, ["CLIENT_HUB"])).toEqual({ ok: false, problem: "revoked" });
    expect(await db.linkToken.count({ where: { clientId: keep.id, purpose: "CLIENT_HUB" } })).toBe(1); // only the one they were sent themselves
    expect((await peekToken(db, keepHub, ["CLIENT_HUB"])).ok).toBe(true);
    // A link to one document still opens that document (now the kept client's).
    const inv = await peekToken(db, dupInvoice, ["INVOICE"]);
    expect(inv.ok && inv.token.invoiceId).toBe(draft.id);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: draft.id } })).clientId).toBe(keep.id);
    expect(await db.client.findUnique({ where: { id: dup.id } })).toBeNull();
  }, 30_000);
});

describe("expired quotes", () => {
  it("can't be approved, and stay as they were", async () => {
    const c = await client("Quinn", `Quoted${tag()}`);
    const today = todayLocal();
    const quote = (validUntil: string) => db.$transaction(async (tx) => tx.quote.create({ data: { businessId: bid, number: await nextNumber(tx, bid, "QUOTE"), clientId: c.id, title: "Fence repair", status: "AWAITING_RESPONSE", sentAt: new Date(), validUntil: toDbDate(validUntil) } }));
    const expired = await quote(addDays(today, -1));
    await expect(approveQuote(expired.id, { name: "Quinn", selected: [], ip: null })).rejects.toThrow("This quote has expired");
    expect(await db.quote.findUniqueOrThrow({ where: { id: expired.id } })).toMatchObject({ status: "AWAITING_RESPONSE", approvedAt: null });
    const current = await quote(today); // good through its last day
    await approveQuote(current.id, { name: "Quinn", selected: [], ip: null });
    expect((await db.quote.findUniqueOrThrow({ where: { id: current.id } })).status).toBe("APPROVED");
  }, 30_000);
});

describe("crew scope", () => {
  it("an unassigned visit is theirs only from yesterday to tomorrow; an assigned one on any date", async () => {
    const t = tag(), today = todayLocal();
    const booking = validate({ name: "Scope Test", email: `scope-${t}@example.com`, address: `${t} Scope St SW, Calgary`, payment: "Cash", plan: "One-time visit", services: ["Snow shovelling"], size: "Standard" },
      today, bookingLabels(await db.service.findMany({ where: { businessId: bid, active: true, bookable: true } })));
    const res = await createBooking(booking, { businessId: bid, source: "BOOKING_FORM", sendEmails: false });
    const visit = await db.visit.findFirstOrThrow({ where: { jobId: res.jobId! } });
    const crew = { id: owner.id, role: "CREW" }; // the scope only reads id and role
    const reach = async (date: string) => {
      await db.visit.update({ where: { id: visit.id }, data: { scheduledDate: toDbDate(date) } });
      return !!(await db.visit.findFirst({ where: { id: visit.id, businessId: bid, ...visitScope(crew, today) } }));
    };
    expect(await Promise.all([-1, 0, 1].map((n) => reach(addDays(today, n))))).toEqual([true, true, true]);
    expect([await reach(addDays(today, -2)), await reach(addDays(today, 2)), await reach(addDays(today, 30))]).toEqual([false, false, false]);
    await db.visitAssignee.create({ data: { visitId: visit.id, userId: owner.id } });
    expect(await reach(addDays(today, 30))).toBe(true);
    expect(!!(await db.visit.findFirst({ where: { id: visit.id, ...visitScope({ id: "someone-else", role: "CREW" }, today) } }))).toBe(false);
    expect(!!(await db.visit.findFirst({ where: { id: visit.id, ...visitScope({ id: owner.id, role: "OWNER" }) } }))).toBe(true);
  }, 30_000);
});

describe("link token sweep", () => {
  it("deletes links that expired more than a day ago and nothing else", async () => {
    const [old, recent, live] = await Promise.all([1, 2, 3].map(() => mintToken(db, bid, "PHOTO_UPLOAD", { redirectPath: "sweep-test" })));
    const rows = await db.linkToken.findMany({ where: { redirectPath: "sweep-test" }, orderBy: { createdAt: "asc" } });
    const now = Date.now();
    await db.linkToken.update({ where: { id: rows[0].id }, data: { expiresAt: new Date(now - 2 * 86_400_000) } });
    await db.linkToken.update({ where: { id: rows[1].id }, data: { expiresAt: new Date(now - 3_600_000) } });
    await sweepExpiredTokens(db, now);
    const left = (await db.linkToken.findMany({ where: { redirectPath: "sweep-test" } })).map((r) => r.id);
    expect(left).toHaveLength(2);
    expect(left).not.toContain(rows[0].id);
    expect([old, recent, live]).toHaveLength(3);
    await db.linkToken.deleteMany({ where: { redirectPath: "sweep-test" } });
  });
});
