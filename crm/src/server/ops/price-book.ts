// Price book rules (pure): what the edit form may save, and the key a new service gets.
// Keys never change after creation: snow pricing looks services up by key (SNOW_KEYS; see drive-size.ts, create.ts).
import { z } from "zod";

export const CATEGORIES = { SNOW: "Snow", CLEANUP: "Clean-up", WASHING: "Washing", FIXUP: "Fix-up", ADDON: "Add-on", OTHER: "Other" } as const;
export const UNITS = { EACH: "each", VISIT: "per visit", PUSH: "per push", HOUR: "per hour", SEASON: "per season" } as const;
/** Services whose price the snow booking flow reads by key. */
export const SNOW_KEYS = ["snow_once", "snow_once_large", "snow_plan_push", "snow_plan_push_large", "extra_walk", "ice_melt"];

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const blank = (v: string) => v.trim() || null;
const dollars = (what: string) => z.string().transform(blank)
  .pipe(z.coerce.number<string>({ error: `${what} must be a number` }).min(0, `${what} can't be negative`).max(100_000, `${what} is too big`).nullable())
  .transform((n) => (n == null ? null : Math.round(n * 100)));

const Form = z.object({
  name: z.string().trim().min(1, "Give the service a name").max(120, "Name is too long"),
  description: z.string().max(500, "Description is too long").transform(blank),
  category: z.enum(keys(CATEGORIES), { error: "Pick a category" }),
  pricingMode: z.enum(["FIXED", "QUOTE"], { error: "Pick fixed price or quote" }),
  price: dollars("Price"),
  unit: z.enum(keys(UNITS), { error: "Pick a unit" }),
  isAddon: z.boolean(),
  duration: z.string().transform(blank)
    .pipe(z.coerce.number<string>({ error: "Duration must be a number" }).int("Duration is in whole minutes").min(1, "Duration must be at least 1 minute").max(1440, "Duration is too long").nullable()),
  cost: dollars("Cost"),
  taxExempt: z.boolean(),
  checklistTemplateId: z.string().transform(blank),
  bookable: z.boolean(),
  bookingLabel: z.string().max(80, "Booking label is too long").transform(blank),
  active: z.boolean(),
}).refine((v) => v.pricingMode === "QUOTE" || v.price != null, "A fixed-price service needs a price (or choose Quote)");

/** Form values -> Service columns. Throws ZodError. "Quote" services carry no price: pickers and /book show a price only when there is one. */
export function serviceInput(raw: Record<keyof z.input<typeof Form>, string | boolean>) {
  const { price, duration, cost, ...v } = Form.parse(raw);
  return { ...v, unitPriceCents: v.pricingMode === "FIXED" ? price : null, defaultDurationMin: duration, unitCostCents: cost };
}

/** Key for a new service: a slug of its name, numbered if taken. */
export function newKey(name: string, taken: string[]) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "service";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/** Ids in their new order after moving `id` one place up (-1) or down (+1). */
export function moved(ids: string[], id: string, dir: -1 | 1) {
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
