import {
  evaluateJql,
  parseJql,
  type JqlContext,
  type JqlNode,
} from "../../data/jql";
import type { Cycle, Issue, IssuePriority } from "../../data/issues";
import { isDoneStatus, statusCategory } from "../../data/workflow";
import type { BoardCardColors, BoardQuery } from "../../data/projects";
import type { Lane } from "./boardModel";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CompiledQuery = BoardQuery & {
  node: JqlNode | null;
  error: string | null;
};

/** Parses each saved board query once; invalid ones keep their error. */
export function compileQueries(
  queries: BoardQuery[],
  now = new Date(),
): CompiledQuery[] {
  return queries.map((query) => {
    const parsed = parseJql(query.jql, now);
    return parsed.ok
      ? { ...query, node: parsed.query.where, error: null }
      : { ...query, node: null, error: parsed.error.message };
  });
}

/** Invalid queries never match (Jira shows them as broken instead). */
export function queryMatches(
  query: CompiledQuery,
  issue: Issue,
  ctx: JqlContext,
) {
  if (query.error) return false;
  return evaluateJql(query.node, issue, ctx);
}

/** Active quick filters are AND-combined, like Jira. */
export function matchesQuickFilters(
  issue: Issue,
  activeIds: readonly string[],
  compiled: CompiledQuery[],
  ctx: JqlContext,
) {
  if (activeIds.length === 0) return true;
  return compiled
    .filter((query) => activeIds.includes(query.id))
    .every((query) => queryMatches(query, issue, ctx));
}

export const PRIORITY_COLORS: Record<IssuePriority, string> = {
  URGENT: "#e5484d",
  HIGH: "#f76b15",
  MEDIUM: "#ffb224",
  LOW: "#3e63dd",
  NO_PRIORITY: "#8b8d98",
};

const ASSIGNEE_COLORS = [
  "#3e63dd",
  "#30a46c",
  "#e5484d",
  "#8e4ec6",
  "#f76b15",
  "#12a594",
  "#d6409f",
  "#ad7f58",
];

export function hashColor(value: string, palette = ASSIGNEE_COLORS) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** The card's left color bar for the board's card color strategy. */
export function cardColorFor(
  issue: Issue,
  colors: BoardCardColors,
  {
    ctx,
    compiled,
    typeColor,
  }: {
    ctx: JqlContext;
    compiled: CompiledQuery[];
    typeColor: (kind: string) => string | null;
  },
): string | null {
  switch (colors.strategy) {
    case "ISSUE_TYPE":
      return typeColor(issue.kind);
    case "PRIORITY":
      return PRIORITY_COLORS[issue.priority] ?? null;
    case "ASSIGNEE":
      return issue.assignee ? hashColor(issue.assignee.id) : null;
    case "QUERY":
      return (
        compiled.find((query) => queryMatches(query, issue, ctx))?.color ?? null
      );
    default:
      return null;
  }
}

export const EVERYTHING_ELSE = "__everything-else";

/** Query swimlanes: each issue lands in the first lane whose JQL matches. */
export function groupQueryLanes(
  issues: Issue[],
  compiled: CompiledQuery[],
  ctx: JqlContext,
): Lane[] {
  const lanes: Lane[] = compiled.map((query) => ({
    id: query.id,
    title: query.name,
    issues: [],
  }));
  const rest: Lane = { id: EVERYTHING_ELSE, title: "Everything else", issues: [] };
  for (const issue of issues) {
    const index = compiled.findIndex((query) => queryMatches(query, issue, ctx));
    (index === -1 ? rest : lanes[index]).issues.push(issue);
  }
  return [...lanes, rest];
}

/**
 * Kanban: done work leaves the board once released, or after `days` days
 * (Jira's "hide completed issues older than").
 */
