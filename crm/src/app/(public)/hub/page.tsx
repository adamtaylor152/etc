import { Cta, Done, PageTitle } from "@/components/public/kit";
import { Card, inputCls } from "@/components/ui";
import { emailHubLink } from "./actions";

export const metadata = { title: { absolute: "Your etc. page" } };

export default async function HubLogin({ searchParams }: PageProps<"/hub">) {
  const sent = (await searchParams).sent;
  return (
    <>
      <PageTitle title="Your etc. page" sub="See your visits, before &amp; after photos, quotes and invoices. Enter the email you booked with and we'll send you a private link." />
      {sent ? <Done title="Check your email">If we have that email on file, a link is on its way.</Done> : (
        <Card>
          <form action={emailHubLink} className="space-y-3">
            <label className="block"><span className="mb-1 block font-semibold">Your email</span>
              <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={`${inputCls} min-h-12`} /></label>
            <Cta>Email me my link</Cta>
          </form>
        </Card>
      )}
    </>
  );
}
