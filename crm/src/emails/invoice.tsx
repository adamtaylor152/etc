import { BLUE, BODY_FONT, Button, EtcEmail, Eyebrow, FONT, Footer, H1, Header, INK_SOFT, LINE, NAVY, P, Table, TINT, firstName } from "./ui";

export type InvoiceEmailData = {
  name: string; number: number; subject: string; issued: string; due: string; lines: { name: string; date: string; amount: string }[];
  total: string; discount: string | null; message: string | null; paid: string | null; balance: string; taxNote: string | null; payUrl: string; etransferEmail: string; etransferRef: string;
  cardEnabled: boolean; site: string; phone: string;
  autoPay?: { card: string; on: string; retry: boolean } | null; // set while the saved card is going to be charged: "Visa ending 4242", "Thu, Dec 4"
};

function Lines({ d }: { d: InvoiceEmailData }) {
  return (
    <Table style={{ background: TINT, borderRadius: 14 }}>
      <tr><td style={{ padding: "8px 22px" }}>
        <Table>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ padding: "10px 0", borderTop: i ? `1px solid ${LINE}` : undefined, fontFamily: BODY_FONT, fontSize: 14, color: NAVY }}>
                {l.name}{l.date && <span style={{ color: INK_SOFT }}> · {l.date}</span>}
              </td>
              <td align="right" style={{ padding: "10px 0", borderTop: i ? `1px solid ${LINE}` : undefined, fontFamily: BODY_FONT, fontSize: 14, fontWeight: 600, color: NAVY, whiteSpace: "nowrap" }}>{l.amount}</td>
            </tr>
          ))}
          {d.discount && (
            <tr><td style={{ padding: "10px 0", borderTop: `1px solid ${LINE}`, fontFamily: BODY_FONT, fontSize: 14, color: INK_SOFT }}>Discount</td>
              <td align="right" style={{ padding: "10px 0", borderTop: `1px solid ${LINE}`, fontFamily: BODY_FONT, fontSize: 14, color: INK_SOFT }}>−{d.discount}</td></tr>
          )}
          {d.paid && (
            <tr><td style={{ padding: "10px 0", borderTop: `1px solid ${LINE}`, fontFamily: BODY_FONT, fontSize: 14, color: INK_SOFT }}>Paid so far</td>
              <td align="right" style={{ padding: "10px 0", borderTop: `1px solid ${LINE}`, fontFamily: BODY_FONT, fontSize: 14, color: INK_SOFT }}>−{d.paid}</td></tr>
          )}
          <tr>
            <td style={{ padding: "12px 0 6px", borderTop: `2px solid ${NAVY}`, fontFamily: BODY_FONT, fontSize: 15, fontWeight: 600, color: NAVY }}>{d.paid ? "Balance due" : "Total"}</td>
            <td align="right" style={{ padding: "12px 0 6px", borderTop: `2px solid ${NAVY}`, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: BLUE }}>{d.balance}</td>
          </tr>
        </Table>
        <div style={{ fontFamily: BODY_FONT, fontSize: 12, color: INK_SOFT, paddingBottom: 8 }}>{d.taxNote ?? "Tax included."}</div>
      </td></tr>
    </Table>
  );
}