export function isHiddenKanbanDone(
  issue: Pick<Issue, "status" | "resolvedAt" | "updatedAt" | "fixVersion">,
  days: number | null,
  now = new Date(),
) {
  if (!isDoneStatus(issue.status)) return false;
  if (issue.fixVersion?.status === "RELEASED") return true;
  if (days === null) return false;
  const doneAt = new Date(issue.resolvedAt ?? issue.updatedAt).getTime();
  return now.getTime() - doneAt > days * DAY_MS;
}

/** Active sprints of a project, oldest first. */
export function activeSprintsOf(cycles: Cycle[], projectId: string) {
  return cycles
    .filter((cycle) => cycle.projectId === projectId && cycle.state === "ACTIVE")
    .sort(
      (left, right) =>
        (left.startedAt ?? left.startDate).localeCompare(
          right.startedAt ?? right.startDate,
        ) || left.startDate.localeCompare(right.startDate),
    );
}

/**
 * Which active sprints the board shows. An empty or stale choice falls back
 * to all active sprints.
 */
export function visibleSprintIds(active: Cycle[], chosen: readonly string[]) {
  const valid = chosen.filter((id) => active.some((sprint) => sprint.id === id));
  return valid.length > 0 ? valid : active.map((sprint) => sprint.id);
}

/** Average completed points of the last `count` closed sprints. */
export function averageVelocity(cycles: Cycle[], projectId: string, count = 3) {
  const closed = cycles
    .filter(
      (cycle) =>
        cycle.projectId === projectId &&
        cycle.state === "CLOSED" &&
        cycle.completedPoints !== null &&
        cycle.completedPoints !== undefined,
    )
    .sort((left, right) =>
      (right.completedAt ?? right.endDate).localeCompare(
        left.completedAt ?? left.endDate,
      ),
    )
    .slice(0, count);
  if (closed.length === 0) return null;
  const total = closed.reduce(
    (sum, cycle) => sum + (cycle.completedPoints ?? 0),
    0,
  );
  return { average: Math.round((total / closed.length) * 10) / 10, sprints: closed.length };
}

export type AttentionReason = "due" | "stuck" | "blocked" | "flagged";

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  due: "Due",
  stuck: "Stuck",
  blocked: "Blocked",
  flagged: "Flagged",
};

/** Days an in-progress item may sit in one status before it counts as stuck. */
export const STUCK_AFTER_DAYS = 7;

/**
 * Why an unfinished work item needs attention: due within two days (or
 * overdue), stuck in an in-progress status, blocked by unfinished work, or
 * flagged. Done work never needs attention.
 */
export function attentionReasons(
  issue: Issue,
  { now, blockedIds }: { now: Date; blockedIds: ReadonlySet<string> },
): AttentionReason[] {
  if (isDoneStatus(issue.status)) return [];
  const reasons: AttentionReason[] = [];
  if (issue.dueDate && Date.parse(issue.dueDate) <= now.getTime() + 2 * DAY_MS) {
    reasons.push("due");
  }
  if (
    statusCategory(issue.status) === "IN_PROGRESS" &&
    issue.statusChangedAt &&
    now.getTime() - Date.parse(issue.statusChangedAt) >= STUCK_AFTER_DAYS * DAY_MS
  ) {
    reasons.push("stuck");
  }
  if (blockedIds.has(issue.id)) reasons.push("blocked");
  if (issue.flagged) reasons.push("flagged");
  return reasons;
}

/** Average whole days the current work items have spent in each status. */
export function timeInStatus(issues: Issue[], now: Date) {
  const byStatus = new Map<string, { total: number; count: number }>();
  for (const issue of issues) {
    if (!issue.statusChangedAt) continue;
    const days = Math.max(0, (now.getTime() - Date.parse(issue.statusChangedAt)) / DAY_MS);
    const entry = byStatus.get(issue.status) ?? { total: 0, count: 0 };
    entry.total += days;
    entry.count += 1;
    byStatus.set(issue.status, entry);
  }
  return [...byStatus.entries()].map(([status, { total, count }]) => ({
    status,
    count,
    averageDays: Math.round((total / count) * 10) / 10,
  }));
}
