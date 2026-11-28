import { describe, expect, it } from "vitest";
import { declineWords, plainDeclineDetail } from "@/server/billing/decline-words";

describe("declineWords", () => {
  it("puts the common card failure codes into plain words", () => {
    expect(declineWords("expired_card")).toBe("the card has expired");
    expect(declineWords("insufficient_funds")).toBe("not enough funds");
    expect(declineWords("authentication_required")).toBe("the bank needs the client to approve the payment");
    for (const code of ["card_declined", "generic_decline", "do_not_honor", "stolen_card", "declined"]) expect(declineWords(code)).toBe("the card was declined");
  });
  it("never shows a code it doesn't know", () => {
    for (const code of ["processing_error", "some_new_code", "", null, undefined]) expect(declineWords(code)).toBe("the payment didn't go through");
  });
});

describe("plainDeclineDetail", () => {
  it("rewrites the code at the end of a logged activity line", () => {
    expect(plainDeclineDetail("Visa •••• 4242: expired_card")).toBe("Visa •••• 4242: the card has expired");
    expect(plainDeclineDetail("$45.00 · Card •••• 0005: authentication_required")).toBe("$45.00 · Card •••• 0005: the bank needs the client to approve the payment");
    expect(plainDeclineDetail("Visa •••• 4242: brand_new_code")).toBe("Visa •••• 4242: the payment didn't go through");
  });
  it("leaves every other line alone", () => {
    for (const s of ["$45.00 · e-Transfer", "Client asked: not_now", "Visa •••• 4242", ""]) expect(plainDeclineDetail(s)).toBe(s);
  });
});
