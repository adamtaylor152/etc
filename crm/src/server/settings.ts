// Business.settings JSON, typed with defaults. Every automation switch lives here (Settings → Automations).
import { z } from "zod";
import type { Db } from "./db";
import { WINDOWS } from "./windows";

export const SettingsSchema = z.object({
  visitDoneEmail: z.boolean().default(true),        // "all done" email with before/after photos
  autoSendVisitInvoices: z.boolean().default(true), // per-visit jobs: invoice issued on Done, pay link in the email
  onMyWayEmail: z.boolean().default(false),         // email the client when the crew taps "On my way"
  stormHeadsUp: z.boolean().default(false),         // email plan clients "you're on our route" when a storm starts
  snowAlert: z.boolean().default(true),             // email owners when the forecast meets a plan trigger
  reviewRequests: z.boolean().default(false),
  allowPartialPayments: z.boolean().default(false),
  reviewDelayHours: z.coerce.number().int().min(1).max(240).default(24), // after a visit is done
  referralRewardCents: z.coerce.number().int().min(0).max(50_000).default(1000), // credit for the referrer
  referralDiscountCents: z.coerce.number().int().min(0).max(50_000).default(0), // credit for the new client // new invoices let clients pay part online       // ask for a Google review after the first job of the season
  dailyDigest: z.boolean().default(false),          // 6am summary email to owners
  quoteFollowUp: z.boolean().default(true),         // nudge unanswered quotes after 3 days
  visitReminders: z.boolean().default(true),        // day-before reminder for scheduled (non-snow) visits
  reminderDaysBefore: z.coerce.number().int().min(1).max(7).default(1), // first visit reminder: this many days ahead...
  reminderHour: z.coerce.number().int().min(6).max(21).default(17),     // ...at this hour (Calgary time)
  reminderMorningOf: z.boolean().default(false),    // second reminder at 7am on the day
  arrivalWindows: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_-]{1,20}$/), label: z.string().trim().min(1).max(20),
    from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).refine((w) => w.from < w.to, "A window has to end after it starts")).min(1).max(6).default(WINDOWS),
  smsUpdates: z.boolean().default(true),            // texts (on my way, all done, storm day) to clients who opted in; needs Telnyx keys
});
export type Settings = z.infer<typeof SettingsSchema>;

export const parseSettings = (raw: unknown): Settings => SettingsSchema.parse(raw && typeof raw === "object" ? raw : {});

export async function getSettings(db: Db, businessId: string): Promise<Settings> {
  const b = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { settings: true } });
  return parseSettings(b.settings);
}

/** The on/off settings (shown as checkboxes in Settings → Automations). */
export type ToggleKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
export const SETTING_LABELS: Record<ToggleKey, [string, string]> = {
  visitDoneEmail: ["“All done” email", "Before & after photos to the client after each visit (5 min after Done)."],
  autoSendVisitInvoices: ["Invoice per-visit jobs on Done", "One-off jobs get their invoice right away; the pay link rides in the “all done” email."],
  onMyWayEmail: ["“On my way” email", "Emails the client when you tap On my way."],
  stormHeadsUp: ["Storm heads-up", "Emails every plan client “you’re on our route” when a storm starts."],
  snowAlert: ["Snow alert to owners", "Emails you when the forecast meets a plan trigger in the next 36 hours."],
  allowPartialPayments: ["Partial payments", "New invoices let clients pay part of the balance online (you can change it per invoice)."],
  reviewRequests: ["Google review requests", "Asks happy clients for a review after their first job of the season (needs your review link)."],
  dailyDigest: ["6am daily digest", "Today’s visits, late work, unbilled charges and failed emails."],
  quoteFollowUp: ["Quote follow-up", "One reminder 3 days after sending if the client hasn’t answered."],
  visitReminders: ["Visit reminders", "Reminder before scheduled visits (not snow), by email and text. Clients can confirm with a tap or by replying YES."],
  reminderMorningOf: ["Morning-of reminder", "A second reminder at 7 am on the day of the visit."],
  smsUpdates: ["Text updates", "Texts “on the way”, “all done” (with photos link) and storm days to clients who said yes to texts. Needs Telnyx keys."],
};
