// Pieces shared by the client-facing pages (token links: quote, invoice, hub, booking…). They sit on top of the main
// kit (ui.tsx) and add what a homeowner on a phone needs: bigger type, one tall full-width action, calm done states.
import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { prettyPhone } from "@/components/phone";

const CTA = {
  primary: "bg-blue text-white border-blue shadow-sm hover:bg-blue-deep hover:border-blue-deep",
  secondary: "bg-white text-navy border-line shadow-sm hover:border-ink-faint/60 hover:bg-tint",
  danger: "bg-white text-red-700 border-red-200 shadow-sm hover:bg-red-50 hover:border-red-300",
};
type Variant = keyof typeof CTA;

/** The page's one main action: 52px tall, full width on a phone. Same colours as the kit's buttons. */
export const cta = (v: Variant = "primary", extra = "") =>
  `inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg border px-5 text-center text-base font-semibold disabled:opacity-50 disabled:shadow-none ${CTA[v]} ${extra}`;

/** A smaller action beside or under the main one: still a full 44px touch target. */
export const tap = (v: Variant = "secondary", extra = "") =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-center text-[0.95rem] font-semibold disabled:opacity-50 disabled:shadow-none ${CTA[v]} ${extra}`;

/** A text link that is still easy to hit with a thumb. */
export const textLink = "inline-flex min-h-11 items-center gap-1.5 font-semibold text-blue underline-offset-2 hover:text-blue-deep hover:underline";

export function Cta({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...p} className={cta(variant, className)} />;
}

export function Tap({ variant = "secondary", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...p} className={tap(variant, className)} />;
}

/** What this page is, who it is for, the date that matters. One per page, above the cards. */
export function PageTitle({ eyebrow, title, sub, aside }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-5">
      {(eyebrow || aside) && (
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {eyebrow && <p className="text-sm font-medium text-ink-soft tabular-nums">{eyebrow}</p>}
          {aside}
        </div>
      )}
      <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] sm:text-[2rem]">{title}</h1>
      {sub && <p className="mt-2 max-w-[60ch] text-ink-soft">{sub}</p>}
    </header>
  );
}

/** A finished or settled state: a calm tick, what happened, what happens next. */
export function Done({ title, children, tone = "good" }: { title: ReactNode; children?: ReactNode; tone?: "good" | "info" }) {
  const good = tone === "good";
  return (
    <section role="status" className={`flex gap-3 rounded-xl border p-4 sm:p-5 ${good ? "border-emerald-200 bg-emerald-50" : "border-line bg-white shadow-card"}`}>
      {good ? <CircleCheck className="mt-0.5 size-6 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden /> : <Info className="mt-0.5 size-6 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className={`font-display text-lg font-semibold leading-snug ${good ? "text-emerald-950" : ""}`}>{title}</p>
        {children && <div className={`mt-1 ${good ? "text-emerald-900" : "text-ink-soft"}`}>{children}</div>}
      </div>
    </section>
  );
}

/** The link is no good (expired, replaced, not available): say so and say what to do. A whole page on its own. */
export function LinkProblem({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
      <CircleAlert className="size-7 text-amber-600" strokeWidth={1.75} aria-hidden />
      <h1 className="mt-3 font-display text-2xl font-semibold leading-tight">{title}</h1>
      {children && <div className="mt-2 text-ink-soft">{children}</div>}
    </section>
  );
}

/** A big tick row: the whole row is the target, the box shows the state, a price can sit on the right. */
export function TickRow({ children, price, className = "", ...p }: Omit<ComponentProps<"input">, "type"> & { price?: ReactNode }) {
  return (
    <label className={`flex min-h-[52px] cursor-pointer items-start gap-3 rounded-lg border border-line bg-white px-3.5 py-3 hover:border-ink-faint/60 has-[:checked]:border-blue has-[:checked]:bg-blue/5 has-[:disabled]:cursor-default has-[:disabled]:hover:border-line ${className}`}>
      <input type="checkbox" {...p} className="mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {price != null && <span className="shrink-0 font-semibold tabular-nums">{price}</span>}
    </label>
  );
}

/** One line of a totals block: label left, figure right, figures lined up. */
export function TotalRow({ label, value, strong, muted }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-line pt-3 font-semibold first:border-t-0 first:pt-0" : ""} ${muted ? "text-ink-soft" : ""}`}>
      <dt>{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "font-display text-[1.75rem] font-semibold leading-none" : ""}`}>{value}</dd>
    </div>
  );
}

/** "Questions? Call or email": the same closing line under every client page. */
export function Help({ phone, email, children }: { phone: string; email: string; children?: ReactNode }) {
  return (
    <p className="no-print mt-6 text-center text-sm text-ink-soft">
      {children}{children && " "}Questions? Call <a href={`tel:+1${phone.replace(/\D/g, "")}`} className="font-semibold text-navy underline underline-offset-2">{prettyPhone(phone)}</a> or email{" "}
      <a href={`mailto:${email}`} className="font-semibold text-navy underline underline-offset-2">{email}</a>.
    </p>
  );
}
