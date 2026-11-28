// How a phone number reads on screen, everywhere: "(403) 555-9876". Display only: stored values, tel: links, emails
// and texts keep the number as it was saved. Anything that is not a ten-digit North American number is shown as typed.
export function prettyPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}
