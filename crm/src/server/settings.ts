// Business.settings JSON, typed with defaults. Every automation switch lives here (Settings → Automations).
import { z } from "zod";
import type { Db } from "./db";

export const SettingsSchema = z.object({
  visitDoneEmail: z.boolean().default(true),        // "all done" email with before/after photos
  autoSendVisitInvoices: z.boolean().default(true), // per-visit jobs: invoice issued on Done, pay link in the email
  onMyWayEmail: z.boolean().default(false),         // email the client when the crew taps "On my way"
  stormHeadsUp: z.boolean().default(false),         // email plan clients "you're on our route" when a storm starts
  snowAlert: z.boolean().default(true),             // email owners when the forecast meets a plan trigger
  reviewRequests: z.boolean().default(false),       // ask for a Google review after the first job of the season
  dailyDigest: z.boolean().default(false),          // 6am summary email to owners
  quoteFollowUp: z.boolean().default(true),         // nudge unanswered quotes after 3 days
  visitReminders: z.boolean().default(true),        // day-before reminder for scheduled (non-snow) visits
  smsUpdates: z.boolean().default(true),            // texts (on my way, all done, storm day) to clients who opted in; needs Telnyx keys
});
export type Settings = z.infer<typeof SettingsSchema>;

export const parseSettings = (raw: unknown): Settings => SettingsSchema.parse(raw && typeof raw === "object" ? raw : {});

export async function getSettings(db: Db, businessId: string): Promise<Settings> {
  const b = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { settings: true } });
  return parseSettings(b.settings);
}

export const SETTING_LABELS: Record<keyof Settings, [string, string]> = {
  visitDoneEmail: ["“All done” email", "Before & after photos to the client after each visit (5 min after Done)."],
  autoSendVisitInvoices: ["Invoice per-visit jobs on Done", "One-off jobs get their invoice right away; the pay link rides in the “all done” email."],
  onMyWayEmail: ["“On my way” email", "Emails the client when you tap On my way."],
  stormHeadsUp: ["Storm heads-up", "Emails every plan client “you’re on our route” when a storm starts."],
  snowAlert: ["Snow alert to owners", "Emails you when the forecast meets a plan trigger in the next 36 hours."],
  reviewRequests: ["Google review requests", "Asks happy clients for a review after their first job of the season (needs your review link)."],
  dailyDigest: ["6am daily digest", "Today’s visits, late work, unbilled charges and failed emails."],
  quoteFollowUp: ["Quote follow-up", "One reminder 3 days after sending if the client hasn’t answered."],
  visitReminders: ["Visit reminders", "Day-before reminder for scheduled visits (not snow)."],
  smsUpdates: ["Text updates", "Texts “on the way”, “all done” (with photos link) and storm days to clients who said yes to texts. Needs Telnyx keys."],
};
