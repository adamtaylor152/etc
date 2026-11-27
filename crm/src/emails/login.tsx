import { BODY_FONT, Button, EtcEmail, Eyebrow, H1, Header, INK_SOFT, P } from "./ui";

export function OwnerLogin({ url }: { url: string }) {
  return (
    <EtcEmail title="Sign in to etc. CRM" preheader="Your sign-in link (expires in 20 minutes)">
      <Header right="etc. CRM" />
      <tr>
        <td className="px" style={{ padding: "32px 40px 30px" }}>
          <Eyebrow>Sign in</Eyebrow>
          <H1>Here&apos;s your sign-in link</H1>
          <P>Tap the button to open the etc. CRM. The link works once and expires in 20 minutes.</P>
          <Button href={url} label="Sign in to etc. CRM" />
          <p style={{ margin: "22px 0 0", fontFamily: BODY_FONT, fontSize: 13, color: INK_SOFT }}>
            Didn&apos;t ask for this? Ignore it; nobody can sign in without this email.
          </p>
        </td>
      </tr>
    </EtcEmail>
  );
}
