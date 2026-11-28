import { Closing, Intro, BODY_FONT, Button, EtcEmail, Eyebrow, FONT, Footer, H1, Header, INK_SOFT, LINE, NAVY, P, Table, firstName } from "./ui";

export function VisitScheduled({ name, what, date, address, reminder, when = "tomorrow", site, phone, confirmUrl }: { name: string; what: string; date: string; address: string; reminder?: boolean; when?: string; site: string; phone: string; confirmUrl?: string }) {
  return (
    <EtcEmail title={reminder ? `See you ${when}` : "You're booked"} preheader={`${what} on ${date}`} vars={{ first_name: firstName(name), service: what, visit_date: date, address, day: when }}>
      <Header right={reminder ? "Reminder" : "Booked"} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>{date}</Eyebrow>
          <H1>{reminder ? `See you ${when}, ${firstName(name)}!` : `You're booked, ${firstName(name)}!`}</H1>
          <Intro><P>{what} at {address} is set for <b style={{ color: NAVY }}>{date}</b>. No need to be home. If anything changes, just reply to this email.</P></Intro>
          {confirmUrl && <Button href={confirmUrl} label="Confirm or change the time" />}
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you have a job booked with etc." />
    </EtcEmail>
  );
}

export function ReviewRequest({ name, url, site, phone, followUp }: { name: string; url: string; site: string; phone: string; followUp?: boolean }) {
  return (
    <EtcEmail title="How did we do?" preheader="A quick Google review helps Silas a ton" vars={{ first_name: firstName(name) }}>
      <Header right="Thank you" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>{followUp ? "One last ask" : "30 seconds"}</Eyebrow>
          <H1>{followUp ? <>Got 30 seconds, {firstName(name)}?</> : <>Thanks for choosing etc., {firstName(name)}!</>}</H1>
          <Intro><P>If you were happy with the job, a quick Google review helps neighbours find us, and every job helps Silas get to electrician school.</P></Intro>
          <Button href={url} label="Leave a review" />
          <Closing style={{ margin: "18px 0 0", fontSize: 13, lineHeight: "normal" }}><p style={{ margin: "18px 0 0", fontFamily: BODY_FONT, fontSize: 13, color: INK_SOFT }}>Something not right? Just reply. We&apos;ll make it right.</p></Closing>
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because etc. did a job for you. Reply 'no thanks' and we won't ask again." />
    </EtcEmail>
  );
}

export type DigestData = { day: string; today: { address: string; what: string }[]; late: number; unbilled: string; owing: string; newRequests: number; failedEmails: number; url: string };
export function DailyDigest({ d }: { d: DigestData }) {
  const row = (label: string, value: string | number) => (
    <tr><td style={{ padding: "8px 0", borderTop: `1px solid ${LINE}`, fontFamily: BODY_FONT, fontSize: 14, color: INK_SOFT }}>{label}</td>
      <td align="right" style={{ padding: "8px 0", borderTop: `1px solid ${LINE}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: NAVY }}>{value}</td></tr>
  );
  return (
    <EtcEmail title="Today at etc." preheader={`${d.today.length} visits today`}>
      <Header right={d.day} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <H1>Today: {d.today.length} visit{d.today.length === 1 ? "" : "s"}</H1>
          {d.today.length > 0 && <P>{d.today.slice(0, 15).map((v) => `${v.address} (${v.what})`).join(" · ")}</P>}
          <Table>{row("Late visits", d.late)}{row("New requests", d.newRequests)}{row("Done, not invoiced", d.unbilled)}{row("Owing", d.owing)}{d.failedEmails ? row("Emails that failed", d.failedEmails) : null}</Table>
          <div style={{ height: 18 }} />
          <Button href={d.url} label="Open etc. CRM" />
        </td>
      </tr>
    </EtcEmail>
  );
}
