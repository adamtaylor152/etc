// Sales pipeline: every open request and quote as a card in the column its status puts it in. Cards move by doing the
// normal thing (send the quote, the client approves, ...), so there is nothing to drag and nothing to keep in sync.
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { age, quoteStage, requestStage, STAGES, type Stage } from "@/server/status/pipeline";

export const metadata = { title: "Pipeline" };
const TONE: Record<Stage, string> = { new: "border-t-orange-400", assessment: "border-t-orange-400", quoting: "border-t-rose-400", sent: "border-t-amber-400", changes: "border-t-red-500", won: "border-t-emerald-500", lost: "border-t-slate-400" };
type Card = { key: string; href: string; kind: string; title: string; client: string; cents: number | null; since: Date; note?: string | null };

/** Server-side "now" maths kept out of the component body. */
function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }

export default async function Pipeline() {
  const user = await requireOwner();
  const recent = daysAgo(30); // closed cards (won / lost) drop off after 30 days
  const [requests, quotes] = await Promise.all([
    db.request.findMany({
      where: { businessId: user.businessId, OR: [{ status: { in: ["NEW", "ASSESSMENT_SCHEDULED"] } }, { status: "CONVERTED", convertedAt: { gte: recent } }, { status: "ARCHIVED", archivedAt: { gte: recent } }] },
      include: { client: true, _count: { select: { quotes: true, jobs: true } } }, orderBy: { createdAt: "desc" }, take: 500,
    }),
    db.quote.findMany({
      where: { businessId: user.businessId, OR: [{ status: { in: ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"] } }, { status: { in: ["APPROVED", "CONVERTED"] }, approvedAt: { gte: recent } }, { status: "DECLINED", declinedAt: { gte: recent } }, { status: "ARCHIVED", archivedAt: { gte: recent }, approvedAt: null }] },
      include: { client: true }, orderBy: { createdAt: "desc" }, take: 500,
    }),
  ]);
  const cols = new Map<Stage, Card[]>(STAGES.map(([k]) => [k, []]));
  for (const r of requests) {
    const stage = requestStage({ status: r.status, quotes: r._count.quotes, jobs: r._count.jobs });
    if (stage) cols.get(stage)!.push({ key: r.id, href: `/requests/${r.id}`, kind: `Request #${r.number}`, title: r.title, client: clientName(r.client), cents: null, since: r.archivedAt ?? r.convertedAt ?? r.assessmentAt ?? r.createdAt, note: stage === "lost" ? r.lostReason : r.estimateText });
  }
  for (const q of quotes) {
    cols.get(quoteStage(q.status))!.push({ key: q.id, href: `/quotes/${q.id}`, kind: `Quote #${q.number}`, title: q.title ?? "Quote", client: clientName(q.client), cents: q.totalCents, since: q.declinedAt ?? q.archivedAt ?? q.approvedAt ?? q.changesRequestedAt ?? q.lastSentAt ?? q.sentAt ?? q.createdAt, note: q.status === "DECLINED" ? q.declineReason : null });
  }
  const sum = (cs: Card[]) => cs.reduce((n, c) => n + (c.cents ?? 0), 0);
  const won = cols.get("won")!, lost = cols.get("lost")!;
  return (
    <>
      <PageHeader title="Pipeline" sub={`Open work to win, plus what closed in the last 30 days${won.length + lost.length ? `: ${Math.round((100 * won.length) / (won.length + lost.length))}% won` : ""}.`} />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
        {STAGES.map(([k, label]) => {
          const cards = cols.get(k)!;
          return (
            <section key={k} className={`w-64 shrink-0 rounded-lg border border-line border-t-4 bg-tint/50 ${TONE[k]}`} aria-label={label}>
              <h2 className="flex items-baseline justify-between gap-2 px-3 pt-2 text-sm font-bold">{label}<span className="text-xs font-semibold text-ink-soft">{cards.length}{sum(cards) > 0 && ` · ${money(sum(cards))}`}</span></h2>
              <ul className="space-y-2 p-2">
                {cards.map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} className="block rounded-lg border border-line bg-white p-2.5 text-sm shadow-card hover:border-blue">
                      <span className="flex items-baseline justify-between gap-2 text-xs text-ink-soft"><span>{c.kind}</span><span>{age(c.since)}</span></span>
                      <span className="block font-semibold">{c.client}</span>
                      <span className="block truncate text-ink-soft">{c.title}</span>
                      {c.cents != null && c.cents > 0 && <span className="block font-semibold">{money(c.cents)}</span>}
                      {c.note && <span className="mt-1 block truncate text-xs text-ink-soft">{c.note}</span>}
                    </Link>
                  </li>
                ))}
                {!cards.length && <li className="px-1 py-3 text-center text-xs text-ink-soft">Nothing here</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
