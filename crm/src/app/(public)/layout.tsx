// Customer-facing pages (token links). Branded like etccrew.ca; never indexed.
import { Logo } from "@/components/ui";
import { env } from "@/server/env";

export const metadata = { robots: { index: false, follow: false } };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <a href={env.siteUrl}><Logo /></a>
          <a href={`tel:+1${env.phone.replace(/\D/g, "")}`} className="text-sm font-semibold text-white/80">{env.phone}</a>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4 sm:p-6">{children}</main>
      <footer className="pb-8 text-center text-xs text-ink-soft">etc. · Snow shovelling &amp; odd jobs in Calgary · <a href={`mailto:${env.helpEmail}`}>{env.helpEmail}</a></footer>
    </div>
  );
}
