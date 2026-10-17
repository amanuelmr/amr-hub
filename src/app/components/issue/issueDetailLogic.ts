import {
  ISSUE_KINDS,
  type Issue,
  type IssueComment,
  type IssueKind,
  type IssueLinkSummary,
  type IssueLinkType,
  type IssueRef,
} from "../../data/issues";
import {
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
  typeLevel,
} from "../../data/workflow";

type ParentCandidate = Pick<Issue, "id" | "title" | "kind" | "projectId"> & {
  parentId?: string | null;
};

/** Jira hierarchy: epics hold standard issues, standard issues hold subtasks. */
export function eligibleParents<T extends ParentCandidate>(
  issue: Pick<Issue, "id" | "kind" | "projectId">,
  candidates: T[],
): T[] {
  if (isEpicLevel(issue.kind)) return [];
  return candidates.filter((candidate) => {
    if (candidate.id === issue.id) return false;
    if (candidate.projectId !== issue.projectId) return false;
    if (candidate.parentId === issue.id) return false;
    if (isSubtaskLevel(issue.kind)) {
      return typeLevel(candidate.kind) === 0;
    }
    return isEpicLevel(candidate.kind);
  });
}

/**
 * Valid type conversions for an issue given its place in the hierarchy.
 * Converting to a subtask requires a non-epic parent; epics cannot have a
 * parent; issues with children keep their level.
 */
export function kindConversions(
  issue: Pick<Issue, "kind" | "childCount"> & {
    parent: Pick<IssueRef, "kind"> | null;
  },
  /** The project's work type keys; defaults to the built-ins. */
  available: readonly IssueKind[] = ISSUE_KINDS,
): IssueKind[] {
  const hasChildren = issue.childCount > 0;
  return available.filter((kind) => {
    if (kind === issue.kind) return true;
    // Same level: always a safe swap (story <-> bug <-> custom standard type).
    if (typeLevel(kind) === typeLevel(issue.kind)) return true;
    if (isEpicLevel(kind)) {
      return !issue.parent && !hasChildren && !isSubtaskLevel(issue.kind);
    }
    if (isSubtaskLevel(kind)) {
      return (
        !hasChildren &&
        issue.parent !== null &&
        typeLevel(issue.parent.kind) === 0
      );
    }
    return !(isEpicLevel(issue.kind) && hasChildren);
  });
}

export function timeTrackingSegments(
  spentMinutes: number,
  remainingMinutes: number | null,
  originalMinutes: number | null,
) {
  const spent = Math.max(0, spentMinutes);
  const remaining = Math.max(0, remainingMinutes ?? 0);
  const total = Math.max(originalMinutes ?? 0, spent + remaining);
  if (total === 0) {
    return { spentPercent: 0, remainingPercent: 0, overEstimate: false };
  }
  return {
    spentPercent: Math.round((spent / total) * 1000) / 10,
    remainingPercent: Math.round((remaining / total) * 1000) / 10,
    overEstimate: originalMinutes !== null && spent + remaining > originalMinutes,
  };
}

export function childProgress(children: Pick<IssueRef, "status">[]) {
  const total = children.length;
  const done = children.filter((child) => isDoneStatus(child.status)).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

const LINK_ORDER: IssueLinkType[] = [
  "BLOCKS",
  "IS_BLOCKED_BY",
  "RELATES_TO",
  "DUPLICATES",
  "IS_DUPLICATED_BY",
  "CLONES",
  "IS_CLONED_BY",
];

export function groupLinks(links: IssueLinkSummary[]) {
  return LINK_ORDER.map((type) => ({
    type,
    links: links.filter((link) => link.type === type),
  })).filter((group) => group.links.length > 0);
}

export type SortOrder = "NEWEST" | "OLDEST";

export function sortByDate<T extends { createdAt: string }>(
  items: T[],
  order: SortOrder,
): T[] {
  const direction = order === "NEWEST" ? -1 : 1;
  return [...items].sort(
    (left, right) =>
      direction *
      (new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime()),
  );
}

export function sortComments(comments: IssueComment[], order: SortOrder) {
  return sortByDate(comments, order);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function matchesIssueQuery(
  issue: Pick<Issue, "id" | "title">,
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    issue.id.toLowerCase().includes(normalized) ||
    issue.title.toLowerCase().includes(normalized)
  );
}

/** A local datetime-local input value for "now". */
export function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function cloneTitleFor(title: string) {
  return `CLONE - ${title}`.slice(0, 255);
}

/** Jira-style relative time: "just now", "5 minutes ago", "3 days ago". */
export function relativeTime(value: string | Date, now: Date = new Date()) {
  const then = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const units: Array<[string, number]> = [
    ["year", 365 * 24 * 3600],
    ["month", 30 * 24 * 3600],
    ["week", 7 * 24 * 3600],
    ["day", 24 * 3600],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
  }
  return "1 minute ago";
}

export function formatAbsolute(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const PANEL_ROUTE_PATTERNS = [/^\/projects\/[^/]+\/backlog\/?$/];

/**
 * Routes that render `?selectedIssue` in their own side panel instead of the
 * global modal: the backlog, and the /issues search page in detail view.
 */
export function isIssuePanelRoute(
  pathname: string,
  search: URLSearchParams | { get: (name: string) => string | null },
) {
  if (PANEL_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return true;
  }
  return /^\/issues\/?$/.test(pathname) && search.get("view") === "detail";
}
