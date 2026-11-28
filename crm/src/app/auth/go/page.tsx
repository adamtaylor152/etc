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
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="bg-night px-6 py-5 text-white"><Logo className="text-3xl" /><p className="mt-0.5 text-sm text-white/70">Crew back office</p></div>
        <form action={continueSignIn} className="p-6">
          <h1 className="font-display text-xl font-semibold">Almost there</h1>
          <p className="mt-2 text-ink-soft">Tap to sign in to the etc. CRM on this device.</p>
          <input type="hidden" name="t" value={t} />
          <Button className="mt-5 min-h-12 w-full">Continue</Button>
        </form>
      </div>
    </main>
  );
}
