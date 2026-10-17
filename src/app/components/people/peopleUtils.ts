import type { WorkCategory, WorkItemSummary } from "./types";

export function initialsFor(name: string, email = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email.slice(0, 2) || "?").toUpperCase();
}

/** Theme-token avatar backgrounds, picked deterministically from the id. */
const AVATAR_TONES = [
  "var(--console-cyan)",
  "var(--console-lime)",
  "var(--console-violet)",
  "var(--console-orange)",
  "var(--console-pink)",
  "var(--amber-200)",
  "var(--blue-200)",
  "var(--green-200)",
];

export function avatarTone(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export const CATEGORY_ORDER: { id: WorkCategory; label: string }[] = [
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "TODO", label: "To do" },
  { id: "DONE", label: "Done" },
];

/** Group work items by status category in Jira's order, dropping empty groups. */
export function groupByCategory(issues: WorkItemSummary[]) {
  return CATEGORY_ORDER.map((category) => ({
    ...category,
    issues: issues.filter((issue) => issue.statusCategory === category.id),
  })).filter((group) => group.issues.length > 0);
}

/** Case-insensitive match on any of the given fields. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}

const DAY_MS = 86_400_000;

export function relativeTime(value: string, now: number) {
  const diff = now - new Date(value).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}
