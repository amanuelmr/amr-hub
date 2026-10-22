export const RECENT_GROUPS = ["Today", "Yesterday", "This week", "This month", "Older"] as const;

export type RecentGroup = (typeof RECENT_GROUPS)[number];

/** Buckets a "viewed at" time the way the Recent menu groups items. */
export function recentGroup(viewedAt: string, now: Date): RecentGroup {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const viewed = new Date(viewedAt);
  const days = Math.round((day(now) - day(viewed)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (viewed.getFullYear() === now.getFullYear() && viewed.getMonth() === now.getMonth()) {
    return "This month";
  }
  return "Older";
}

/** Keeps the incoming order inside each group and drops empty groups. */
export function groupRecent<T extends { viewedAt: string }>(items: T[], now: Date) {
  return RECENT_GROUPS.map((label) => ({
    label,
    items: items.filter((item) => recentGroup(item.viewedAt, now) === label),
  })).filter((group) => group.items.length > 0);
}
