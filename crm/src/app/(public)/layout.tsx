// Customer-facing pages (token links). Branded like etccrew.ca, or with the owner's logo and colour
// (Settings › Messages); never indexed.
import type { CSSProperties } from "react";
import { Logo } from "@/components/ui";
import { business } from "@/server/db";
import { env } from "@/server/env";
import { logoPath } from "@/server/media";
import { parseSettings } from "@/server/settings";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // the branding is read per request (and the build has no database)

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const biz = await business();
  const { brandColor, logoId } = parseSettings(biz.settings);
  return (
    // --brand recolours everything "blue" on these pages (see globals.css).
    <div className="min-h-screen" style={brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined}>
      <header className={logoId ? "border-b-[3px] border-blue bg-white" : "bg-navy text-white"}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- private media via signed URL */}
          <a href={env.siteUrl}>{logoId ? <img src={logoPath(logoId)} alt={biz.name} className="h-10 w-auto max-w-56" /> : <Logo />}</a>
          <a href={`tel:+1${env.phone.replace(/\D/g, "")}`} className={`text-sm font-semibold ${logoId ? "text-navy/80" : "text-white/80"}`}>{env.phone}</a>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4 sm:p-6">{children}</main>
      <footer className="pb-8 text-center text-xs text-ink-soft">etc. · Snow shovelling &amp; odd jobs in Calgary · <a href={`mailto:${env.helpEmail}`}>{env.helpEmail}</a></footer>
    </div>
  );
}
