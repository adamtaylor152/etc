// /messages on a wide screen: the list is on the left, so this is just the empty right pane.
import { MessageSquare } from "lucide-react";
import { requireOwner } from "@/server/auth";
import { ButtonLink } from "@/components/ui";
import { smsEnabled } from "@/server/sms";

export default async function MessagesHome() {
  await requireOwner();
  const on = smsEnabled();
  return (
    <section className="hidden place-items-center rounded-xl border border-line bg-white p-8 text-center shadow-card md:grid">
      <div className="max-w-sm">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-tint text-ink-soft"><MessageSquare className="size-5" strokeWidth={1.75} aria-hidden /></span>
        <p className="font-display text-lg font-semibold">Texts with clients</p>
        <p className="mt-1 text-sm text-ink-soft">{on ? "Pick a conversation on the left, or start a new one. Photos clients text in can be filed on their job or quote." : "Texting isn't set up yet. You can still read past conversations."}</p>
        {on && <div className="mt-4 flex justify-center"><ButtonLink href="/messages/new">New message</ButtonLink></div>}
      </div>
    </section>
  );
}
