// The billing run as a visible sequence: what is unbilled, review the drafts, send.
import type { ReactNode } from "react";
import { Check } from "lucide-react";

export type Step = { title: string; detail: ReactNode; state: "done" | "now" | "later"; href?: string };

/** Numbered marker reused on the step strip and on each step's own card. */
export function StepDot({ n, state }: { n: number; state: Step["state"] }) {
  const cls = state === "now" ? "border-blue bg-blue text-white" : state === "done" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-line bg-white text-ink-soft";
  return (
    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${cls}`}>
      {state === "done" ? <Check className="size-3.5" strokeWidth={2.25} aria-hidden /> : n}
      <span className="sr-only">{state === "done" ? `Step ${n}, done` : state === "now" ? ", current step" : ""}</span>
    </span>
  );
}

export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="mb-5 grid overflow-hidden rounded-xl border border-line bg-white shadow-card sm:grid-cols-3">
      {steps.map((s, i) => {
        const body = (
          <>
            <StepDot n={i + 1} state={s.state} />
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${s.state === "later" ? "text-ink-soft" : ""}`}>{s.title}</span>
              <span className="block text-xs tabular-nums text-ink-soft">{s.detail}</span>
            </span>
          </>
        );
        return (
          <li key={s.title} aria-current={s.state === "now" ? "step" : undefined} className="border-b border-line-soft last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            {s.href ? <a href={s.href} className="flex items-start gap-3 px-4 py-3 hover:bg-tint">{body}</a> : <div className="flex items-start gap-3 px-4 py-3">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
