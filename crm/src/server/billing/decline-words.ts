// What a stored card failure code means, in words for the owner. Display only: the attempt rows, the activity log
// and the server logs keep the code exactly as the card processor sent it. Pure, unit-tested.
// (The client's wording is `declineText` in ./autopay: it stays vaguer on purpose.)

const WORDS: Record<string, string> = {
  insufficient_funds: "not enough funds",
  expired_card: "the card has expired",
  authentication_required: "the bank needs the client to approve the payment",
  card_velocity_exceeded: "the card has reached its limit",
  withdrawal_count_limit_exceeded: "the card has reached its limit",
  incorrect_cvc: "the card details need updating",
  invalid_cvc: "the card details need updating",
  incorrect_number: "the card details need updating",
  invalid_number: "the card details need updating",
  invalid_expiry_month: "the card details need updating",
  invalid_expiry_year: "the card details need updating",
  incorrect_zip: "the card details need updating",
  resource_missing: "the saved card can't be used any more",
  payment_method_unactivated: "the saved card can't be used any more",
  card_not_supported: "the card can't be used for this kind of payment",
  currency_not_supported: "the card can't be used for this kind of payment",
};
const DECLINED = new Set([
  "declined", "card_declined", "generic_decline", "do_not_honor", "do_not_try_again", "call_issuer", "transaction_not_allowed", "not_permitted",
  "restricted_card", "security_violation", "service_not_allowed", "revocation_of_authorization", "revocation_of_all_authorizations", "stop_payment_order",
  "pickup_card", "lost_card", "stolen_card", "fraudulent", "merchant_blacklist", "no_action_taken", "try_again_later", "invalid_account", "new_account_information_available",
]);

/** "expired_card" -> "the card has expired". Reads after "because" or a colon; anything unknown is "the payment didn't go through". */
export function declineWords(code: string | null | undefined): string {
  if (!code) return "the payment didn't go through";
  return WORDS[code] ?? (DECLINED.has(code) ? "the card was declined" : "the payment didn't go through");
}

/**
 * An activity line as it was logged ("Visa •••• 4242: expired_card", maybe after "$45.00 · ") with the trailing code
 * put into words. Text that doesn't end in a card label and a code comes back unchanged.
 */
export function plainDeclineDetail(text: string): string {
  return text.replace(/(•••• \d{4}): ([a-z0-9_]+)$/, (_, card: string, code: string) => `${card}: ${declineWords(code)}`);
}
