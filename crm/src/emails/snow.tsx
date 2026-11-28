import { Intro, BODY_FONT, Button, EtcEmail, Eyebrow, Footer, H1, Header, INK_SOFT, LINE, NAVY, P, Table, firstName } from "./ui";

export function OnMyWay({ name, address, site, phone }: { name: string; address: string; site: string; phone: string }) {
  return (
    <EtcEmail title="We're on our way" preheader={`The etc. crew is heading to ${address}`} vars={{ first_name: firstName(name), address }}>
      <Header right="On our way" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>Heads up</Eyebrow>
          <H1>Hi {firstName(name)}, we&apos;re on our way!</H1>
          <Intro><P>The crew is heading to {address} now. No need to be home. We&apos;ll send before &amp; after photos when we&apos;re done.</P></Intro>
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you booked a job with etc." />
    </EtcEmail>
  );
}

export function StormHeadsUp({ name, address, cm, site, phone }: { name: string; address: string; cm: number | null; site: string; phone: string }) {
  return (
    <EtcEmail title="You're on our snow route" preheader={`We'll clear ${address} today`} vars={{ first_name: firstName(name), address }}>
      <Header right="Snow day" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>Every-snowfall plan{cm ? ` · ~${cm} cm` : ""}</Eyebrow>
          <H1>Snow&apos;s here, {firstName(name)}. You&apos;re on our route.</H1>
          <Intro><P>We&apos;ll clear {address} today. You&apos;ll get photos when it&apos;s done. Away or don&apos;t need it this time? Just reply and let us know.</P></Intro>
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you're on etc.'s every-snowfall plan. Reply 'stop' to turn these off." />
    </EtcEmail>
  );
}

export function OwnerSnowAlert({ days, plans, url }: { days: { label: string; cm: number }[]; plans: number; url: string }) {
  return (
    <EtcEmail title="Snow in the forecast" preheader={`${plans} plan${plans === 1 ? "" : "s"} would trigger`}>
      <Header right="Snow alert" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>Forecast</Eyebrow>
          <H1>Snow&apos;s coming: {plans} plan{plans === 1 ? "" : "s"} would trigger</H1>
          <Table style={{ border: `1px solid ${LINE}`, borderRadius: 12, marginBottom: 22 }}>
            {days.map((d) => (
              <tr key={d.label}>
                <td style={{ padding: "10px 16px", fontFamily: BODY_FONT, fontSize: 15, color: NAVY, fontWeight: 600 }}>{d.label}</td>
                <td align="right" style={{ padding: "10px 16px", fontFamily: BODY_FONT, fontSize: 15, color: INK_SOFT }}>~{Math.round(d.cm)} cm</td>
              </tr>
            ))}
          </Table>
          <P>Print the route tonight, charge the phone, and start the storm in the app when it lands.</P>
          <Button href={url} label="Open Snow" />
        </td>
      </tr>
    </EtcEmail>
  );
}
