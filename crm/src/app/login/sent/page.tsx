import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Logo } from "@/components/ui";

export const metadata = { title: "Check your email" };

export default function Sent() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="bg-night px-6 py-5 text-white"><Logo className="text-3xl" /><p className="mt-0.5 text-sm text-white/70">Crew back office</p></div>
        <div className="p-6">
          <MailCheck className="size-7 text-emerald-600" strokeWidth={1.75} aria-hidden />
          <h1 className="mt-3 font-display text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-ink-soft">If that address belongs to the etc. crew, a sign-in link is on its way. It works once and expires in 20 minutes.</p>
          <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-blue hover:text-blue-deep">Use a different email</Link>
        </div>
      </div>
    </main>
  );
}