function HowToPay({ d }: { d: InvoiceEmailData }) {
  // Auto-pay: say what will happen and when, instead of asking for payment. Paying first (e-Transfer still leads) skips the charge.
  if (d.autoPay) return (
    <tr>
      <td className="px" style={{ padding: "22px 40px 26px" }}>
        <p style={{ margin: "0 0 18px", fontFamily: BODY_FONT, fontSize: 16, lineHeight: 1.5, fontWeight: 600, color: NAVY }}>{d.autoPay.retry ? `We'll try your ${d.autoPay.card} again on ${d.autoPay.on}.` : `We'll charge your ${d.autoPay.card} on ${d.autoPay.on}. There's nothing you need to do.`}</p>
        <Button href={d.payUrl} label="View invoice" />
        <p style={{ margin: "18px 0 0", fontFamily: BODY_FONT, fontSize: 14, lineHeight: 1.6, color: INK_SOFT }}>
          Rather pay another way? {d.etransferEmail && <>Send <b style={{ color: NAVY }}>{d.balance}</b> by e-Transfer to <a href={`mailto:${d.etransferEmail}`} style={{ color: BLUE, fontWeight: 600 }}>{d.etransferEmail}</a> with <b style={{ color: NAVY }}>{d.etransferRef}</b> in the message, or pay </>}{!d.etransferEmail && "Pay "}on the invoice page before then and the card isn&apos;t charged.
          If something looks wrong, just reply to this email. You can turn automatic payments off any time on your etc. page.
        </p>
      </td>
    </tr>
  );
  return (
    <tr>
      <td className="px" style={{ padding: "22px 40px 26px" }}>
        <Button href={d.payUrl} label={d.cardEnabled ? "View & pay online" : "View invoice"} />
        <p style={{ margin: "18px 0 0", fontFamily: BODY_FONT, fontSize: 14, lineHeight: 1.6, color: INK_SOFT }}>
          {d.etransferEmail && <>Prefer e-Transfer? Send <b style={{ color: NAVY }}>{d.balance}</b> to <a href={`mailto:${d.etransferEmail}`} style={{ color: BLUE, fontWeight: 600 }}>{d.etransferEmail}</a> and put <b style={{ color: NAVY }}>{d.etransferRef}</b> in the message. </>}
          Cash to the crew works too.
        </p>
      </td>
    </tr>
  );
}

