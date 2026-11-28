// "How did we do?" 1–5 stars. 4–5 -> thank you + Google review button; 1–3 -> private feedback to the owners.
import { Card } from "@/components/ui";
import { db } from "@/server/db";
import { peekToken } from "@/server/tokens";
import { rateAction, feedbackAction } from "./actions";

export const metadata = { title: { absolute: "How did we do? · etc." }, robots: { index: false } };

export default async function Review({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["REVIEW"]);
  if (!t.ok || !t.token.redirectPath) return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Thanks for thinking of us! Give us a call any time.</p></Card>;
  const r = await db.reviewRequest.findUnique({ where: { id: t.token.redirectPath } });
  if (!r) return <Card><h1 className="font-display text-2xl font-bold">Thanks!</h1></Card>;
  const biz = await db.business.findUniqueOrThrow({ where: { id: r.businessId } });
  const c = await db.client.findUniqueOrThrow({ where: { id: r.clientId } });

  if (r.feedback || sp.sent) return <Card><h1 className="font-display text-2xl font-bold">Thank you, {c.firstName}.</h1><p className="mt-2 text-ink-soft">We read every word, and we&apos;ll be in touch to make it right.</p></Card>;
  if (r.rating && r.rating >= 4) return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Thank you, {c.firstName}! 🎉</h1>
      <p className="mt-2 text-ink-soft">Would you share that on Google? It helps neighbours find a local business, and it means a lot to us.</p>
      {biz.googleReviewUrl && <a href={`/r/${token}/go`} className="mt-4 inline-flex min-h-12 items-center rounded-full bg-blue px-6 font-semibold text-white">Leave a Google review</a>}
    </Card>
  );
  if (r.rating) return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Sorry we missed the mark.</h1>
      <p className="mt-2 text-ink-soft">What could we have done better? This goes straight to the owners, not online.</p>
      <form action={feedbackAction} className="mt-4 space-y-3">
        <input type="hidden" name="t" value={token} />
        <textarea name="feedback" required rows={5} maxLength={3000} className="w-full rounded-xl border border-line p-3" />
        <button className="min-h-12 rounded-full bg-blue px-6 font-semibold text-white">Send to the owners</button>
      </form>
    </Card>
  );
  return (
    <Card>
      <h1 className="font-display text-2xl font-bold">Hi {c.firstName}, how did we do?</h1>
      <p className="mt-2 text-ink-soft">Tap a star.</p>
      <div className="mt-4 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <form key={n} action={rateAction}>
            <input type="hidden" name="t" value={token} /><input type="hidden" name="rating" value={n} />
            <button aria-label={`${n} star${n === 1 ? "" : "s"}`} className="grid size-14 place-items-center rounded-full border-2 border-line text-3xl hover:border-amber-400 hover:bg-amber-50">★</button>
          </form>
        ))}
      </div>
    </Card>
  );
}
