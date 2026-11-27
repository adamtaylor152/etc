import { BLUE, BODY_FONT, Button, EtcEmail, Eyebrow, FONT, Footer, H1, Header, INK_SOFT, NAVY, P, Table, TINT, firstName } from "./ui";

type Photo = { url: string; kind: "BEFORE" | "AFTER" };
export type VisitDoneProps = {
  name: string; address: string; when: string; what: string; depthCm: number | null; photos: Photo[]; reportUrl: string;
  site: string; phone: string; payUrl?: string; amount?: string;
};

function PhotoRow({ label, photos }: { label: string; photos: Photo[] }) {
  if (!photos.length) return null;
  return (
    <tr>
      <td className="px" style={{ padding: "0 40px 18px" }}>
        <div style={{ fontFamily: BODY_FONT, fontSize: 12, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: INK_SOFT, marginBottom: 8 }}>{label}</div>
        <Table>
          <tr>
            {photos.slice(0, 2).map((p) => (
              <td key={p.url} width="50%" style={{ padding: "0 6px 0 0" }}>
                <img src={p.url} width={256} alt={label} style={{ display: "block", width: "100%", height: "auto", borderRadius: 10, border: 0 }} />
              </td>
            ))}
          </tr>
        </Table>
      </td>
    </tr>
  );
}

export function VisitDone(p: VisitDoneProps) {
  const first = firstName(p.name);
  const before = p.photos.filter((x) => x.kind === "BEFORE");
  const after = p.photos.filter((x) => x.kind === "AFTER");
  return (
    <EtcEmail title="All done!" preheader={`${p.what} at ${p.address} is done.`}>
      <Header right="Job done" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 8px" }}>
          <Eyebrow>{p.when}</Eyebrow>
          <H1>All done, {first}!</H1>
          <P>{p.what} at {p.address} is finished{p.depthCm ? ` (${p.depthCm} cm cleared)` : ""}. {before.length || after.length ? "Here's the before and after:" : ""}</P>
        </td>
      </tr>
      <PhotoRow label="Before" photos={before} />
      <PhotoRow label="After" photos={after} />
      <tr>
        <td className="px" style={{ padding: "8px 40px 26px" }}>
          <Button href={p.reportUrl} label="See all the photos" />
        </td>
      </tr>
      {p.payUrl && (
        <tr>
          <td className="px" style={{ padding: "0 40px 26px" }}>
            <Table style={{ background: TINT, borderRadius: 14 }}>
              <tr><td style={{ padding: "18px 22px", fontFamily: BODY_FONT }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>Amount due: <span style={{ fontFamily: FONT, color: BLUE }}>{p.amount}</span></div>
                <div style={{ fontSize: 14, color: INK_SOFT, margin: "4px 0 14px" }}>Pay by card, e-Transfer or cash. Tax included.</div>
                <Button href={p.payUrl} label="View & pay" />
              </td></tr>
            </Table>
          </td>
        </tr>
      )}
      <Footer site={p.site} phone={p.phone} reason="You're getting this because etc. just did a job for you." />
    </EtcEmail>
  );
}

export function OwnerPhotosUploaded({ number, url }: { number: number; url: string }) {
  return (
    <EtcEmail title={`Photos for request #${number}`} preheader="A customer sent photos for a quote">
      <Header right={<>Request #{number}</>} />
      <tr>
        <td className="px" style={{ padding: "32px 40px 30px" }}>
          <Eyebrow>Photos arrived</Eyebrow>
          <H1>New photos on request #{number}</H1>
          <P>The customer added photos so you can price the job without a visit.</P>
          <Button href={url} label="Open the request" />
        </td>
      </tr>
    </EtcEmail>
  );
}

export function PhotoUploadRequest({ name, services, url, site, phone }: { name: string; services: string[]; url: string; site: string; phone: string }) {
  return (
    <EtcEmail title="Send us a few photos" preheader="Snap the job on your phone and we'll send a quote">
      <Header right="Quick quote" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 26px" }}>
          <Eyebrow>{services.join(", ")}</Eyebrow>
          <H1>Hi {name}, can you send a few photos?</H1>
          <P>Snap the job on your phone (no app needed) and we&apos;ll price it without a visit. A wide shot from the street plus a couple of close-ups is perfect.</P>
          <Button href={url} label="Add photos" />
        </td>
      </tr>
      <Footer site={site} phone={phone} reason="You're getting this because you asked etc. for a quote." />
    </EtcEmail>
  );
}
