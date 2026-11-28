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
  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-line bg-white">
        <canvas ref={canvas} style={{ height, touchAction: "none" }} className="block w-full cursor-crosshair rounded-lg" aria-label="Signature pad: sign with your finger or mouse"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = [pos(e)]; redraw([...strokes, drawing.current]); }}
          onPointerMove={(e) => { if (!drawing.current) return; drawing.current.push(pos(e)); redraw([...strokes, drawing.current]); }}
          onPointerUp={() => { if (drawing.current) { const next = [...strokes, drawing.current]; drawing.current = null; setStrokes(next); redraw(next); } }} />
        {!strokes.length && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-ink-soft">Sign here</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-line" />
      </div>
      <input ref={out} type="hidden" name={name} />
      <div className="mt-1 flex gap-3 text-xs font-semibold text-blue">
        <button type="button" onClick={() => { const n = strokes.slice(0, -1); setStrokes(n); redraw(n); }} disabled={!strokes.length} className="inline-flex items-center gap-1 disabled:opacity-40"><Undo2 className="size-3.5" />Undo</button>
        <button type="button" onClick={() => { setStrokes([]); redraw([]); }} disabled={!strokes.length} className="inline-flex items-center gap-1 disabled:opacity-40"><Eraser className="size-3.5" />Clear</button>
      </div>
    </div>
  );
}
