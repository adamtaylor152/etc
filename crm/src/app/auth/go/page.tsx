// Landing page for sign-in and owner deep links. A GET only shows a button: email scanners (Outlook Safe Links)
// open links automatically, so the token is consumed on the POST from this page, never on the GET.
import { redirect } from "next/navigation";
import { Button, Logo } from "@/components/ui";
import { currentUser, safeNext } from "@/server/auth";
import { db } from "@/server/db";
import { peekToken } from "@/server/tokens";
import { continueSignIn } from "./actions";

export const metadata = { title: "Continue" };

export default async function Go({ searchParams }: PageProps<"/auth/go">) {
  const t = String((await searchParams).t ?? "");
  const peek = await peekToken(db, t, ["LOGIN", "OWNER_DEEP_LINK"]);
  // Already signed in on this device: just go there, don't spend the token.
  if (await currentUser()) redirect(safeNext(peek.ok ? peek.token.redirectPath : "/"));
  if (!peek.ok) redirect("/login?error=link");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <form action={continueSignIn} className="rounded-3xl border border-line bg-white p-6 text-center">
        <Logo className="text-4xl text-navy" />
        <p className="mt-3 text-ink-soft">Tap to sign in to the etc. CRM on this device.</p>
        <input type="hidden" name="t" value={t} />
        <Button className="mt-5 w-full">Continue</Button>
      </form>
    </main>
  );
}
