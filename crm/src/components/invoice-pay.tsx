// How to pay an invoice balance: card (Stripe Checkout, when it is switched on) or Interac e-Transfer with the ETC- reference.
// One block for the invoice page and for the quote page, where the deposit is due right after approving.
import { payByCard } from "@/app/(public)/i/[token]/actions";
import { money } from "@/server/money";
import { stripeEnabled } from "@/server/stripe";
import { Button, Card } from "./ui";

/** `token` is the invoice's link token; `quoteToken` (deposits) sends the client back to their quote after paying. */
export function InvoicePay({ token, quoteToken, balanceCents, allowPartial, etransfer, etransferRef }: {
  token: string; quoteToken?: string; balanceCents: number; allowPartial: boolean; etransfer: string | null; etransferRef: string | null;
}) {
  return (
    <div className="no-print space-y-3">
      {stripeEnabled() && (
        <form action={payByCard} className="space-y-2"><input type="hidden" name="t" value={token} />{quoteToken && <input type="hidden" name="q" value={quoteToken} />}
          {allowPartial && <label className="flex items-center justify-between gap-2 text-sm font-semibold">Amount to pay<span className="flex items-center gap-1">$<input name="amount" type="number" step="0.01" min="0.50" max={balanceCents / 100} defaultValue={(balanceCents / 100).toFixed(2)} className="min-h-11 w-32 rounded-lg border border-line px-2 text-right" /></span></label>}
          <Button className="min-h-14 w-full text-base">{allowPartial ? "Pay by card" : `Pay ${money(balanceCents)} by card`}</Button></form>
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
