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
  serviceMinutes: z.coerce.number().int().min(1).max(240).default(12), // time at a stop, for route ETAs (12 = a snow stop)
  dailyDigest: z.boolean().default(false),          // 6am summary email to owners
  quoteFollowUp: z.boolean().default(true),         // first nudge for unanswered quotes
  quoteFollowUpDays: z.coerce.number().int().min(1).max(60).default(3), // days after sending
  quoteFollowUp2: z.boolean().default(false),       // second nudge
  quoteFollowUp2Days: z.coerce.number().int().min(1).max(60).default(7),
  visitReminders: z.boolean().default(true),        // day-before reminder for scheduled (non-snow) visits
  assignmentAlerts: z.boolean().default(true),      // tell the assigned person when an owner assigns or moves their work
  reminderDaysBefore: z.coerce.number().int().min(1).max(7).default(1), // first visit reminder: this many days ahead...
  reminderHour: z.coerce.number().int().min(6).max(21).default(17),     // ...at this hour (Calgary time)
  clientReschedule: z.boolean().default(false),      // clients can move their own visit to an open window from the reminder link
  reminderMorningOf: z.boolean().default(false),    // second reminder at 7am on the day
  arrivalWindows: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_-]{1,20}$/), label: z.string().trim().min(1).max(20),
    from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).refine((w) => w.from < w.to, "A window has to end after it starts")).min(1).max(6).default(WINDOWS),
  smsUpdates: z.boolean().default(true),            // texts (on my way, all done, storm day) to clients who opted in; needs Telnyx keys
  reviewTrigger: z.enum(["first", "every"]).default("first"),           // ask after the first job of the season, or after every job (capped)
  reviewCapMonths: z.coerce.number().int().min(1).max(36).default(6),   // "every": at most one ask per client in this many months
  reviewRatedMonths: z.coerce.number().int().min(1).max(60).default(12), // never ask someone who rated us this recently
  reviewFollowUp: z.boolean().default(false),       // one reminder if they haven't rated
  reviewFollowUpDays: z.coerce.number().int().min(1).max(30).default(5),
  missedCallText: z.boolean().default(false),       // text back a caller nobody answered, and make a call-back task
  missedCallFromHour: z.coerce.number().int().min(0).max(23).default(8),  // text-backs only go out from this hour...
  missedCallToHour: z.coerce.number().int().min(1).max(24).default(20),   // ...until this one (Calgary time)
  skipNotice: z.boolean().default(false),           // tell the client when their visit was skipped for a reason they can fix
  skipNoticeReasons: z.array(z.enum(["BLOCKED_BY_CAR", "NO_ACCESS", "WEATHER"])).default(["BLOCKED_BY_CAR", "NO_ACCESS"]),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const parseSettings = (raw: unknown): Settings => SettingsSchema.parse(raw && typeof raw === "object" ? raw : {});

export async function getSettings(db: Db, businessId: string): Promise<Settings> {
  const b = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { settings: true } });
  return parseSettings(b.settings);
}

/** The on/off settings (shown as checkboxes in Settings → Automations). */
export type ToggleKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
/** Toggles that come with a "days after sending" number (shown beside the switch). */
export const SETTING_DAYS = { quoteFollowUp: "quoteFollowUpDays", quoteFollowUp2: "quoteFollowUp2Days" } as const satisfies Partial<Record<ToggleKey, keyof Settings>>;
export const SETTING_LABELS: Record<ToggleKey, [string, string]> = {
  visitDoneEmail: ["“All done” email", "Before & after photos to the client after each visit (5 min after Done)."],
  autoSendVisitInvoices: ["Invoice per-visit jobs on Done", "One-off jobs get their invoice right away; the pay link rides in the “all done” email."],
  onMyWayEmail: ["“On my way” email", "Emails the client when you tap On my way."],
  stormHeadsUp: ["Storm heads-up", "Emails every plan client “you’re on our route” when a storm starts."],
  snowAlert: ["Snow alert to owners", "Emails you when the forecast meets a plan trigger in the next 36 hours."],
  allowPartialPayments: ["Partial payments", "New invoices let clients pay part of the balance online (you can change it per invoice)."],
  reviewRequests: ["Google review requests", "Asks clients how the job went, then sends happy ones to Google (needs your review link). How often: Marketing."],
  dailyDigest: ["6am daily digest", "Today’s visits, late work, unbilled charges and failed emails."],
  quoteFollowUp: ["Quote follow-up", "A reminder if the client hasn’t answered, by email or text (however the quote was last sent)."],
  quoteFollowUp2: ["Second quote follow-up", "One more reminder later on. Both stop once the client answers or the quote expires."],
  visitReminders: ["Visit reminders", "Reminder before scheduled visits (not snow), by email and text. Clients can confirm with a tap or by replying YES."],
  clientReschedule: ["Clients can reschedule themselves", "The “confirm or change” link in reminders lets a client pick another open day and arrival window (when the people on the visit are free). You get a notice. Off: they can only ask."],
  reminderMorningOf: ["Morning-of reminder", "A second reminder at 7 am on the day of the visit."],
  assignmentAlerts: ["Assignment alerts to the team", "Emails the person you assign or move work for (and texts them, if their team record has a phone): what, where, when and a link to their route. Never prices."],
  reviewFollowUp: ["Review request reminder", "One reminder a few days later if they haven’t rated (days and who gets asked: Marketing)."],
  missedCallText: ["Missed-call text-back", "Texts a caller nobody answered (“Sorry we missed you”), once per number per day, and adds a call-back task. Hours: Marketing. Needs Telnyx keys."],
  skipNotice: ["“We couldn’t do your visit” notice", "Tells the client, by text and email, when a visit is skipped for a reason they can fix (car in the way, couldn’t get in). Reasons: Marketing."],
  smsUpdates: ["Text updates", "Texts “on the way”, “all done” (with photos link) and storm days to clients who said yes to texts. Needs Telnyx keys."],
};
