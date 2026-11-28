// Settings building blocks: the switch row every on/off setting uses, and compact controls for numbers inside a sentence.
import type { ReactNode } from "react";

/** A number or short select that sits inside a sentence ("Send [3] days after…"). Sized to its content, never stretched. */
export const inlineCls = "min-h-10 rounded-lg border border-line bg-white px-2.5 text-base tabular-nums outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 disabled:bg-tint disabled:text-ink-soft sm:text-sm";
export const numCls = `${inlineCls} w-20`;

/**
 * One on/off setting: the switch, its label, a one-sentence description, and (as children) the numbers that only
 * matter while it is on, indented under the label. It is still a plain checkbox to the form.
 */
export function SwitchRow({ name, value, defaultChecked, disabled, label, description, children }: {
  name: string; value?: string; defaultChecked?: boolean; disabled?: boolean; label: ReactNode; description?: ReactNode; children?: ReactNode;
}) {
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <span className="relative mt-px inline-flex h-6 w-10 shrink-0">
          <input type="checkbox" role="switch" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
          <span aria-hidden className="absolute inset-0 rounded-full bg-ink-faint transition-colors peer-checked:bg-blue peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue peer-disabled:opacity-50" />
          <span aria-hidden className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{label}</span>
          {description && <span className="block max-w-[70ch] text-sm text-ink-soft">{description}</span>}
        </span>
      </label>
      {children && <div className="mb-2 ml-[3.25rem] space-y-2 text-sm">{children}</div>}
    </div>
  );
}

/** Inline flow, so a long sentence wraps mid-sentence around its controls instead of dropping whole chunks to new lines. */
export const inlineRow = "block text-sm [&>input]:mx-1 [&>input]:my-1 [&>input]:align-middle [&>select]:mx-1 [&>select]:my-1 [&>select]:align-middle";

/** A sentence with controls in it: reads naturally on a desk, wraps cleanly on a phone. */
export function InlineField({ children }: { children: ReactNode }) {
  return <label className={inlineRow}>{children}</label>;
}

/** The green "Saved." (or a longer message) at the top of the section that was just saved. */
export function Saved({ when, children = "Saved." }: { when: boolean; children?: ReactNode }) {
  if (!when) return null;
  return <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900">{children}</p>;
}
