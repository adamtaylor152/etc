// Booking emails, ported from emails.py (customer_email / owner_email). Same look, plus CRM links.
import { BLUE, BODY_FONT, Button, EtcEmail, Eyebrow, FONT, Footer, H1, Header, INK_SOFT, LINE, Lines, NAVY, P, SummaryRows, Table, TINT, firstName } from "./ui";

export type BookingEmailProps = {
  number: number;
  name: string; email: string; phone: string; address: string; access: string; notes: string;
  plan: string; payment: string; services: string[]; serviceLines: string[]; when: string; estimate: string;
  site: string; phone_: string; helpEmail: string; etransferEmail: string;
  uploadUrl?: string; // "send us photos" link when something needs quoting
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BookingConfirmation(p: BookingEmailProps) {
  const first = firstName(p.name);
  const eTransfer = p.payment === "e-Transfer" && p.etransferEmail;
  const steps: [string, string][] = [
    ["Silas confirms a time", p.plan !== "Every snowfall" ? "He'll reach out shortly to lock it in." : "You're on the list. We'll come after every snowfall, no need to call."],
    ["We get it done", p.services.includes("Snow shovelling") ? "Driveway, walk and steps cleared, with ice melt if you added it." : "We'll take care of everything you booked."],
    ["Before & after photos", "We'll email you photos of the finished job so you can see the difference."],
  ];
  const rows: [string, React.ReactNode][] = [
    ["Services", <Lines key="s" text={p.serviceLines} />],
    ["Address", <>{p.address}{p.access && <><br /><span style={{ fontWeight: 400, color: INK_SOFT, fontSize: 13 }}>{p.access}</span></>}</>],
    ["When", cap(p.when)],
    ["Payment", <>{p.payment} <span style={{ fontWeight: 400, color: INK_SOFT }}>(after the job)</span></>],
    ["Estimate", <><span style={{ fontFamily: FONT, fontSize: 20, color: BLUE }}>{p.estimate}</span><br /><span style={{ fontWeight: 400, color: INK_SOFT, fontSize: 12 }}>Tax included</span></>],
  ];
  if (p.notes) rows.push(["Your notes", <Lines key="n" text={p.notes} />]);

  return (
    <EtcEmail title="We got your booking" preheader={`Thanks ${first}! Silas will be in touch shortly to lock in a time.`}>
      <Header right="Snow shovelling & odd jobs" />
      <tr><td style={{ padding: 0 }}><img src={`${p.site}/img/email-hero.jpg`} width={600} alt="" style={{ display: "block", width: "100%", maxWidth: 600, height: "auto", border: 0 }} /></td></tr>
      <tr>
        <td className="px" style={{ padding: "32px 40px 8px" }}>
          <Eyebrow>Booking received · #{p.number}</Eyebrow>
          <H1>Thanks, {first}! Your booking is in.</H1>
          <P>Silas got your request and will be in touch shortly to lock in a time. Here&apos;s what you booked:</P>
        </td>
      </tr>
      <tr>
        <td className="px" style={{ padding: "0 40px" }}>
          <Table style={{ background: TINT, borderRadius: 14 }}><tr><td style={{ padding: "8px 22px" }}><SummaryRows rows={rows} /></td></tr></Table>
        </td>
      </tr>
      {p.uploadUrl && (
        <tr>
          <td className="px" style={{ padding: "26px 40px 0" }}>
            <Table style={{ border: `1px solid ${LINE}`, borderRadius: 14 }}>
              <tr><td style={{ padding: "18px 22px", fontFamily: BODY_FONT }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 4 }}>Send us a few photos for a faster quote</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: INK_SOFT, marginBottom: 14 }}>Snap the job on your phone (no app needed) and we&apos;ll price it without a visit.</div>
                <Button href={p.uploadUrl} label="Add photos" />
              </td></tr>
            </Table>
          </td>
        </tr>
      )}
      <tr>
        <td className="px" style={{ padding: "30px 40px 6px" }}>
          <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 700, color: NAVY, marginBottom: 16 }}>What happens next</div>
          <Table>
            {steps.map(([t, d], i) => (
              <tr key={t}>
                <td valign="top" style={{ padding: "0 14px 16px 0", width: 34 }}>
                  <div style={{ width: 34, height: 34, lineHeight: "34px", borderRadius: "50%", background: NAVY, color: "#ffffff", textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 15 }}>{i + 1}</div>
                </td>
                <td valign="top" style={{ padding: "0 0 16px 0", fontFamily: BODY_FONT }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>{t}</div>
                  <div style={{ fontSize: 14, color: INK_SOFT, lineHeight: 1.5 }}>{d}</div>
                </td>
              </tr>
            ))}
          </Table>
        </td>
      </tr>
      <tr>
        <td className="px" style={{ padding: "0 40px 26px" }}>
          <Table style={{ border: `1px solid ${LINE}`, borderLeft: `4px solid ${BLUE}`, borderRadius: 10 }}>
            <tr><td style={{ padding: "16px 20px", fontFamily: BODY_FONT }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{eTransfer ? "Paying by e-Transfer" : "Paying with cash"}</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: INK_SOFT }}>
                {eTransfer
                  ? <>After the job, send your e-Transfer to <a href={`mailto:${p.etransferEmail}`} style={{ color: BLUE, fontWeight: 600 }}>{p.etransferEmail}</a>. Cash works too if that&apos;s easier on the day.</>
                  : "Just pay the crew when we're done. No need to be home; leave it somewhere safe and let us know where."}
              </div>
            </td></tr>
          </Table>
        </td>
      </tr>
      <tr>
        <td className="px" style={{ background: NAVY, padding: "28px 40px" }}>
          <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: "#ffffff", lineHeight: 1.3 }}>Every job helps Silas get to electrician school.</div>
          <p style={{ margin: "8px 0 18px", fontFamily: BODY_FONT, fontSize: 14, lineHeight: 1.6, color: "#b9c3d8" }}>He&apos;s saving every dollar from etc. toward his tuition. Thanks for being part of it. Seriously.</p>
          <Button href={`${p.site}/#story`} label="See how close he is" bg={NAVY} fg="#ffffff" border="#ffffff" />
        </td>
      </tr>
      <Footer site={p.site} phone={p.phone_} reason="You're getting this because you booked a job at etccrew.ca." />
    </EtcEmail>
  );
}

