// What the owner can reword (Settings › Messages), and the rules for it. Pure (no Node imports), so the browser editor
// uses the same functions: {{variables}}, which messages are editable, and the parts a text can't go without.
import type { TemplateName } from "./templates";

const VAR = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Put values into {{variables}}. One pass (a value is never read as a variable); a variable we don't have becomes nothing. */
export const fill = (text: string, vars: Record<string, string>) => text.replace(VAR, (_, k: string) => vars[k] ?? "");

/** Variables used in `text` that this message can't supply (they would send as nothing). */
export const unknownVars = (text: string, allowed: readonly string[]) => [...new Set([...text.matchAll(VAR)].map((m) => m[1]))].filter((k) => !allowed.includes(k));

export const VAR_HELP: Record<string, string> = {
  first_name: "the client's first name", business_name: "your business name", business_phone: "your phone number",
  address: "where the work is", service: "what was booked", visit_date: "the day of the visit", day: "“tomorrow”, “today” or the weekday",
  booking_number: "the booking number", services: "the services booked", estimate: "the estimate on the booking",
  quote_number: "the quote number", quote_title: "what the quote is for", total: "the total", valid_until: "the day the quote expires",
  invoice_number: "the invoice number", invoice_subject: "what the invoice is for", balance: "what is still owing", due_date: "the due date",
  amount: "the amount", payment_method: "how it was paid", card: "the saved card (“Visa ending 4242”)", decline_reason: "why the bank said no",
  period: "the dates the statement covers", season: "the snow season", price: "the price", old_price: "the price before",
  link: "the link this text is for", arrival: "“, arriving around 9:00-9:30am” when we know, otherwise nothing",
};
export type Wording = { subject?: string | null; intro?: string | null; closing?: string | null };
export const COMMON_VARS = ["first_name", "business_name", "business_phone"] as const;

export const GROUPS = ["Booking", "Visits", "Quotes", "Invoices & payments", "Reminders", "Other"] as const;
type Meta = { group: (typeof GROUPS)[number]; label: string; trigger: string; vars: string[] };
type EmailMeta = Meta & { closing?: true };

const INVOICE_VARS = ["invoice_number", "invoice_subject", "total", "balance", "due_date"];
const QUOTE_VARS = ["quote_number", "quote_title", "total", "valid_until"];
const VISIT_VARS = ["service", "visit_date", "address"];

/** Client emails with wording the owner can change. Owner and team notices, the sign-in link and campaigns are not here. */
export const EMAIL_META = {
  "booking.confirmation": { group: "Booking", label: "Booking received", trigger: "Someone books on the website.", vars: ["booking_number", "services", "estimate"] },
  "photo_upload.request": { group: "Booking", label: "Send us photos", trigger: "You ask for photos on a request.", vars: ["services"] },
  "price.change": { group: "Booking", label: "Bigger driveway price", trigger: "You change the driveway size on a snow job and ask the client to confirm.", vars: ["address", "price", "old_price"] },
  "visit.scheduled": { group: "Visits", label: "You're booked", trigger: "You email a client their visit date.", vars: VISIT_VARS },
  "visit.on_my_way": { group: "Visits", label: "On our way", trigger: "The crew taps On my way (if the automation is on).", vars: ["address"] },
  "storm.heads_up": { group: "Visits", label: "Snow day heads-up", trigger: "A storm is started (if the automation is on).", vars: ["address"] },
  "visit.done": { group: "Visits", label: "All done", trigger: "A visit is marked done (if the automation is on).", vars: VISIT_VARS },
  "quote.sent": { group: "Quotes", label: "Your quote", trigger: "You send a quote. A message typed on the quote itself is used instead of this opening.", vars: QUOTE_VARS },
  "quote.follow_up": { group: "Quotes", label: "Quote follow-up", trigger: "A quote has had no answer for a few days. A message typed on the quote itself is used instead of this opening.", vars: QUOTE_VARS },
  "quote.approved": { group: "Quotes", label: "Quote approved", trigger: "A client approves a quote.", vars: QUOTE_VARS },
  "invoice.sent": { group: "Invoices & payments", label: "Your invoice", trigger: "You send an invoice. A message typed on the invoice is added under this opening.", vars: INVOICE_VARS },
  "payment.receipt": { group: "Invoices & payments", label: "Payment receipt", trigger: "A payment is recorded or a card is charged.", vars: [...INVOICE_VARS, "amount", "payment_method"] },
  "payment.refund": { group: "Invoices & payments", label: "Refund", trigger: "You refund a payment.", vars: [...INVOICE_VARS, "amount"], closing: true },
  "autopay.failed": { group: "Invoices & payments", label: "Card payment failed", trigger: "An automatic card charge is declined or needs the client's approval.", vars: [...INVOICE_VARS, "card", "decline_reason"] },
  "client.statement": { group: "Invoices & payments", label: "Statement", trigger: "You email a client their statement.", vars: ["balance", "period"] },
  "visit.reminder": { group: "Reminders", label: "Visit reminder", trigger: "The day(s) before a scheduled visit.", vars: [...VISIT_VARS, "day"] },
  "invoice.reminder": { group: "Reminders", label: "Invoice reminder", trigger: "An invoice is overdue (first and second reminder share this wording).", vars: INVOICE_VARS },
  "plan.renewal": { group: "Reminders", label: "Snow plan renewal", trigger: "You invite last winter's plan clients to renew.", vars: ["season", "price"] },
  "hub.link": { group: "Other", label: "Client page link", trigger: "You email a client the link to their page.", vars: [] },
  "review.request": { group: "Other", label: "Review request", trigger: "After a client's first job of the season (if the automation is on).", vars: [], closing: true },
} satisfies Partial<Record<TemplateName, EmailMeta>>;
export type EmailKey = keyof typeof EMAIL_META;
export const emailMeta = (k: string): EmailMeta | undefined => (EMAIL_META as Record<string, EmailMeta>)[k];

