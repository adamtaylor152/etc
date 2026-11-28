// How a recurring job is billed (method) and when it's invoiced. Posts billing, invoiceWhen, invoiceDay.
// `method` fixed = the invoicing-only form on the job page (the method is chosen when the job is made).
import { Field, Input, inputCls } from "./ui";

export function RecurringBillingFields({ method, when = "MONTHLY", invoiceDay, lockMethod = false }: { method?: string; when?: string; invoiceDay?: number | null; lockMethod?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {!lockMethod && (
        <Field label="Billing">
          <select name="billing" defaultValue={method ?? "PER_VISIT"} className={inputCls}>
            <option value="PER_VISIT">Per visit (each visit done adds the line items)</option>
            <option value="FIXED_PRICE">Fixed price per month (the line items&apos; total, however many visits)</option>
          </select>
        </Field>
      )}
      <Field label="Invoice">
        <select name="invoiceWhen" defaultValue={when === "AFTER_EACH_VISIT" ? when : "MONTHLY"} className={inputCls}>
          {(lockMethod ? method !== "FIXED_PRICE" : true) && <option value="AFTER_EACH_VISIT">After each visit</option>}
          <option value="MONTHLY">Once a month</option>
        </select>
      </Field>
      <Field label="Monthly on day" hint="1 to 28. Blank = the 1st"><Input name="invoiceDay" type="number" min={1} max={28} defaultValue={invoiceDay ?? ""} /></Field>
    </div>
  );
}