export function InvoiceSent({ d, reminder }: { d: InvoiceEmailData; reminder?: 1 | 2 }) {
  const first = firstName(d.name);
  return (
    <EtcEmail title={`Invoice #${d.number}`} preheader={reminder ? `Friendly reminder: ${d.balance} for invoice #${d.number}` : `${d.subject}: ${d.balance}`}>
      <Header right={<>Invoice #{d.number}</>} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 18px" }}>
          <Eyebrow>{reminder ? "Friendly reminder" : `Issued ${d.issued}`} · due {d.due}</Eyebrow>
          <H1>{reminder ? `Hi ${first}, just a reminder` : `Thanks, ${first}! Here's your invoice`}</H1>
          <P>{reminder ? `Invoice #${d.number} (${d.subject}) still shows ${d.balance} owing. If you've already paid, thank you, and please ignore this.` : `${d.subject}. Every job helps Silas get to electrician school.`}</P>
          {!reminder && d.message && <P style={{ whiteSpace: "pre-line", color: NAVY }}>{d.message}</P>}
        </td>
      </tr>
      <tr><td className="px" style={{ padding: "0 40px" }}><Lines d={d} /></td></tr>
      <HowToPay d={d} />
      <Footer site={d.site} phone={d.phone} reason="You're getting this because etc. did a job for you." />
    </EtcEmail>
  );
}

/** `how`: "to your card (allow 5 to 10 business days)" or "by e-Transfer". */
export function RefundReceipt({ d, amount, how, when }: { d: InvoiceEmailData; amount: string; how: string; when: string }) {
  return (
    <EtcEmail title={`Refund for invoice #${d.number}`} preheader={`We refunded ${amount}.`}>
      <Header right="Refund" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>Refund · {when}</Eyebrow>
          <H1>Hi {firstName(d.name)}, your refund is on its way</H1>
          <P>We refunded <b style={{ color: NAVY }}>{amount}</b> {how} for invoice #{d.number} ({d.subject}).</P>
          <P>Questions? Just reply to this email.</P>
        </td>
      </tr>
      <Footer site={d.site} phone={d.phone} reason="Keep this email as your refund receipt." />
    </EtcEmail>
  );
}

/** An automatic charge didn't go through: what failed, how to pay or fix the card, and when (if ever) we try again. */
export function AutoPayFailed({ d, card, why, retryOn, needsAction, hubUrl }: { d: InvoiceEmailData; card: string; why: string; retryOn: string | null; needsAction: boolean; hubUrl: string }) {
  return (
    <EtcEmail title={`Invoice #${d.number}: card payment didn't go through`} preheader={needsAction ? `Your bank wants you to approve ${d.balance}` : `We couldn't charge your ${card}`}>
      <Header right={<>Invoice #{d.number}</>} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 18px" }}>
          <Eyebrow>Automatic payment</Eyebrow>
          <H1>{needsAction ? `${firstName(d.name)}, your bank wants you to approve this one` : `${firstName(d.name)}, we couldn't charge your card`}</H1>
          <P>{needsAction
            ? `Your bank needs you to confirm the ${d.balance} payment for invoice #${d.number} (${d.subject}) on your ${card}, and that can't be done automatically. Please pay from the invoice page; it takes a minute.`
            : `We tried to charge your ${card} ${d.balance} for invoice #${d.number} (${d.subject}), but ${why}.`}</P>
          {!needsAction && <P>{retryOn
            ? `We'll try again on ${retryOn}. Nothing has been switched off, and you can pay sooner or change the card below.`
            : "We won't try this invoice again automatically, so please pay it another way. Automatic payments stay on for your next invoices unless you turn them off."}</P>}
        </td>
      </tr>
      <tr><td className="px" style={{ padding: "0 40px" }}><Lines d={d} /></td></tr>
      <HowToPay d={{ ...d, autoPay: null }} />
      <tr><td className="px" style={{ padding: "0 40px 26px" }}><Button href={hubUrl} label="Update your card" bg="#ffffff" fg={NAVY} border={LINE} /></td></tr>
      <Footer site={d.site} phone={d.phone} reason="You're getting this because you asked etc. to charge your card automatically." />
    </EtcEmail>
  );
}

export function StatementEmail({ name, balance, owing, period, etransferEmail, site, phone }: { name: string; balance: string; owing: boolean; period: string; etransferEmail: string; site: string; phone: string }) {
  return (
    <EtcEmail title="Your statement" preheader={owing ? `Your balance is ${balance}` : "Your account statement from etc."}>
      <Header right="Statement" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>{period}</Eyebrow>
          <H1>Hi {firstName(name)}, here&apos;s your statement</H1>
          <P>Your statement is attached as a PDF: every invoice and payment, with a running balance. {owing ? <>Your balance is <b style={{ color: NAVY }}>{balance}</b>.</> : "You're all paid up. Thank you!"}</P>
          {owing && etransferEmail && <P>To pay by e-Transfer, send it to <a href={`mailto:${etransferEmail}`} style={{ color: BLUE, fontWeight: 600 }}>{etransferEmail}</a> with your invoice&apos;s ETC- code in the message. Cash to the crew works too.</P>}
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because etc. did a job for you." />
    </EtcEmail>
  );
}

export function PaymentReceipt({ d, amount, method, when, paidInFull, extra }: { d: InvoiceEmailData; amount: string; method: string; when: string; paidInFull: boolean; extra?: string }) {
  return (
    <EtcEmail title={`Receipt for invoice #${d.number}`} preheader={`We got your ${amount} payment. Thank you!`}>
      <Header right="Receipt" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 18px" }}>
          <Eyebrow>Payment received · {when}</Eyebrow>
          <H1>Thank you, {firstName(d.name)}!</H1>
          <P>We received <b style={{ color: NAVY }}>{amount}</b> by {method} for invoice #{d.number}. {paidInFull ? "You're all paid up." : `${d.balance} is still owing.`}{extra && ` ${extra}`}</P>
        </td>
      </tr>
      <tr><td className="px" style={{ padding: "0 40px 26px" }}><Lines d={d} /></td></tr>
      <tr><td className="px" style={{ padding: "0 40px 26px" }}><Button href={d.payUrl} label="View invoice" bg="#ffffff" fg={NAVY} border={LINE} /></td></tr>
      <Footer site={d.site} phone={d.phone} reason="Keep this email as your receipt." />
    </EtcEmail>
  );
}

export function OwnerPaymentReceived({ name, amount, number, url }: { name: string; amount: string; number: number; url: string }) {
  return (
    <EtcEmail title="Payment received" preheader={`${name} paid ${amount}`}>
      <Header right={<>Invoice #{number}</>} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 30px" }}>
          <Eyebrow>Card payment</Eyebrow>
          <H1>{name} paid {amount}</H1>
          <P>Invoice #{number} was paid online. The receipt went to the client automatically.</P>
          <Button href={url} label="Open the invoice" />
        </td>
      </tr>
    </EtcEmail>
  );
}
