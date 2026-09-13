/**
 * Notification domain types + pure logic for the autonomous-agent hub.
 *
 * Every notification is actionable (it names the surface that resolves it)
 * and carries a category used by the drawer tabs. Pure functions only — the
 * drawer component stays a thin projection.
 */

export type NotificationCategory = "renewals" | "closet" | "system";

export type NotificationActionKind = "link" | "dismiss";

export interface AgentNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  detail: string;
  /** Primary action: navigate somewhere useful. */
  action: { kind: "link"; label: string; href: string };
  createdAt: string;
  read: boolean;
  /** Urgency affects tint only; ordering is deterministic by createdAt. */
  urgency: "normal" | "review" | "urgent";
}

export const NOTIFICATION_TABS: Array<{
  id: "all" | NotificationCategory;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "renewals", label: "Renewals" },
  { id: "closet", label: "Closet" },
  { id: "system", label: "System" },
];

/** Pure filter for the drawer tabs ("all" keeps everything). */
export function filterNotifications(
  items: AgentNotification[],
  tab: "all" | NotificationCategory,
): AgentNotification[] {
  const selected = tab === "all" ? items : items.filter((n) => n.category === tab);
  return [...selected].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function unreadCount(items: AgentNotification[]): number {
  return items.filter((n) => !n.read).length;
}

/** Human "2h ago" / "in 3d" style stamps (Intl-backed, deterministic input). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffMs = Date.parse(iso) - now;
  const absMinutes = Math.round(Math.abs(diffMs) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absMinutes < 60) {
    return diffMs >= 0
      ? rtf.format(Math.round((Date.parse(iso) - now) / 60_000), "minute")
      : rtf.format(-absMinutes, "minute");
  }
  const hours = diffMs / 3_600_000;
  if (Math.abs(hours) < 24) return rtf.format(Math.round(hours), "hour");
  const days = hours / 24;
  if (Math.abs(days) < 30) return rtf.format(Math.round(days), "day");
  const months = days / 30;
  return rtf.format(Math.round(months), "month");
}
