"use client";
// Draw-to-sign pad: finger, stylus or mouse. Writes a PNG data URL into a hidden input (name="signature").
// Clear / undo; the submit button stays usable, the server rejects blank or tiny signatures.
import { useEffect, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";

type Pt = { x: number; y: number };

export function SignaturePad({ name = "signature", height = 160 }: { name?: string; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const out = useRef<HTMLInputElement>(null);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const drawing = useRef<Pt[] | null>(null);

  const redraw = (list: Pt[][]) => {
    const c = canvas.current!, ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5 * (c.width / c.clientWidth); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#14213d";
    for (const s of list) { ctx.beginPath(); s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y); ctx.stroke(); }
    out.current!.value = list.length ? c.toDataURL("image/png") : "";
  };
  useEffect(() => {
    const c = canvas.current!;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * scale; c.height = height * scale;
  }, [height]);

  const pos = (e: React.PointerEvent) => { const c = canvas.current!, r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }; };
  const tool = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-navy hover:bg-tint disabled:opacity-50";
  return (
    <div>
      <div className="relative rounded-xl border border-line bg-white shadow-card">
        <canvas ref={canvas} style={{ height, touchAction: "none" }} className="block w-full cursor-crosshair rounded-xl" aria-label="Signature pad: sign with your finger or mouse"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = [pos(e)]; redraw([...strokes, drawing.current]); }}
          onPointerMove={(e) => { if (!drawing.current) return; drawing.current.push(pos(e)); redraw([...strokes, drawing.current]); }}
          onPointerUp={() => { if (drawing.current) { const next = [...strokes, drawing.current]; drawing.current = null; setStrokes(next); redraw(next); } }} />
        <span className="pointer-events-none absolute bottom-10 left-5 text-lg leading-none text-ink-faint" aria-hidden>×</span>
        <span className="pointer-events-none absolute inset-x-5 bottom-9 border-b border-ink-faint/50" aria-hidden />
        {!strokes.length && <span className="pointer-events-none absolute inset-x-0 bottom-2.5 text-center text-xs text-ink-soft">Sign above the line</span>}
      </div>
      <input ref={out} type="hidden" name={name} />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => { const n = strokes.slice(0, -1); setStrokes(n); redraw(n); }} disabled={!strokes.length} title={strokes.length ? undefined : "Nothing to undo yet"} className={tool}><Undo2 className="size-4" aria-hidden />Undo</button>
        <button type="button" onClick={() => { setStrokes([]); redraw([]); }} disabled={!strokes.length} title={strokes.length ? undefined : "Nothing to clear yet"} className={tool}><Eraser className="size-4" aria-hidden />Clear</button>
      </div>
    </div>
  );
}
