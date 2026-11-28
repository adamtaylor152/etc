// Signatures on a record (owner view): image, name, when, in person or online.
import Link from "next/link";
import { PenLine } from "lucide-react";
import { db } from "@/server/db";
import { prettyDateTime } from "@/server/dates";

export async function SignatureCard({ where, signHref, title = "Signatures" }: { where: { quoteId?: string; invoiceId?: string; visitId?: string }; signHref: string; title?: string }) {
  const sigs = await db.signature.findMany({ where, orderBy: { signedAt: "desc" } });
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-bold">{title}</h2><Link href={signHref} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><PenLine className="size-4" />Collect signature</Link></div>
      {sigs.length ? (
        <ul className="space-y-3">
          {sigs.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- private media */}
              <img src={`/api/media/${s.attachmentId}/sm`} alt={`Signature of ${s.signerName}`} className="h-14 w-36 rounded border border-line bg-white object-contain" />
              <span className="text-sm"><span className="font-semibold">{s.signerName}</span><span className="block text-xs text-ink-soft">{prettyDateTime(s.signedAt)} · {s.inPerson ? "in person" : "online"}{s.docHash && ` · doc ${s.docHash.slice(0, 8)}`}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-soft">Not signed yet.</p>}
    </section>
  );
}
