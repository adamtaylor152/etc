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
  it("accepts sloppy references and thousands separators", () => {
    const n = parseInterac("e-Transfer received", "From: Bob Jones\nAmount: $1,250.50\nMessage: invoice etc 77 and ETC#78");
    expect(n.amountCents).toBe(125050);
    expect(n.refs).toEqual(["ETC-77", "ETC-78"]);
    expect(n.sender).toBe("Bob Jones");
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
});
