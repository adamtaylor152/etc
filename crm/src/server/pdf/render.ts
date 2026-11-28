// One page layout for invoices, quotes and statements, drawn with pdf-lib (pure JS, no browser). It uses the
// PDF standard fonts, which every reader ships: nothing is read from disk, so it works in the slim Docker image.
// Standard fonts only know Windows-1252, so text is cleaned first (a character they lack becomes "?", never a crash).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { hexRgb } from "../brand";

export type PdfTable = { columns: { label: string; width?: number; align?: "right" }[]; rows: { cells: string[]; sub?: string }[] }; // a column with no width takes the rest
export type PdfDoc = {
  title: string; number?: string; badge?: string; // "Invoice", "#123", "PAID"
  business: string[]; // name first, then one detail per line
  to: string[]; // client name first, then address lines
  meta: [string, string][]; // Issued / Due / ...
  subject?: string;
  table: PdfTable;
  totals: { label: string; value: string; bold?: boolean }[];
  notes: { heading: string; body: string }[];
  footer: string;
  brand?: { color?: string | null; logo?: Uint8Array | null }; // the owner's colour and logo (PNG); neither = the standard look
};

const W = 612, H = 792, M = 54, INNER = W - 2 * M; // US Letter
const INK = rgb(0.07, 0.13, 0.24), SOFT = rgb(0.4, 0.45, 0.52), LINE = rgb(0.85, 0.87, 0.9), BLUE = rgb(0.11, 0.44, 0.85);

