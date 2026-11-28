import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, autoPayChargeOn, autoPayDecision, autoPayInTrouble, autoPayReady, cardLabel, chargeOutcome, declineText, nextAttemptOn } from "@/server/billing/autopay";

const card = { stripeCustomerId: "cus_1", cardPaymentMethodId: "pm_1", autoPayConsentAt: new Date("2026-11-01T00:00:00Z") };
const on = { autoPay: true };

describe("cardLabel", () => {
  it("shows brand and last 4 only", () => {
    expect(cardLabel({ cardBrand: "visa", cardLast4: "4242" })).toBe("Visa •••• 4242");
    expect(cardLabel({ cardBrand: "amex", cardLast4: "0005" }, " ending ")).toBe("American Express ending 0005");
    expect(cardLabel({ cardBrand: "something_new", cardLast4: "1111" })).toBe("Card •••• 1111");
    expect(cardLabel({ cardBrand: null, cardLast4: null })).toBeNull();
  });
});

describe("autoPayReady", () => {
  it("needs Stripe, the business switch, a saved card and the client's opt-in: all four", () => {
    expect(autoPayReady(card, on, true)).toBe(true);
    expect(autoPayReady(card, on, false)).toBe(false); // no Stripe keys
    expect(autoPayReady(card, { autoPay: false }, true)).toBe(false); // business switch off
    expect(autoPayReady({ ...card, autoPayConsentAt: null }, on, true)).toBe(false); // card saved, never opted in
    expect(autoPayReady({ ...card, cardPaymentMethodId: null }, on, true)).toBe(false); // card removed
    expect(autoPayReady({ ...card, stripeCustomerId: null }, on, true)).toBe(false);
  });
});

describe("autoPayChargeOn", () => {
  const inv = { kind: "STANDARD" as const, issuedOn: "2026-12-01", dueOn: "2026-12-01" };
  it("waits the grace period after the email", () => {
    expect(autoPayChargeOn(inv, true, 2)).toBe("2026-12-03");
    expect(autoPayChargeOn(inv, true, 0)).toBe("2026-12-01"); // 0 = same day
    expect(autoPayChargeOn({ ...inv, issuedOn: "2026-12-31", dueOn: "2026-12-31" }, true, 2)).toBe("2027-01-02");
  });
  it("never charges before the invoice is due", () => expect(autoPayChargeOn({ ...inv, dueOn: "2026-12-16" }, true, 2)).toBe("2026-12-16"));
  it("is null when auto-pay isn't ready, and for deposit invoices", () => {
    expect(autoPayChargeOn(inv, false, 2)).toBeNull();
    expect(autoPayChargeOn({ ...inv, kind: "DEPOSIT" }, true, 2)).toBeNull();
  });
});

describe("autoPayDecision", () => {
  const inv = { status: "AWAITING_PAYMENT" as const, kind: "STANDARD" as const, balanceCents: 5000, autoPayState: "SCHEDULED" as const, autoPayOn: "2026-12-03", attempts: [] as { status: "PENDING" | "FAILED" | "SUCCEEDED" | "REQUIRES_ACTION" }[] };
  const today = "2026-12-03";
  it("charges on the day and after, not before", () => {
    expect(autoPayDecision(inv, true, today)).toEqual({ do: "charge" });
    expect(autoPayDecision(inv, true, "2026-12-09")).toEqual({ do: "charge" });
    expect(autoPayDecision(inv, true, "2026-12-02")).toEqual({ do: "wait" });
  });
  it("leaves invoices alone that were never auto-pay, or are already settled or given up", () => {
    for (const autoPayState of [null, "PAID", "FAILED", "NEEDS_ACTION", "STOPPED"] as const) expect(autoPayDecision({ ...inv, autoPayState }, true, today)).toEqual({ do: "wait" });
  });
  it("never starts a charge while one is in flight", () => {
    expect(autoPayDecision({ ...inv, attempts: [{ status: "PENDING" }] }, true, today)).toEqual({ do: "wait" });
  });
  it("retries after a failure, up to the limit", () => {
    const retrying = { ...inv, autoPayState: "RETRYING" as const };
    expect(autoPayDecision({ ...retrying, attempts: [{ status: "FAILED" }] }, true, today)).toEqual({ do: "charge" });
    expect(autoPayDecision({ ...retrying, attempts: Array(MAX_ATTEMPTS).fill({ status: "FAILED" }) }, true, today).do).toBe("stop");
  });
  it("stops (hands the invoice back) when auto-pay went off, the invoice was paid, or it can't be charged", () => {
    expect(autoPayDecision(inv, false, today).do).toBe("stop");
    expect(autoPayDecision({ ...inv, status: "PAID" }, true, today).do).toBe("stop");
    expect(autoPayDecision({ ...inv, status: "VOID" }, true, today).do).toBe("stop");
    expect(autoPayDecision({ ...inv, balanceCents: 0 }, true, today).do).toBe("stop");
    expect(autoPayDecision({ ...inv, balanceCents: 49 }, true, today).do).toBe("stop"); // under Stripe's $0.50 minimum
    expect(autoPayDecision({ ...inv, kind: "DEPOSIT" }, true, today).do).toBe("stop");
  });
});

