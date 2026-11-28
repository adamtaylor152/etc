// How money is written. CAD, integer cents everywhere. Two formats, one rule for which to use:
//  - `cad`: on every screen and document that shows invoice, payment or report money. Always two decimals, so
//    "$50.00" sits beside "$11,635.50" and a column lines up.
//  - `money`: in a sentence sent to a client (emails, texts, the booking estimate, a quoted price), where "$35" reads
//    better than "$35.00". Cents show only when there are some.
const parts = (cents: number) => {
  const abs = Math.abs(Math.round(cents));
  return { dollars: Math.floor(abs / 100).toLocaleString("en-CA"), rest: String(abs % 100).padStart(2, "0"), whole: abs % 100 === 0 };
};

/** 3500 -> "$35.00", 1163550 -> "$11,635.50". Negatives use a true minus sign. */
export function cad(cents: number): string {
  const p = parts(cents);
  return `${cents < 0 ? "−" : ""}$${p.dollars}.${p.rest}`;
}

/** 3500 -> "$35", 3550 -> "$35.50". For prices inside a sentence; use `cad` for amounts on a page. */
export function money(cents: number): string {
  const p = parts(cents);
  return `${cents < 0 ? "-" : ""}$${p.dollars}${p.whole ? "" : "." + p.rest}`;
}

/** quantity (may be fractional, e.g. 1.5 hours) x unit price, rounded half-up to the cent. */
export function lineTotal(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}
