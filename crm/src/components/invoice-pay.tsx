// How to pay an invoice balance: Interac e-Transfer with the ETC- reference first (what most clients use), then card
// (Stripe Checkout, when it is switched on), then cash.
// One block for the invoice page and for the quote page, where the deposit is due right after approving. It draws no
// card of its own: the page puts it inside one.
import { payByCard } from "@/app/(public)/i/[token]/actions";
import { cad } from "@/server/money";
import { TIP_PERCENTS, tipCents } from "@/server/billing/adjustments";
import { stripeEnabled } from "@/server/stripe";
import { CopyField } from "./public/copy-field";
import { Cta, TickRow } from "./public/kit";
import { inputCls } from "./ui";

const chip = "flex min-h-[52px] cursor-pointer flex-col items-center justify-center rounded-lg border border-line bg-white px-2 text-center font-semibold leading-tight hover:border-ink-faint/60 has-[:checked]:border-blue has-[:checked]:bg-blue has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue";
const h3 = "font-display text-[1.05rem] font-semibold";

/** `token` is the invoice's link token; `quoteToken` (deposits) sends the client back to their quote after paying. */
/** `offerSave`: saved cards are switched on and this client has none yet, so offer to keep this one (their own tick boxes). */
export function InvoicePay({ token, quoteToken, balanceCents, allowPartial, etransfer, etransferRef, offerSave, tipOn }: {
  /** Tips are switched on: the invoice total the percentages are worked out from. */
  tipOn?: number; offerSave?: boolean; token: string; quoteToken?: string; balanceCents: number; allowPartial: boolean; etransfer: string | null; etransferRef: string | null;
}) {
  return (
    <div className="no-print divide-y divide-line-soft [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      {etransfer && (
        <section aria-labelledby="pay-etransfer">
          <h3 id="pay-etransfer" className={h3}>Interac e-Transfer</h3>
          <p className="mt-1 text-ink-soft">Send <b className="font-semibold text-navy tabular-nums">{cad(balanceCents)}</b> from your bank&apos;s app or website.</p>
          <div className="mt-3 space-y-3">
            <CopyField label="Send to" value={etransfer} />
            {etransferRef && <CopyField label="Message" value={etransferRef} hint="Put this in the message so we can match it." />}
          </div>
        </section>
      )}
      {stripeEnabled() && (
        <form action={payByCard} aria-labelledby="pay-card" className="space-y-4"><input type="hidden" name="t" value={token} />{quoteToken && <input type="hidden" name="q" value={quoteToken} />}
          <h3 id="pay-card" className={h3}>Card</h3>
          {allowPartial && (
            <label className="flex items-center justify-between gap-3 font-semibold">Amount to pay
              <span className="flex items-center gap-1.5">$<input name="amount" type="number" step="0.01" min="0.50" max={balanceCents / 100} defaultValue={(balanceCents / 100).toFixed(2)} inputMode="decimal" className={`${inputCls} min-h-[52px] w-32 text-right text-lg! tabular-nums`} /></span>
            </label>
          )}
          {tipOn != null && (
            <fieldset>
              <legend className="mb-2 font-semibold">Add a tip for the crew? <span className="font-normal text-ink-soft">Optional</span></legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className={chip}><input type="radio" name="tip" value="" defaultChecked className="sr-only" />No tip</label>
                {TIP_PERCENTS.map((p) => <label key={p} className={chip}><input type="radio" name="tip" value={p} className="sr-only" />{p}%<span className="text-sm font-normal tabular-nums opacity-80">{cad(tipCents(tipOn, String(p)))}</span></label>)}
              </div>
              <label className="mt-2 flex items-center justify-between gap-3 font-semibold">Other amount
                <span className="flex items-center gap-1.5">$<input name="tipCustom" type="number" step="0.01" min="0" max="500" inputMode="decimal" className={`${inputCls} min-h-11 w-28 text-right tabular-nums`} /></span>
              </label>
            </fieldset>
          )}
          {offerSave && (
            <div className="space-y-2">
              <TickRow name="save">Save this card for future invoices</TickRow>
              <TickRow name="autopay">Charge this card automatically for my future invoices. We&apos;ll email each invoice first, with the date the card will be charged; you can turn this off any time on your etc. page.</TickRow>
            </div>
          )}
          <Cta>{allowPartial || tipOn != null ? "Pay by card" : `Pay ${cad(balanceCents)} by card`}</Cta>
          <p className="text-center text-sm text-ink-soft">You&apos;ll type your card on Stripe&apos;s secure page.</p>
        </form>
      )}
      <p className="text-ink-soft">Or pay the crew in cash.</p>
    </div>
  );
}
