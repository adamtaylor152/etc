// Seasonal snow plans: the flat season price is billed as instalments, each an ordinary invoice.
// Pure, unit-tested. Integer cents; dates are YYYY-MM-DD.
export type Instalment = { n: number; dueOn: string; amountCents: number };

/** Split a total into `count` amounts that sum exactly: leftover cents go on the earliest ones. */
export function splitCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count), extra = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
const firstOfMonth = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;

/** The most monthly instalments that fit: one per month from the first due date's month to the season's last month. */
export const maxInstalments = (firstDueOn: string, seasonEndsOn: string) => Math.max(0, monthIndex(seasonEndsOn) - monthIndex(firstDueOn) + 1);

/** Instalment 1 is due on `firstDueOn`, the rest on the 1st of each following month. count 1 = paid in full up front. */
export function instalmentSchedule(totalCents: number, count: number, firstDueOn: string): Instalment[] {
  const m = monthIndex(firstDueOn);
  return splitCents(totalCents, count).map((amountCents, i) => ({ n: i + 1, dueOn: i ? firstOfMonth(m + i) : firstDueOn, amountCents }));
}

/** Why these seasonal terms can't be used, or null when they're fine. */
export function seasonalTermsError(t: { priceCents: number | null; count: number | null; firstDueOn: string; seasonEndsOn: string }): string | null {
  if (!t.priceCents || !Number.isInteger(t.priceCents) || t.priceCents <= 0) return "Enter the season price";
  const max = maxInstalments(t.firstDueOn, t.seasonEndsOn);
  if (max < 1) return "The first payment has to be due before the season ends";
  if (!t.count || !Number.isInteger(t.count) || t.count < 1) return "Pick how many instalments";
  if (t.count > max) return `Only ${max} monthly instalment${max === 1 ? "" : "s"} fit before the season ends`;
  return null;
}

/** Unique marker on an instalment's invoice: re-running billing never invoices the same instalment twice. */
export const instalmentKey = (jobId: string, n: number) => `${jobId}:${n}`;

/**
 * Billing mode, season price and instalment plan can only change while nothing has been charged or invoiced under the
 * current terms: no visit charge (billed or not) and no instalment invoice (even a void one).
 */
export const planBillingLocked = (p: { visitCharges: number; instalmentInvoices: number }) => p.visitCharges > 0 || p.instalmentInvoices > 0;
