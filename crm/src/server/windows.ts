// Arrival windows: what clients are offered online and what the scheduling forms fill in with one tap.
// The business can change them in Settings; these are the defaults. Pure (no server imports) so client components can use it.
export type Win = { key: string; label: string; from: string; to: string };
export const WINDOWS: Win[] = [
  { key: "overnight", label: "Overnight", from: "03:00", to: "06:00" },
  { key: "early", label: "Early", from: "06:00", to: "11:00" },
  { key: "midday", label: "Mid-day", from: "10:00", to: "17:00" },
  { key: "evening", label: "Evening", from: "17:00", to: "22:00" },
];
const clock = (hm: string) => { const [h, m] = hm.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`; };
/** "6–11 am", "10 am–5 pm". Pure, unit-tested. */
export function windowHint(w: Pick<Win, "from" | "to">) {
  const ap = (hm: string) => (Number(hm.slice(0, 2)) < 12 ? "am" : "pm");
  return ap(w.from) === ap(w.to) ? `${clock(w.from)}–${clock(w.to)} ${ap(w.to)}` : `${clock(w.from)} ${ap(w.from)}–${clock(w.to)} ${ap(w.to)}`;
}
export const withHints = (ws: Win[]) => ws.map((w) => ({ ...w, hint: windowHint(w) }));
export const windowOf = (ws: Win[], key: unknown) => ws.find((w) => w.key === key) ?? null;
