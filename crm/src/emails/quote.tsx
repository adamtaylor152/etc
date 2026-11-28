import { Intro, BLUE, BODY_FONT, Button, EtcEmail, Eyebrow, FONT, Footer, H1, Header, INK_SOFT, LINE, Lines, NAVY, P, Table, TINT, firstName } from "./ui";

export type QuoteEmailData = {
  name: string; number: number; title: string; message: string | null; validUntil: string | null; total: string;
  lines: { name: string; amount: string; optional: boolean }[]; url: string; site: string; phone: string;
};

const quoteVars = (d: QuoteEmailData) => ({ first_name: firstName(d.name), quote_number: String(d.number), quote_title: d.title, total: d.total, valid_until: d.validUntil ?? "" });

function QuoteLines({ d }: { d: QuoteEmailData }) {
  return (
    <Table style={{ background: TINT, borderRadius: 14 }}>
      <tr><td style={{ padding: "8px 22px" }}>
        <Table>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ padding: "10px 0", borderTop: i ? `1px solid ${LINE}` : undefined, fontFamily: BODY_FONT, fontSize: 14, color: NAVY }}>
                {l.name}{l.optional && <span style={{ color: INK_SOFT }}> (optional)</span>}
              </td>
              <td align="right" style={{ padding: "10px 0", borderTop: i ? `1px solid ${LINE}` : undefined, fontFamily: BODY_FONT, fontSize: 14, fontWeight: 600, color: NAVY }}>{l.amount}</td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: "12px 0 6px", borderTop: `2px solid ${NAVY}`, fontFamily: BODY_FONT, fontSize: 15, fontWeight: 600, color: NAVY }}>Total</td>
            <td align="right" style={{ padding: "12px 0 6px", borderTop: `2px solid ${NAVY}`, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: BLUE }}>{d.total}</td>
          </tr>
        </Table>
        <div style={{ fontFamily: BODY_FONT, fontSize: 12, color: INK_SOFT, paddingBottom: 8 }}>Tax included. Optional items can be added or left off when you approve.</div>
      </td></tr>
    </Table>
  );
}

export function QuoteSent({ d, followUp }: { d: QuoteEmailData; followUp?: boolean }) {
  return (
    <EtcEmail title={`Quote #${d.number}`} preheader={`${d.title}: ${d.total}. Approve online in one tap.`} vars={quoteVars(d)}>
      <Header right={<>Quote #{d.number}</>} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 18px" }}>
          <Eyebrow>{followUp ? "Just checking in" : "Your quote"}{d.validUntil && ` · good until ${d.validUntil}`}</Eyebrow>
          <H1>{followUp ? `Hi ${firstName(d.name)}, any questions about your quote?` : `Hi ${firstName(d.name)}, here's your quote`}</H1>
          {d.message ? <P><Lines text={d.message} /></P> : <Intro><P>{d.title}. Approve it online and we&apos;ll book you in.</P></Intro>}
        </td>
      </tr>
      <tr><td className="px" style={{ padding: "0 40px" }}><QuoteLines d={d} /></td></tr>
      <tr><td className="px" style={{ padding: "22px 40px 26px" }}><Button href={d.url} label="View & approve" /></td></tr>
      <Footer site={d.site} phone={d.phone} reason="You're getting this because you asked etc. for a quote." />
    </EtcEmail>
  );
}

export function QuoteApproved({ d }: { d: QuoteEmailData }) {
  return (
    <EtcEmail title="Quote approved" preheader="Thanks! We'll be in touch to book a time." vars={quoteVars(d)}>
      <Header right={<>Quote #{d.number}</>} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 18px" }}>
          <Eyebrow>Approved</Eyebrow>
          <H1>Thanks, {firstName(d.name)}! You&apos;re booked in.</H1>
          <Intro><P>Silas will reach out to lock in a time for {d.title.toLowerCase()}. Here&apos;s what you approved:</P></Intro>
        </td>
      </tr>
      <tr><td className="px" style={{ padding: "0 40px 26px" }}><QuoteLines d={d} /></td></tr>
      <Footer site={d.site} phone={d.phone} reason="Keep this email for your records." />
    </EtcEmail>
  );
}

export function OwnerNotice({ title, body, url }: { title: string; body: string; url: string }) {
  return (
    <EtcEmail title={title} preheader={body.slice(0, 120)}>
      <Header right="etc. CRM" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 30px" }}>
          <H1>{title}</H1>
          <P><Lines text={body} /></P>
          <Button href={url} label="Open in etc. CRM" />
        </td>
      </tr>
    </EtcEmail>
  );
}

export function HubLink({ name, url, site, phone }: { name: string; url: string; site: string; phone: string }) {
  return (
    <EtcEmail title="Your etc. account" preheader="See your visits, photos, quotes and invoices" vars={{ first_name: firstName(name) }}>
      <Header right="Your account" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>No password needed</Eyebrow>
          <H1>Hi {firstName(name)}, here&apos;s your etc. page</H1>
          <Intro><P>See upcoming visits, before &amp; after photos, quotes and invoices, pause your snow plan, or ask for more work. This link is just for you; please don&apos;t forward it.</P></Intro>
          <Button href={url} label="Open my page" />
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you're an etc. client." />
    </EtcEmail>
  );
}

export function PlanRenewal({ name, season, price, seasonPrice, url, site, phone }: { name: string; season: string; price: string; seasonPrice?: string; url: string; site: string; phone: string }) {
  return (
    <EtcEmail title={`Keep your snow plan for ${season}?`} preheader="One tap to stay on the every-snowfall route" vars={{ first_name: firstName(name), season, price: seasonPrice ?? price }}>
      <Header right="Snow plan" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>{season}</Eyebrow>
          <H1>Stay on our snow route, {firstName(name)}?</H1>
          <Intro><P>Thanks for being on the every-snowfall plan last winter. Renew in one tap and we&apos;ll keep clearing after every snowfall {seasonPrice
            ? <>for the same {seasonPrice} season price. Nothing to pay now; we invoice when the season starts.</>
            : <>at {price} a time. Nothing to pay now; we invoice after each storm.</>}</P></Intro>
          <Button href={url} label={`Renew for ${season}`} />
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you were on etc.'s every-snowfall plan. Reply 'no thanks' and we won't ask again." />
    </EtcEmail>
  );
}

export function PriceChange({ name, address, size, was, now, plan, url, site, phone }: { name: string; address: string; size: string; was: string; now: string; plan: boolean; url: string; site: string; phone: string }) {
  return (
    <EtcEmail title="Your snow clearing price" preheader={`Your driveway is bigger than a standard one: ${now}${plan ? " per snowfall" : ""}`} vars={{ first_name: firstName(name), address, price: now, old_price: was }}>
      <Header right="Snow clearing" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>Before we start</Eyebrow>
          <H1>Hi {firstName(name)}, we checked your driveway</H1>
          <Intro><P>We had a look at {address}. It&apos;s a {size.toLowerCase()} driveway, so the price is {now}{plan ? " per snowfall" : ""} instead of {was}. Nothing changes until you say yes, and you can cancel at no charge.</P></Intro>
          <Button href={url} label="See the price and choose" />
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you booked snow clearing with etc." />
    </EtcEmail>
  );
}
