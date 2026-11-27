/** 3500 -> "$35", 3550 -> "$35.50". CAD, integer cents everywhere. */
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-CA");
  const rest = abs % 100;
  return `${sign}$${dollars}${rest ? "." + String(rest).padStart(2, "0") : ""}`;
}

/** quantity (may be fractional, e.g. 1.5 hours) x unit price, rounded half-up to the cent. */
export function lineTotal(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}
