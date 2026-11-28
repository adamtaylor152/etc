// /messages on a wide screen: the list is on the left, so this is just the empty right pane.
import { requireOwner } from "@/server/auth";
import { smsEnabled } from "@/server/sms";

export default async function MessagesHome() {
  await requireOwner();
  return (
    <section className="hidden place-items-center rounded-2xl border border-line bg-white p-8 text-center md:grid">
      <div>
        <p className="font-display text-xl font-bold">Texts with clients</p>
        <p className="mt-1 text-sm text-ink-soft">{smsEnabled() ? "Pick a conversation, or tap New. Photos clients text in can be filed on their job or quote." : "Texting turns on once the Telnyx key is set in Coolify."}</p>
      </div>
    </section>
  );
}
