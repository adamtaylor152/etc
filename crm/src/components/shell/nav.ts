// Sidebar + Create menu entries. Add items here as pages land.
import {
  Banknote, CalendarDays, FileText, Hammer, Home, Inbox, LineChart, MapPinned, MessageSquare, Receipt, Settings, Snowflake, Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "unread" | "toMatch"; children?: { href: string; label: string; badge?: "toMatch" }[] };

export const NAV: NavItem[][] = [
  [
    { href: "/", label: "Home", icon: Home },
    { href: "/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/clients", label: "Clients", icon: Users },
  ],
  [
    { href: "/requests", label: "Requests", icon: Inbox },
    { href: "/quotes", label: "Quotes", icon: FileText },
    { href: "/jobs", label: "Jobs", icon: Hammer },
    { href: "/invoices", label: "Invoices", icon: Receipt, children: [{ href: "/billing", label: "Billing run" }] },
    { href: "/payments", label: "Payments", icon: Banknote, badge: "toMatch", children: [{ href: "/payments/unmatched", label: "To match", badge: "toMatch" }] },
  ],
  [
    { href: "/snow", label: "Snow", icon: Snowflake },
    { href: "/routes", label: "Route", icon: MapPinned },
    { href: "/messages", label: "Messages", icon: MessageSquare, badge: "unread" },
  ],
  [
    { href: "/reports", label: "Reports", icon: LineChart },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
];

export type CreateItem = { href: string; label: string; icon: LucideIcon; color: string };
// Object colours (Jobber's convention): request orange, quote rose, job green, invoice blue, task navy.
export const CREATE: CreateItem[] = [
  { href: "/quotes/new", label: "Quote", icon: FileText, color: "text-rose-700" },
  { href: "/jobs/new", label: "Job", icon: Hammer, color: "text-emerald-700" },
  { href: "/messages/new", label: "Text message", icon: MessageSquare, color: "text-blue" },
  { href: "/snow", label: "Storm", icon: Snowflake, color: "text-sky-700" },
];