export type OwnerBookingProps = BookingEmailProps & { crmUrl: string; badge: string };

export function OwnerNewBooking(p: OwnerBookingProps) {
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.address);
  const reply = `mailto:${p.email}?subject=${encodeURIComponent(`Your etc. booking #${p.number}`)}`;
  const buttons: [string, string][] = [["Open in etc. CRM", p.crmUrl]];
  if (p.phone) buttons.push([`Call ${firstName(p.name)}`, "tel:" + p.phone.replace(/[^\d+]/g, "")]);
  buttons.push(["Email customer", reply], ["Open in Maps", maps]);

  const rows: [string, React.ReactNode][] = [
    ["Services", <Lines key="s" text={p.serviceLines} />],
    ["When", cap(p.when)],
    ["Address", <a key="a" href={maps} style={{ color: NAVY }}>{p.address}</a>],
  ];
  if (p.access) rows.push(["Access", p.access]);
  rows.push(["Email", <a key="e" href={reply} style={{ color: BLUE }}>{p.email}</a>]);
  if (p.phone) rows.push(["Phone", p.phone]);
  rows.push(["Payment", p.payment]);

  return (
    <EtcEmail title={`New booking #${p.number}`} preheader={`${p.name} · ${p.services.join(", ")} · ${p.estimate}`}>
      <Header right={<>New booking · #{p.number}</>} />
      <tr>
        <td className="px" style={{ padding: "30px 40px 6px" }}>
          <Table>
            <tr>
              <td valign="top" className="stack">
                <Eyebrow>New booking · {p.badge}</Eyebrow>
                <H1 style={{ margin: "8px 0 4px" }}>{p.name}</H1>
                <div style={{ fontFamily: BODY_FONT, fontSize: 15, color: INK_SOFT }}>{p.address}</div>
              </td>
              <td valign="top" align="right" className="stack stack-pad" style={{ paddingLeft: 12 }}>
                <div style={{ display: "inline-block", background: TINT, borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
                  <div style={{ fontFamily: BODY_FONT, fontSize: 11, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "1px" }}>Estimate</div>
                  <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: BLUE, whiteSpace: "nowrap" }}>{p.estimate}</div>
                </div>
              </td>
            </tr>
          </Table>
        </td>
      </tr>
      <tr>
        <td className="px" style={{ padding: "18px 40px 22px" }}>
          <Table width="auto">
            <tr>
              {buttons.map(([label, href], i) => (
                <td key={label} className="stack btn-cell" style={{ padding: "0 10px 0 0" }}>
                  <Button href={href} label={label} bg={i === 0 ? BLUE : "#ffffff"} fg={i === 0 ? "#ffffff" : NAVY} border={i === 0 ? BLUE : LINE} />
                </td>
              ))}
            </tr>
          </Table>
        </td>
      </tr>
      <tr>
        <td className="px" style={{ padding: "0 40px 24px" }}>
          <Table style={{ border: `1px solid ${LINE}`, borderRadius: 14 }}><tr><td style={{ padding: "6px 22px" }}><SummaryRows rows={rows} /></td></tr></Table>
        </td>
      </tr>
      {p.notes && (
        <tr>
          <td className="px" style={{ padding: "0 40px 24px" }}>
            <Table style={{ background: "#fff8e6", borderRadius: 10, border: "1px solid #f2dca0" }}>
              <tr><td style={{ padding: "14px 18px", fontFamily: BODY_FONT }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#8a6200", marginBottom: 4 }}>Customer notes</div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: NAVY }}><Lines text={p.notes} /></div>
              </td></tr>
            </Table>
          </td>
        </tr>
      )}
      <tr>
        <td className="px" style={{ padding: "0 40px 28px", fontFamily: BODY_FONT, fontSize: 13, lineHeight: 1.6, color: INK_SOFT }}>
          Reply to this email to answer {firstName(p.name)} directly. They&apos;ve been told Silas will be in touch to confirm a time.
        </td>
      </tr>
      <tr>
        <td className="px" align="center" style={{ background: TINT, padding: "16px 40px", fontFamily: BODY_FONT, fontSize: 12, color: "#9aa5bb" }}>
          etc. booking system · <a href={p.site} style={{ color: INK_SOFT }}>etccrew.ca</a>
        </td>
      </tr>
    </EtcEmail>
  );
}
