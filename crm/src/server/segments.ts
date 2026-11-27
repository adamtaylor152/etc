// How many carrier segments a text costs. Pure (no Node imports) so the browser composer can use it too.
/** GSM-7 texts fit 160 chars (153 per part when split); anything with emoji etc. is UCS-2: 70 (67). Pure, unit-tested. */
export function segments(text: string): { parts: number; perPart: number; unicode: boolean } {
  const unicode = /[^\n\r -~£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€^{}\\\[~\]|]/.test(text);
  const len = unicode ? [...text].length : [...text].reduce((n, c) => n + ("^{}\\[~]|€".includes(c) ? 2 : 1), 0);
  const [one, many] = unicode ? [70, 67] : [160, 153];
  return { parts: len === 0 ? 0 : len <= one ? 1 : Math.ceil(len / many), perPart: len <= one ? one : many, unicode };
}