/** Make text drawable with a standard font. Exported for tests. */
export function cleaner(font: PDFFont) {
  const ok = new Set(font.getCharacterSet());
  return (s: string) => s.normalize("NFC").replace(/[\r‍️]/g, "").replace(/[−‐‑]/g, "-").replace(/→/g, "->").replace(/[\t  ]/g, " ")
    .replace(/[^\n]/gu, (c) => (ok.has(c.codePointAt(0)!) ? c : "?"));
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (let word of para.split(" ")) {
      // A single word wider than the column is cut to fit.
      while (font.widthOfTextAtSize(word, size) > max && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > max) n--;
        if (line) { out.push(line); line = ""; }
        out.push(word.slice(0, n)); word = word.slice(n);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > max) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function renderPdf(d: PdfDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = cleaner(regular);
  pdf.setTitle(clean(`${d.title} ${d.number ?? ""}`.trim())); pdf.setAuthor(clean(d.business[0] ?? "")); pdf.setCreator("etc. CRM");
  let page: PDFPage = pdf.addPage([W, H]), y = H - M;
  type Opt = { x?: number; w?: number; size?: number; font?: PDFFont; color?: typeof INK; align?: "right" };
  /** Lines a block will take, so rows can be measured before they are drawn. */
  const fit = (text: string, o: Opt) => wrap(clean(text), o.font ?? regular, o.size ?? 10, o.w ?? INNER);
  const drawLines = (lines: string[], top: number, o: Opt) => {
    const size = o.size ?? 10, font = o.font ?? regular, x = o.x ?? M, w = o.w ?? INNER;
    lines.forEach((l, i) => page.drawText(l, { x: o.align === "right" ? x + w - font.widthOfTextAtSize(l, size) : x, y: top - size - i * size * 1.35, size, font, color: o.color ?? INK }));
    return lines.length * size * 1.35;
  };
  const need = (h: number) => { if (y - h < M + 24) { page = pdf.addPage([W, H]); y = H - M; return true; } return false; };
  /** Draw side-by-side blocks from the same top edge; move down by the tallest. */
  const row = (blocks: (Opt & { text: string })[], gap = 4) => {
    const fitted = blocks.map((b) => fit(b.text, b));
    const h = Math.max(...fitted.map((l, i) => l.length * (blocks[i].size ?? 10) * 1.35));
    need(h);
    fitted.forEach((l, i) => drawLines(l, y, blocks[i]));
    y -= h + gap;
  };
  const rule = (color = LINE, thickness = 0.75) => { page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness, color }); y -= 8; };

  // Who it's from, and what it is. With a logo, it takes the name's place and the name moves to the small print.
  const half = INNER / 2 - 10, right = M + INNER / 2 + 10;
  const accent = d.brand?.color ? rgb(...hexRgb(d.brand.color)) : BLUE;
  const logo = d.brand?.logo ? await pdf.embedPng(d.brand.logo).catch(() => null) : null; // a logo we can't read never stops an invoice
  const title = { text: d.title.toUpperCase(), size: 18, font: bold, color: accent, x: right + 60, w: half - 60, align: "right" as const };
  if (logo) {
    const s = logo.scaleToFit(200, 48);
    page.drawImage(logo, { x: M, y: y - s.height, width: s.width, height: s.height });
    drawLines(fit(title.text, title), y, title);
    y -= s.height + 8;
    row([{ text: d.business[0] ?? "", size: 10, font: bold, w: half + 60 }], 1);
  } else row([{ text: d.business[0] ?? "", size: 20, font: bold, w: half + 60 }, title], 2);
  row([
    { text: d.business.slice(1).join("\n"), size: 9, color: SOFT, w: half + 60 },
    { text: [d.number, d.badge].filter(Boolean).join("\n"), size: 11, font: bold, x: right + 60, w: half - 60, align: "right" },
  ], 14);
  rule();
  // Who it's for, and the dates.
  const top = y;
  row([{ text: "FOR", size: 8, font: bold, color: SOFT, w: half }], 2);
  row([{ text: d.to[0] ?? "", size: 11, font: bold, w: half }], 1);
  if (d.to.length > 1) row([{ text: d.to.slice(1).join("\n"), size: 10, w: half }], 0);
  const leftEnd = y;
  y = top;
  for (const [k, v] of d.meta) row([{ text: k, size: 10, color: SOFT, x: right, w: 90 }, { text: v, size: 10, x: right + 90, w: half - 90, align: "right" }], 2);
  y = Math.min(y, leftEnd) - 14;
  if (d.subject) row([{ text: d.subject, size: 13, font: bold }], 10);

  // The table. A column without a width takes what is left.
  const fixed = d.table.columns.reduce((n, c) => n + (c.width ?? 0), 0);
  let x = M;
  const cols = d.table.columns.map((c) => { const w = c.width ?? INNER - fixed; const col = { ...c, x, w: w - 8 }; x += w; return col; });
  const head = () => {
    row(cols.map((c) => ({ text: c.label.toUpperCase(), size: 8, font: bold, color: SOFT, x: c.align ? c.x + 8 : c.x, w: c.w, align: c.align })), 4);
    rule(INK, 1);
  };
  head();
  for (const r of d.table.rows) {
    const blocks = cols.map((c, i) => ({ text: r.cells[i] ?? "", size: 10, x: c.align ? c.x + 8 : c.x, w: c.w, align: c.align }));
    const sub = r.sub ? fit(r.sub, { size: 8.5, w: cols[0].w }) : [];
    const h = Math.max(...blocks.map((b) => fit(b.text, b).length * 13.5)) + sub.length * 8.5 * 1.35 + 12;
    if (need(h)) head(); // never split a line item across pages; repeat the header on the new page
    row(blocks, 1);
    if (sub.length) y -= drawLines(sub, y, { size: 8.5, color: SOFT, x: cols[0].x, w: cols[0].w }) + 1;
    y -= 4; rule();
  }
  if (!d.table.rows.length) { row([{ text: "Nothing to show.", color: SOFT }], 6); rule(); }

  // Totals, right-hand side.
  need(d.totals.length * 16 + 10);
  y -= 2;
  for (const t of d.totals) {
    const size = t.bold ? 12 : 10, font = t.bold ? bold : regular;
    row([{ text: t.label, size, font, color: t.bold ? INK : SOFT, x: right, w: half - 100 }, { text: t.value, size, font, x: right + half - 100, w: 100, align: "right" }], t.bold ? 6 : 3);
  }
  y -= 12;
  for (const n of d.notes.filter((n) => n.body.trim())) {
    need(40);
    row([{ text: n.heading.toUpperCase(), size: 8, font: bold, color: SOFT }], 2);
    // Long notes flow line by line, so a page break can fall inside one.
    for (const l of fit(n.body, { size: 10 })) { need(14); drawLines([l], y, { size: 10 }); y -= 13.5; }
    y -= 10;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const f = clean(d.footer), n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(f, { x: M, y: M - 18, size: 8, font: regular, color: SOFT, maxWidth: INNER - 70 });
    p.drawText(n, { x: W - M - regular.widthOfTextAtSize(n, 8), y: M - 18, size: 8, font: regular, color: SOFT });
  });
  return pdf.save();
}
