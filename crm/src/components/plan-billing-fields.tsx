// How a snow plan is billed: shared by the new-plan form and the job page. Plain inputs (no JS): the seasonal
// fields are only read when "Seasonal" is picked.
import type { SnowBillingMode } from "@/generated/prisma/client";
import { Field, Input, inputCls } from "@/components/ui";

export const PLAN_MODE: Record<SnowBillingMode, string> = { PER_PUSH: "Per push", PER_EVENT: "Per storm", SEASONAL: "Seasonal flat price" };

export function PlanBillingFields(p: { mode?: SnowBillingMode; seasonPriceCents?: number | null; instalments?: number | null; firstDueOn: string; addonsIncluded?: boolean }) {
  return (
    <div className="space-y-3">
      <Field label="Billing">
        <select name="mode" defaultValue={p.mode ?? "PER_PUSH"} className={inputCls}>
          <option value="PER_PUSH">Per push: the price above every time we clear</option>
          <option value="PER_EVENT">Per storm: the price above once per storm, however many pushes</option>
          <option value="SEASONAL">Seasonal: one flat price for the whole season</option>
        </select>
      </Field>
      <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
        <legend className="px-1 text-sm font-bold">Seasonal only</legend>
        <Field label="Season price ($)"><Input name="seasonPrice" type="number" step="0.01" min={0} defaultValue={p.seasonPriceCents ? p.seasonPriceCents / 100 : ""} /></Field>
        <Field label="Paid">
          <select name="instalments" defaultValue={p.instalments ?? 1} className={inputCls}>
            <option value={1}>In full up front</option>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} monthly instalments</option>)}
          </select>
        </Field>
        <Field label="First payment due"><Input name="firstDueOn" type="date" defaultValue={p.firstDueOn} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold max-sm:min-h-11 sm:col-span-3"><input type="checkbox" name="addonsIncluded" defaultChecked={p.addonsIncluded ?? true} className="size-5" /> Ice melt is included in the season price</label>
        <p className="text-xs text-ink-soft sm:col-span-3">Each payment is invoiced and emailed automatically on its due date: the first on the date above, the rest on the 1st of each following month.</p>
      </fieldset>
    </div>
  );
}
