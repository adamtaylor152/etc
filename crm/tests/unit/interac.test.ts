import { describe, expect, it } from "vitest";
import { matchInvoice, parseInterac } from "@/server/billing/interac";

const sample = {
  subject: "INTERAC e-Transfer: JANE SMITH sent you money.",
  body: `Hi ETC CREW,
JANE SMITH sent you $35.00 (CAD) and the money has been automatically deposited into your bank account.
Message: snow shovelling ETC-1042 thanks!
Reference Number: CAa1B2c3D4e5`,
};

describe("parseInterac", () => {
  it("pulls amount, sender, message and our reference", () => {
    expect(parseInterac(sample.subject, sample.body)).toEqual({
      amountCents: 3500, sender: "JANE SMITH", refs: ["ETC-1042"], message: "snow shovelling ETC-1042 thanks!", interacRef: "CAa1B2c3D4e5",
    });
  });
  it("reads thousands separators, and a reference only in the ETC-<number> form", () => {
    const n = parseInterac("e-Transfer received", "From: Bob Jones\nAmount: $1,250.50\nMessage: invoices etc-77, ETC - 78 and Etc -79");
    expect(n.amountCents).toBe(125050);
    expect(n.refs).toEqual(["ETC-77", "ETC-78", "ETC-79"]);
    expect(n.sender).toBe("Bob Jones");
    // Ordinary words and near-misses are not references: they go to the owners to match by hand.
    const refs = (message: string) => parseInterac("e-Transfer received", `From: Bob Jones\nAmount: $35.00\nMessage: ${message}`).refs;
    expect(["walks etc 12", "ETC 1042", "ETC#78", "etc. 12 thanks", "fetc-12", "ETC-12a", "ETC--12", "ETC-1234567"].flatMap(refs)).toEqual([]);
  });
  it("copes with no message", () => {
    expect(parseInterac("INTERAC e-Transfer: AL B sent you money.", "AL B sent you $30.00 (CAD).").refs).toEqual([]);
  });
});

describe("matchInvoice", () => {
  const open = [
    { id: "a", etransferRef: "ETC-1042", balanceCents: 3500, clientName: "Jane Smith" },
    { id: "b", etransferRef: "ETC-1043", balanceCents: 3500, clientName: "Sam Lee" },
    { id: "c", etransferRef: "ETC-1044", balanceCents: 6000, clientName: "Jane Smith" },
  ];
  it("matches on the reference first", () => {
    expect(matchInvoice(parseInterac(sample.subject, sample.body), open)?.id).toBe("a");
  });
  it("falls back to a unique amount + last name match", () => {
    expect(matchInvoice({ amountCents: 6000, sender: "JANE SMITH", refs: [], message: null }, open)?.id).toBe("c");
  });
  it("gives up when ambiguous or unknown", () => {
    expect(matchInvoice({ amountCents: 3500, sender: "Pat Nobody", refs: [], message: null }, open)).toBeNull();
    expect(matchInvoice({ amountCents: 3500, sender: null, refs: ["ETC-9"], message: null }, open)).toBeNull();
  });
  it("a reference alone is not enough: the amount must fit the invoice, or the sender must be the client", () => {
    const n = (amountCents: number | null, sender: string | null) => ({ amountCents, sender, refs: ["ETC-1044"], message: null });
    expect(matchInvoice(n(6000, "PAT NOBODY"), open)?.id).toBe("c"); // exact balance, from a spouse's account
    expect(matchInvoice(n(2000, "JANE SMITH"), open)?.id).toBe("c"); // the client paying part
    expect(matchInvoice(n(500, "PAT NOBODY"), open)).toBeNull();     // someone else's $5 with this invoice's number typed in
    expect(matchInvoice(n(9000, "PAT NOBODY"), open)).toBeNull();
    expect(matchInvoice(n(null, null), open)).toBeNull();
    expect(matchInvoice(n(500, "SMITHSON"), open)).toBeNull();       // a whole last name, not part of one
  });
  it("a smaller amount fits only an invoice that takes part payments", () => {
    const partial = [{ ...open[2], allowPartial: true }];
    const n = (amountCents: number) => ({ amountCents, sender: "PAT NOBODY", refs: ["ETC-1044"], message: null });
    expect(matchInvoice(n(2000), partial)?.id).toBe("c");
    expect(matchInvoice(n(6001), partial)).toBeNull();
    expect(matchInvoice(n(0), partial)).toBeNull();
  });
  it("does not fall through to the name match when the reference names another invoice", () => {
    expect(matchInvoice({ amountCents: 6000, sender: "JANE SMITH", refs: ["ETC-1043"], message: null }, open)).toBeNull();
  });
});

import { classifyInterac } from "@/server/billing/interac";
describe("classifyInterac", () => {
  it("payments need an amount and a 'sent you' line", () => {
    expect(classifyInterac(sample.subject, sample.body)).toBe("payment");
    expect(classifyInterac("e-Transfer received", "From: Bob Jones\nYou've received $20.00")).toBe("payment");
  });
  it("Autodeposit confirmation emails are not payments", () => {
    expect(classifyInterac("INTERAC e-Transfer: Confirm your Autodeposit registration",
      "Please confirm your Autodeposit registration for pay@etccrew.ca. Once confirmed, money sent to you will be automatically deposited into your account.")).toBe("setup");
    expect(classifyInterac("Your Autodeposit is now active", "Funds will be automatically deposited.")).toBe("setup");
  });
  it("other Interac mail is ignored", () => {
    expect(classifyInterac("Interac security notice", "We will never ask for your password.")).toBe("other");
  });
});
