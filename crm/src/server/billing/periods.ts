// Recurring jobs: how they're billed and, for a fixed price per month, which months have come due.
// Pure, unit-tested. Dates are YYYY-MM-DD; a period is a calendar month "YYYY-MM".
export type RecurringBilling = { method: "PER_VISIT" | "FIXED_PRICE"; when: "AFTER_EACH_VISIT" | "MONTHLY"; invoiceDay?: number | null };

/** Why this combination can't be used, or null when it's fine. */
export function recurringBillingError(b: RecurringBilling): string | null {
  if (b.method === "FIXED_PRICE" && b.when === "AFTER_EACH_VISIT") return "A fixed monthly price is invoiced once a month: pick monthly or a day of the month";
  if (b.invoiceDay != null && (!Number.isInteger(b.invoiceDay) || b.invoiceDay < 1 || b.invoiceDay > 28)) return "Pick an invoice day from 1 to 28";
  return null;
}

/** Is today the day a monthly-invoiced job is billed? (null = the 1st) */
export const isInvoiceDay = (today: string, invoiceDay: number | null) => Number(today.slice(8)) === (invoiceDay ?? 1);

export type PeriodTerms = {
  startsOn: string; // first day the job runs (never earlier than the day it was created: nothing is back-billed)
  endsOn: string | null; // last visit day of a job that ends
  invoiceDay: number | null;
  pausedFrom?: string | null; pausedUntil?: string | null;
};
export type Period = { period: string; dueOn: string };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

/**
 * Months whose flat price is due by `today`: each month from the start month to the end month, on the invoice day
 * (the first month on the start day if that's later). A month that falls wholly inside the pause is not billed.
 */
export function periodsDue(t: PeriodTerms, today: string): Period[] {
  const out: Period[] = [];
  const end = t.endsOn && t.endsOn < today ? t.endsOn : today;
  let y = Number(t.startsOn.slice(0, 4)), m = Number(t.startsOn.slice(5, 7));
  for (; `${y}-${pad(m)}` <= end.slice(0, 7); m === 12 ? (y++, m = 1) : m++) {
    const period = `${y}-${pad(m)}`;
    const day = `${period}-${pad(t.invoiceDay ?? 1)}`, dueOn = day < t.startsOn ? t.startsOn : day;
    const paused = (t.pausedFrom || t.pausedUntil) && (!t.pausedFrom || t.pausedFrom <= `${period}-01`) && (!t.pausedUntil || t.pausedUntil >= `${period}-${pad(lastDay(y, m))}`);
    if (dueOn <= today && !paused) out.push({ period, dueOn });
  }
  return out;
}

/** Unique marker on a period's invoice (Invoice.instalmentKey, as seasonal instalments use): a month is never invoiced twice. */
export const periodKey = (jobId: string, period: string) => `${jobId}:${period}`;

/** "March 2027" for a period. */
export const periodLabel = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
