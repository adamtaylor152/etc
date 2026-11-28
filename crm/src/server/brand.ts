// Brand colour rules (Settings › Messages). Pure, unit-tested.

/** "#1d6fd8" -> [r, g, b], each 0..1. */
export const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

const luminance = (hex: string) => {
  const [r, g, b] = hexRgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two #rrggbb colours: 1 (the same) to 21 (black on white). */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Why a colour can't be the brand colour, or null if it can. Buttons are this colour with white text, and links and
 * totals are this colour on a white page, so it has to pass 4.5:1 against white (WCAG AA for text).
 */
export function brandColorError(hex: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "Use a colour like #1d6fd8";
  return contrast(hex, "#ffffff") < 4.5 ? "That colour is too light: white button text wouldn't be readable on it. Pick a darker shade." : null;
}
