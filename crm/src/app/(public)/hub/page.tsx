import { Card } from "@/components/ui";
import { emailHubLink } from "./actions";

export const metadata = { title: { absolute: "Your etc. page" } };

export default async function HubLogin({ searchParams }: PageProps<"/hub">) {
  const sent = (await searchParams).sent;
  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Your etc. page</h1>
      <p className="mt-2 text-ink-soft">See your visits, before &amp; after photos, quotes and invoices. Enter the email you booked with and we&apos;ll send you a private link.</p>
      {sent ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 font-medium text-emerald-800">If we have that email on file, a link is on its way.</p> : (
        <form action={emailHubLink} className="mt-4 flex flex-wrap gap-2">
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="min-h-11 flex-1 rounded-xl border border-line px-3" />
          <button className="min-h-11 rounded-full bg-blue px-5 font-semibold text-white">Email me my link</button>
        </form>
      )}
    </Card>
  );
}
