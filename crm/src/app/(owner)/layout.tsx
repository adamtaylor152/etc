import { OwnerChrome } from "@/components/shell/owner-chrome";
import { requireOwner } from "@/server/auth";

export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const user = await requireOwner();
  return <OwnerChrome user={user}>{children}</OwnerChrome>;
}
