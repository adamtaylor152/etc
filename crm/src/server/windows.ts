// Schedule windows: the standard arrival windows, used by online booking and the CRM's scheduling forms.
// Pure (no server imports) so client components can use it too.
export type WindowKey = "overnight" | "early" | "midday" | "evening";
export const WINDOWS: { key: WindowKey; label: string; from: string; to: string; hint: string }[] = [
  { key: "overnight", label: "Overnight", from: "03:00", to: "06:00", hint: "3–6 am" },
  { key: "early", label: "Early", from: "06:00", to: "11:00", hint: "6–11 am" },
  { key: "midday", label: "Mid-day", from: "10:00", to: "17:00", hint: "10 am–5 pm" },
  { key: "evening", label: "Evening", from: "17:00", to: "22:00", hint: "5–10 pm" },
];
export const windowOf = (key: unknown) => WINDOWS.find((w) => w.key === key) ?? null;
