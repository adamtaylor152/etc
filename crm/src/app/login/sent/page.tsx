import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Check your email" };

export default function Sent() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="rounded-3xl border border-line bg-white p-6">
        <Logo className="text-navy" />
        <h1 className="mt-4 font-display text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-ink-soft">If that address belongs to the etc. crew, a sign-in link is on its way. It works once and expires in 20 minutes.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-blue">Use a different email</Link>
      </div>
    </main>
  );
}