describe("nextAttemptOn (retry schedule)", () => {
  it("retries 3 and 7 days after the first try, then stops", () => {
    expect(nextAttemptOn("2026-12-03", 1, "2026-12-03")).toBe("2026-12-06");
    expect(nextAttemptOn("2026-12-03", 2, "2026-12-06")).toBe("2026-12-10");
    expect(nextAttemptOn("2026-12-03", 3, "2026-12-10")).toBeNull();
    expect(MAX_ATTEMPTS).toBe(3);
  });
  it("never retries sooner than tomorrow, even if the scheduler was down for a while", () => {
    expect(nextAttemptOn("2026-12-03", 1, "2026-12-20")).toBe("2026-12-21");
    expect(nextAttemptOn("2026-12-03", 2, "2026-12-10")).toBe("2026-12-11");
  });
});

describe("chargeOutcome", () => {
  it("succeeded", () => expect(chargeOutcome({ piId: "pi_1", status: "succeeded" })).toEqual({ kind: "succeeded" }));
  it("a decline is a definite failure, with the bank's reason", () => {
    expect(chargeOutcome({ piId: "pi_1", status: "requires_payment_method", error: { type: "StripeCardError", code: "card_declined", declineCode: "insufficient_funds" } })).toEqual({ kind: "failed", code: "insufficient_funds" });
    expect(chargeOutcome({ piId: null, status: null, error: { type: "StripeCardError", code: "expired_card" } })).toEqual({ kind: "failed", code: "expired_card" });
    expect(chargeOutcome({ piId: "pi_1", status: "requires_payment_method" })).toEqual({ kind: "failed", code: "declined" }); // webhook with no detail
  });
  it("Stripe rejecting the request itself is not a decline: the client's bank was never asked", () => {
    expect(chargeOutcome({ piId: null, status: null, error: { type: "StripeInvalidRequestError", code: "resource_missing" } })).toEqual({ kind: "refused", code: "resource_missing" });
    expect(chargeOutcome({ piId: null, status: null, error: { type: "StripeInvalidRequestError" } })).toEqual({ kind: "refused", code: "invalid_request" });
  });
  it("authentication needed is its own outcome, however Stripe reports it", () => {
    expect(chargeOutcome({ piId: "pi_1", status: "requires_action" })).toEqual({ kind: "needs_action" });
    expect(chargeOutcome({ piId: "pi_1", status: "requires_payment_method", error: { type: "StripeCardError", code: "authentication_required" } })).toEqual({ kind: "needs_action" });
  });
  it("still processing: wait for the webhook", () => expect(chargeOutcome({ piId: "pi_1", status: "processing" })).toEqual({ kind: "pending" }));
  it("no answer (network, outage, bad key) is unknown: never treated as a decline or a success", () => {
    for (const type of ["StripeConnectionError", "StripeAPIError", "StripeAuthenticationError", "StripeRateLimitError", "StripeIdempotencyError"]) {
      expect(chargeOutcome({ piId: null, status: null, error: { type } })).toEqual({ kind: "unknown" });
    }
    expect(chargeOutcome({ piId: null, status: null })).toEqual({ kind: "unknown" });
  });
});

describe("declineText / autoPayInTrouble", () => {
  it("says something useful without repeating fraud codes to the client", () => {
    expect(declineText("insufficient_funds")).toMatch(/enough funds/);
    expect(declineText("expired_card")).toMatch(/expired/);
    for (const code of ["stolen_card", "lost_card", "fraudulent", "do_not_honor", undefined]) expect(declineText(code)).toBe("your bank declined the charge");
  });
  it("counts unpaid invoices that are retrying, need the client, or gave up", () => {
    const t = (status: "AWAITING_PAYMENT" | "PAID", autoPayState: "SCHEDULED" | "RETRYING" | "NEEDS_ACTION" | "FAILED" | "STOPPED" | null) => autoPayInTrouble({ status, autoPayState });
    expect([t("AWAITING_PAYMENT", "RETRYING"), t("AWAITING_PAYMENT", "NEEDS_ACTION"), t("AWAITING_PAYMENT", "FAILED")]).toEqual([true, true, true]);
    expect([t("AWAITING_PAYMENT", "SCHEDULED"), t("AWAITING_PAYMENT", "STOPPED"), t("AWAITING_PAYMENT", null), t("PAID", "FAILED")]).toEqual([false, false, false, false]);
  });
});
