// Marketing email: the campaign's blocks in the etc. layout, with the CASL footer (who we are, mailing address, unsubscribe).
import { Img, Link, Section, Text } from "@react-email/components";
import { BLUE, Button, EtcEmail, H1, INK_SOFT, LINE, P } from "./ui";

type Block = { type: "heading" | "text" | "button" | "divider"; text: string; url: string };

export function CampaignEmail({ title, name, blocks, unsubscribe, address, business, pixel }: {
  title: string; name: string; blocks: Block[]; unsubscribe: string; address: string; business: string; pixel: string | null;
}) {
  const fill = (s: string) => s.replaceAll("{first_name}", name);
  return (
    <EtcEmail title={title} preheader={fill(blocks.find((b) => b.type === "text")?.text ?? title).slice(0, 120)}>
      {blocks.map((b, i) =>
        b.type === "heading" ? <H1 key={i}>{fill(b.text)}</H1>
        : b.type === "text" ? <P key={i} style={{ whiteSpace: "pre-line" }}>{fill(b.text)}</P>
        : b.type === "button" ? <Section key={i} style={{ margin: "20px 0" }}><Button href={b.url} label={fill(b.text) || "Learn more"} /></Section>
        : <hr key={i} style={{ border: 0, borderTop: `1px solid ${LINE}`, margin: "20px 0" }} />)}
      <Text style={{ color: INK_SOFT, fontSize: 12, lineHeight: "18px", marginTop: 28 }}>
        You&apos;re getting this because you&apos;re an etc. client. {business}, {address}.{" "}
        <Link href={unsubscribe} style={{ color: BLUE }}>Unsubscribe</Link>
      </Text>
      {pixel && <Img src={pixel} width="1" height="1" alt="" />}
    </EtcEmail>
  );
}
