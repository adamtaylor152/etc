// Signatures on a record (owner view): image, name, when, in person or online.
import Link from "next/link";
import { PenLine } from "lucide-react";
import { db } from "@/server/db";
import { prettyDateTime } from "@/server/dates";
import { Card } from "./ui";

export async function SignatureCard({ where, signHref, title = "Signatures" }: { where: { quoteId?: string; invoiceId?: string; visitId?: string }; signHref: string; title?: string }) {
  const sigs = await db.signature.findMany({ where, orderBy: { signedAt: "desc" } });
  return (
    <Card title={title} actions={<Link href={signHref} className="inline-flex min-h-8 max-sm:min-h-11 items-center gap-1.5 text-sm font-semibold text-blue hover:text-blue-deep"><PenLine className="size-4" aria-hidden />Collect signature</Link>}>
      {sigs.length ? (
        <ul className="divide-y divide-line-soft">
          {sigs.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- private media */}
              <img src={`/api/media/${s.attachmentId}/sm`} alt={`Signature of ${s.signerName}`} className="h-14 w-32 shrink-0 rounded-lg border border-line bg-white object-contain" />
              <span className="min-w-0 text-sm"><span className="font-semibold">{s.signerName}</span><span className="block text-xs text-ink-soft tabular-nums">{prettyDateTime(s.signedAt)} · {s.inPerson ? "in person" : "online"}{s.docHash && ` · doc ${s.docHash.slice(0, 8)}`}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-soft">Not signed yet.</p>}
    </Card>
  );
}
