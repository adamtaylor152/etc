// Customer-facing pages (token links). Branded like etccrew.ca, or with the owner's logo and colour
// (Settings › Messages); never indexed.
// One frame for all of them: header (logo or wordmark, tap-to-call), a centred reading column, a footer that says who
// this is and how to reach them. Type is a step larger than the back office: these are read on phones, often by older eyes.
import type { CSSProperties } from "react";
import { Mail, Phone } from "lucide-react";
import { Logo } from "@/components/ui";
import { business } from "@/server/db";
import { env } from "@/server/env";
import { logoPath } from "@/server/media";
import { parseSettings } from "@/server/settings";
import { prettyPhone } from "@/components/phone";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // the branding is read per request (and the build has no database)

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const biz = await business();
  const { brandColor, logoId } = parseSettings(biz.settings);
  const tel = `tel:+1${env.phone.replace(/\D/g, "")}`;
  return (
    // --brand recolours everything "blue" on these pages (see globals.css).
    <div className="flex min-h-dvh flex-col text-base" style={brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined}>
      <header className={`no-print ${logoId ? "border-b-[3px] border-blue bg-white" : "bg-night text-white"}`}>
        <div className="mx-auto flex min-h-16 max-w-[40rem] items-center justify-between gap-3 px-4 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- private media via signed URL */}
          <a href={env.siteUrl} aria-label={`${biz.name} home`} className="flex min-h-11 items-center">{logoId ? <img src={logoPath(logoId)} alt={biz.name} className="h-10 w-auto max-w-44 object-contain sm:max-w-56" /> : <Logo />}</a>
          <a href={tel} aria-label={`Call ${biz.name} at ${prettyPhone(env.phone)}`}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-[0.95rem] font-semibold tabular-nums ${logoId ? "border-line text-navy hover:bg-tint" : "border-white/20 text-white hover:bg-white/10"}`}>
            <Phone className="size-4" strokeWidth={1.75} aria-hidden />{prettyPhone(env.phone)}
          </a>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[40rem] flex-1 px-4 py-6 sm:px-6 sm:py-9">{children}</main>
      <footer className="no-print border-t border-line bg-white">
        <div className="mx-auto max-w-[40rem] px-4 py-6 text-sm text-ink-soft sm:px-6">
          <p className="font-display text-base font-semibold text-navy">{biz.name}</p>
          <p className="mt-0.5">Snow shovelling &amp; odd jobs in Evergreen and SW Calgary</p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            <a href={tel} className="inline-flex min-h-11 items-center gap-2 font-semibold text-navy hover:text-blue"><Phone className="size-4" strokeWidth={1.75} aria-hidden />{prettyPhone(env.phone)}</a>
            <a href={`mailto:${env.helpEmail}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-navy hover:text-blue"><Mail className="size-4" strokeWidth={1.75} aria-hidden />{env.helpEmail}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
