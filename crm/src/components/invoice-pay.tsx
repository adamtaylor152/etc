// How to pay an invoice balance: card (Stripe Checkout, when it is switched on) or Interac e-Transfer with the ETC- reference.
// One block for the invoice page and for the quote page, where the deposit is due right after approving.
import { payByCard } from "@/app/(public)/i/[token]/actions";
import { money } from "@/server/money";
import { TIP_PERCENTS, tipCents } from "@/server/billing/adjustments";
import { stripeEnabled } from "@/server/stripe";

const chip = "cursor-pointer rounded-full border border-line bg-white px-3 py-2 text-sm font-semibold has-[:checked]:border-blue has-[:checked]:bg-blue has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue/40";
import { Button, Card } from "./ui";

/** `token` is the invoice's link token; `quoteToken` (deposits) sends the client back to their quote after paying. */
/** `offerSave`: saved cards are switched on and this client has none yet, so offer to keep this one (their own tick boxes). */
export function InvoicePay({ token, quoteToken, balanceCents, allowPartial, etransfer, etransferRef, offerSave, tipOn }: {
  /** Tips are switched on: the invoice total the percentages are worked out from. */
  tipOn?: number; offerSave?: boolean; token: string; quoteToken?: string; balanceCents: number; allowPartial: boolean; etransfer: string | null; etransferRef: string | null;
}) {
  return (
    <div className="no-print space-y-3">
      {stripeEnabled() && (
        <form action={payByCard} className="space-y-2"><input type="hidden" name="t" value={token} />{quoteToken && <input type="hidden" name="q" value={quoteToken} />}
          {allowPartial && <label className="flex items-center justify-between gap-2 text-sm font-semibold">Amount to pay<span className="flex items-center gap-1">$<input name="amount" type="number" step="0.01" min="0.50" max={balanceCents / 100} defaultValue={(balanceCents / 100).toFixed(2)} className="min-h-11 w-32 rounded-lg border border-line px-2 text-right" /></span></label>}
          {tipOn != null && (
            <fieldset className="rounded-lg border border-line bg-white p-3">
              <legend className="px-1 text-sm font-semibold">Add a tip for the crew? <span className="font-normal text-ink-soft">Optional</span></legend>
              <div className="flex flex-wrap items-center gap-2">
                <label className={chip}><input type="radio" name="tip" value="" defaultChecked className="sr-only" />No tip</label>
                {TIP_PERCENTS.map((p) => <label key={p} className={chip}><input type="radio" name="tip" value={p} className="sr-only" />{p}% · {money(tipCents(tipOn, String(p)))}</label>)}
                <label className="flex items-center gap-1 text-sm font-semibold">Other $<input name="tipCustom" type="number" step="0.01" min="0" max="500" inputMode="decimal" className="min-h-10 w-24 rounded-lg border border-line px-2 text-right" /></label>
              </div>
            </fieldset>
          )}
          <Button className="min-h-14 w-full text-base">{allowPartial || tipOn != null ? "Pay by card" : `Pay ${money(balanceCents)} by card`}</Button>
          {offerSave && <>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="save" className="mt-0.5 size-5 shrink-0" /><span>Save this card for future invoices</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="autopay" className="mt-0.5 size-5 shrink-0" /><span>Charge this card automatically for my future invoices. We&apos;ll email each invoice first, with the date the card will be charged; you can turn this off any time on your etc. page.</span></label>
          </>}
        </form>
      )}
      {etransfer && (
        <Card title="Pay by e-Transfer">
          <p className="text-sm">Send <b>{money(balanceCents)}</b> to <b className="select-all">{etransfer}</b> and put <b className="select-all">{etransferRef}</b> in the message so we can match it.</p>
        </Card>
      )}
      <p className="text-center text-sm text-ink-soft">Or pay the crew in cash.</p>
    </div>
  );
}