// ---------- texts ----------
/** A part a text must keep. If the owner's wording drops it, `add` goes back on the end. */
type Part = { what: string; has: (body: string) => boolean; add: string };
const LINK: Part = { what: "the link", has: (b) => /\{\{\s*link\s*\}\}/.test(b), add: " {{link}}" };
const FROM: Part = { what: "who it's from", has: (b) => /etc\.|\{\{\s*business_name\s*\}\}/i.test(b), add: " - etc." };
const STOP: Part = { what: "how to opt out", has: (b) => /reply stop/i.test(b), add: " (Reply STOP to opt out)" };

type SmsMeta = Meta & { text: string; required: Part[]; sample: Record<string, string> };
const SAMPLE = { first_name: "Sam", business_name: "etc.", business_phone: "403-555-0100", address: "123 Sample St SW", link: "https://crm.etccrew.ca/v/Ab3dE6gH9jK2mN5pQ8rT1uW4" };

/** Client texts with wording the owner can change; `text` is the built-in wording. Campaign, team and opt-in texts are not here. */
export const SMS_META = {
  "sms.on_my_way": { group: "Visits", label: "On our way", trigger: "The crew taps On my way.", vars: ["address", "arrival"], required: [FROM, STOP], sample: { ...SAMPLE, arrival: ", arriving around 9:00-9:30am" },
    text: "Hi {{first_name}}, the etc. crew is on the way to {{address}}{{arrival}}. No need to be home. - etc. (Reply STOP to opt out)" },
  "sms.visit_done": { group: "Visits", label: "All done", trigger: "A visit is marked done.", vars: ["address", "link"], required: [LINK, FROM], sample: SAMPLE,
    text: "All done at {{address}}! Before & after photos: {{link}} - etc." },
  "sms.storm_heads_up": { group: "Visits", label: "Snow day heads-up", trigger: "A storm is started.", vars: ["address"], required: [FROM], sample: SAMPLE,
    text: "Snow day! {{first_name}}, you're on our route today for {{address}}. Away? Just reply. - etc." },
  "sms.quote": { group: "Quotes", label: "Your quote", trigger: "You text a quote.", vars: ["quote_title", "total", "link"], required: [LINK, FROM], sample: { ...SAMPLE, quote_title: "Fall yard cleanup", total: "$180" },
    text: "Hi {{first_name}}, your etc. quote for {{quote_title}} ({{total}}) is ready. See and approve it here: {{link}} - etc." },
  "sms.quote_follow_up": { group: "Quotes", label: "Quote follow-up", trigger: "A texted quote has had no answer for a few days.", vars: ["quote_title", "total", "link"], required: [LINK, FROM], sample: { ...SAMPLE, quote_title: "Fall yard cleanup", total: "$180" },
    text: "Hi {{first_name}}, any questions about your etc. quote for {{quote_title}}? See or approve it here: {{link}} - etc." },
  "sms.visit_reminder": { group: "Reminders", label: "Visit reminder", trigger: "The day(s) before a scheduled visit. A reply of YES confirms it.", vars: ["address", "day", "link"], required: [LINK, FROM], sample: { ...SAMPLE, day: "tomorrow" },
    text: "Hi {{first_name}}, etc. is booked for {{address}} {{day}}. Reply YES to confirm, or change it here: {{link}} - etc." },
  "sms.price_change": { group: "Booking", label: "Bigger driveway price", trigger: "You change the driveway size on a snow job and ask the client to confirm.", vars: ["address", "price", "link"], required: [LINK, FROM], sample: { ...SAMPLE, price: "$60 per snowfall" },
    text: "Hi {{first_name}}, we checked {{address}}: it's bigger than a standard driveway, so it's {{price}}. OK it or cancel (no charge): {{link}} - etc." },
  "sms.review_request": { group: "Other", label: "Review request", trigger: "After a client's first job of the season.", vars: ["link"], required: [LINK, FROM], sample: SAMPLE,
    text: "Hi {{first_name}}, thanks for choosing etc.! How did we do? {{link}} - etc." },
  "sms.referral_thanks": { group: "Other", label: "Referral thank-you", trigger: "Someone they referred becomes a client.", vars: ["amount"], required: [FROM], sample: { ...SAMPLE, amount: "$10" },
    text: "Thanks for sending a neighbour our way, {{first_name}}! {{amount}} off your next etc. invoice. - etc." },
} satisfies Record<string, SmsMeta>;
export type SmsKey = keyof typeof SMS_META;
export const smsMeta = (k: string): SmsMeta | undefined => (SMS_META as Record<string, SmsMeta>)[k];

/** The owner's wording with any required part it left out put back on the end. `added` says which, for the editor. */
export function withRequired(body: string, key: SmsKey) {
  const missing = SMS_META[key].required.filter((p) => !p.has(body));
  return { body: body.trim() + missing.map((p) => p.add).join(""), added: missing.map((p) => p.what) };
}

/** The text to send: the owner's wording when there is one, otherwise the built-in. */
export const smsText = (key: SmsKey, override: string | null | undefined, vars: Record<string, string>) =>
  fill(override?.trim() ? withRequired(override, key).body : SMS_META[key].text, vars);

export const allowedVars = (key: string) => [...COMMON_VARS, ...(emailMeta(key) ?? smsMeta(key))?.vars ?? []];
