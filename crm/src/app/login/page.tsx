import { redirect } from "next/navigation";
import { Button, Input, Logo } from "@/components/ui";
import { currentUser, safeNext } from "@/server/auth";
import { requestLogin } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await currentUser()) redirect(next);
  const err = sp.error === "link" ? "That link has expired or was already used. Get a fresh one below." : null;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <div className="rounded-2xl bg-night p-6 text-white"><Logo className="text-4xl" /><p className="mt-1 text-sm text-white/70">Crew back office</p></div>
      <form action={requestLogin} className="mt-3 space-y-3 rounded-2xl border border-line bg-white p-6 shadow-card">
        {err && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{err}</p>}
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Your email</span>
          <Input type="email" name="email" required autoComplete="email" autoFocus placeholder="you@example.com" />
        </label>
        <Button className="w-full">Email me a sign-in link</Button>
        <p className="text-xs text-ink-soft">No passwords. We email a link that signs you in on this device.</p>
      </form>
    </main>
  );
}
