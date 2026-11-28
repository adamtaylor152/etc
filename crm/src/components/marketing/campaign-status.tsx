// A campaign's status as a badge, in words (the same on the list and on the campaign itself).
import { Badge, type Tone } from "@/components/ui";

const STATUS: Record<string, [string, Tone]> = {
  DRAFT: ["Draft", "gray"], SCHEDULED: ["Scheduled", "blue"], SENDING: ["Sending", "blue"], SENT: ["Sent", "green"], CANCELLED: ["Cancelled", "gray"],
};

export function CampaignBadge({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status.charAt(0) + status.slice(1).toLowerCase(), "gray" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}
