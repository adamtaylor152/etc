import { redirect } from "next/navigation";
import { ForgetRoutes } from "@/components/sw-register";
import { Button, Field, Input, Logo, Notice } from "@/components/ui";
import { currentUser, safeNext } from "@/server/auth";
import { requestLogin } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await currentUser()) redirect(next);
  const err = sp.error === "link" ? "That link has expired or was already used. Get a fresh one below." : null;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="bg-night px-6 py-5 text-white"><Logo className="text-3xl" /><p className="mt-0.5 text-sm text-white/70">Crew back office</p></div>
        <form action={requestLogin} className="space-y-4 p-6">
          <h1 className="font-display text-xl font-semibold">Sign in</h1>
          {err && <div className="[&>p]:mb-0"><Notice tone="warn">{err}</Notice></div>}
          <input type="hidden" name="next" value={next} />
          <Field label="Your email" hint="No passwords. We email a link that signs you in on this device.">
            <Input type="email" name="email" required autoComplete="email" autoFocus placeholder="you@example.com" className="min-h-12" />
          </Field>
          <Button className="min-h-12 w-full">Email me a sign-in link</Button>
        </form>
      </div>
      <ForgetRoutes />
    </main>
  );
}
