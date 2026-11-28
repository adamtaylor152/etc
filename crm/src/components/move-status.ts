// What the calendar and the team board say after a drag: saved, any conflicts, and whether the client was told.
export function moveStatus(r: { warnings: string[]; notified: "email" | "text" | null }) {
  const told = r.notified ? ` Client ${r.notified === "text" ? "texted" : "emailed"} about the new time.` : "";
  return `${r.warnings.length ? `Saved, but: ${r.warnings.join("; ")}.` : "Saved."}${told}`;
}
