import type {
  WorkCategory,
  WorkedOnReason,
} from "../app/components/people/types";

/** Built-in status keys, used when a project has no WorkflowStatus row. */
const BUILT_IN_CATEGORY: Record<string, WorkCategory> = {
  BACKLOG: "TODO",
  OPEN: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_PROGRESS",
  DONE: "DONE",
};

const BUILT_IN_NAME: Record<string, string> = {
  BACKLOG: "Backlog",
  OPEN: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export type StatusLookup = Map<string, { name: string; category: WorkCategory }>;

export function statusLookupKey(projectId: string, status: string) {
  return `${projectId}:${status}`;
}

function asCategory(value: string): WorkCategory {
  return value === "DONE" || value === "IN_PROGRESS" ? value : "TODO";
}

export function buildStatusLookup(
  rows: { projectId: string; key: string; name: string; category: string }[],
): StatusLookup {
  return new Map(
    rows.map((row) => [
      statusLookupKey(row.projectId, row.key),
      { name: row.name, category: asCategory(row.category) },
    ]),
  );
}

export function resolveStatus(
  lookup: StatusLookup,
  projectId: string,
  status: string,
): { name: string; category: WorkCategory } {
  const configured = lookup.get(statusLookupKey(projectId, status));
  if (configured) return configured;
  return {
    name:
      BUILT_IN_NAME[status] ??
      status
        .toLowerCase()
        .split("_")
        .map((part, index) =>
          index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
        )
        .join(" "),
    category: BUILT_IN_CATEGORY[status] ?? "TODO",
  };
}

export type WorkEvent = {
  issueId: string;
  at: Date;
  reason: WorkedOnReason;
  detail: string | null;
};

/** Latest event per issue, newest first (Jira profile "Worked on"). */
export function mergeWorkedOn(events: WorkEvent[], limit: number) {
  const latest = new Map<string, WorkEvent>();
  for (const event of events) {
    const current = latest.get(event.issueId);
    if (!current || current.at < event.at) latest.set(event.issueId, event);
  }
  return [...latest.values()]
    .sort((left, right) => right.at.getTime() - left.at.getTime())
    .slice(0, limit);
}

/** Projects a person touched, by distinct issue count then recency. */
export function summarizePlaces(
  touches: { projectId: string; issueId: string; at: Date }[],
) {
  const places = new Map<string, { issues: Set<string>; lastAt: Date }>();
  for (const touch of touches) {
    const place = places.get(touch.projectId) ?? {
      issues: new Set<string>(),
      lastAt: touch.at,
    };
    place.issues.add(touch.issueId);
    if (place.lastAt < touch.at) place.lastAt = touch.at;
    places.set(touch.projectId, place);
  }
  return [...places.entries()]
    .map(([projectId, place]) => ({
      projectId,
      issueCount: place.issues.size,
      lastAt: place.lastAt,
    }))
    .sort(
      (left, right) =>
        right.lastAt.getTime() - left.lastAt.getTime() ||
        right.issueCount - left.issueCount,
    );
}

/**
 * Jira team permissions here: workspace owners can manage any team; members
 * can manage teams they belong to; viewers are read-only.
 */
export function canEditTeam(
  role: string,
  userId: string,
  memberUserIds: string[],
) {
  if (role === "owner") return true;
  if (role === "viewer") return false;
  return memberUserIds.includes(userId);
}

export function canCreateTeam(role: string) {
  return role === "owner" || role === "member";
}
