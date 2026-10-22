import {
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
  statusCategory,
} from "../../data/workflow";
import {
  PRIORITY_LABELS,
  type Cycle,
  type Issue,
  type IssuePriority,
  type IssueRef,
  type IssueStatus,
  type WorkspaceMember,
} from "../../data/issues";
import type {
  BoardColumnConfig,
  BoardConfig,
  BoardSwimlanes,
  BoardType,
} from "../../data/projects";

const DAY_MS = 24 * 60 * 60 * 1000;

export function issueNumber(id: string) {
  const match = /-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

export function compareRank(
  left: Pick<Issue, "id" | "rank">,
  right: Pick<Issue, "id" | "rank">,
) {
  return left.rank - right.rank || issueNumber(left.id) - issueNumber(right.id);
}

export function initials(name: string | undefined | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Board/backlog rows: epics live in the epic panel, subtasks under parents. */
export function isPlanningIssue(issue: Pick<Issue, "kind">) {
  return !isEpicLevel(issue.kind) && !isSubtaskLevel(issue.kind);
}

export function epicOf(issue: Pick<Issue, "parent">): IssueRef | null {
  return issue.parent && isEpicLevel(issue.parent.kind) ? issue.parent : null;
}

const EPIC_COLORS = [
  "var(--console-violet)",
  "var(--console-cyan)",
  "var(--console-orange)",
  "var(--console-pink)",
  "var(--console-lime)",
];

export function epicColor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return EPIC_COLORS[Math.abs(hash) % EPIC_COLORS.length];
}

/** Applies Jira's kanban "show backlog column" rule to the configured columns. */
export function resolveBoardColumns(
  config: BoardConfig,
  boardType: BoardType,
): BoardColumnConfig[] {
  if (boardType !== "KANBAN") return config.columns;
  if (!config.showBacklogColumn) {
    return config.columns
      .map((column) => ({
        ...column,
        statuses: column.statuses.filter((status) => status !== "BACKLOG"),
      }))
      .filter((column) => column.statuses.length > 0);
  }
  const hasBacklog = config.columns.some((column) =>
    column.statuses.includes("BACKLOG"),
  );
  return hasBacklog
    ? config.columns
    : [
        { id: "backlog", name: "Backlog", statuses: ["BACKLOG"], wipLimit: null },
        ...config.columns,
      ];
}

/** Scrum boards fold unmapped to-do statuses into the first column. */
export function columnForStatus(
  columns: BoardColumnConfig[],
  status: IssueStatus,
  boardType: BoardType,
) {
  const mapped = columns.find((column) => column.statuses.includes(status));
  if (mapped) return mapped.id;
  if (boardType === "SCRUM" && statusCategory(status) === "TODO") {
    return columns[0]?.id ?? null;
  }
  return null;
}

export function daysRemaining(endDate: string, now = new Date()) {
  return Math.max(
    0,
    Math.ceil((new Date(endDate).getTime() - now.getTime()) / DAY_MS),
  );
}

export function isOverdue(issue: Pick<Issue, "dueDate" | "status">, now = new Date()) {
  if (!issue.dueDate || isDoneStatus(issue.status)) return false;
  return new Date(issue.dueDate).getTime() < now.getTime() - DAY_MS / 2;
}

export function isRecentlyUpdated(issue: Pick<Issue, "updatedAt">, now = new Date()) {
  return now.getTime() - new Date(issue.updatedAt).getTime() <= 7 * DAY_MS;
}

/**
 * Jira hides long-done work from the backlog, and done work from closed
 * sprints never comes back to it. `closedSprintIds` are the project's
 * closed sprints.
 */
export function isStaleDone(
  issue: Pick<Issue, "status" | "resolvedAt" | "updatedAt"> & {
    cycleId?: string | null;
  },
  now = new Date(),
  closedSprintIds: ReadonlySet<string> = new Set(),
) {
  if (!isDoneStatus(issue.status)) return false;
  if (issue.cycleId && closedSprintIds.has(issue.cycleId)) return true;
  const doneAt = new Date(issue.resolvedAt ?? issue.updatedAt).getTime();
  return now.getTime() - doneAt > 14 * DAY_MS;
}

export type IssueFilters = {
  query: string;
  onlyMine: boolean;
  recent: boolean;
  flagged: boolean;
  assigneeIds: string[];
  epicId: string | null;
  labelId: string | null;
  kinds: string[];
  /** Board quick filters (JQL), AND-combined; applied by the page. */
  quickFilterIds: string[];
  /** Backlog versions panel. */
  versionId: string | null;
  /** Board "Filter" panel: multi-select fields, OR within a field. */
  epicIds: string[];
  labelIds: string[];
  priorities: string[];
  statuses: string[];
  componentIds: string[];
  versionIds: string[];
  /** Advanced or JQL tab of the Filter panel; applied by the page. */
  jql: string;
};

export const EMPTY_FILTERS: IssueFilters = {
  query: "",
  onlyMine: false,
  recent: false,
  flagged: false,
  assigneeIds: [],
  epicId: null,
  labelId: null,
  kinds: [],
  quickFilterIds: [],
  versionId: null,
  epicIds: [],
  labelIds: [],
  priorities: [],
  statuses: [],
  componentIds: [],
  versionIds: [],
  jql: "",
};

export const UNASSIGNED = "__unassigned";
/** The "Everything else" lane when grouping by subtasks. */
export const NO_SUBTASKS_LANE = "__everything-else";

export function matchesFilters(
  issue: Issue,
  filters: IssueFilters,
  meId: string | null,
  now = new Date(),
) {
  const query = filters.query.trim().toLowerCase();
  if (
    query &&
    !issue.title.toLowerCase().includes(query) &&
    !issue.id.toLowerCase().includes(query)
  ) {
    return false;
  }
  if (filters.onlyMine && (!meId || issue.assignee?.id !== meId)) return false;
  if (filters.recent && !isRecentlyUpdated(issue, now)) return false;
  if (filters.flagged && !issue.flagged) return false;
  if (
    filters.assigneeIds.length > 0 &&
    !filters.assigneeIds.includes(issue.assignee?.id ?? UNASSIGNED)
  ) {
    return false;
  }
  if (filters.epicId && epicOf(issue)?.id !== filters.epicId) return false;
  if (
    filters.labelId &&
    !issue.labels.some((label) => label.id === filters.labelId)
  ) {
    return false;
  }
  if (filters.kinds.length > 0 && !filters.kinds.includes(issue.kind)) {
    return false;
  }
  if (filters.versionId && issue.fixVersion?.id !== filters.versionId) {
    return false;
  }
  const anyOf = (wanted: string[], value: string | null | undefined) =>
    wanted.length === 0 || (value != null && wanted.includes(value));
  if (!anyOf(filters.epicIds, epicOf(issue)?.id)) return false;
  if (!anyOf(filters.priorities, issue.priority)) return false;
  if (!anyOf(filters.statuses, issue.status)) return false;
  if (!anyOf(filters.versionIds, issue.fixVersion?.id)) return false;
  if (
    filters.labelIds.length > 0 &&
    !issue.labels.some((label) => filters.labelIds.includes(label.id))
  ) {
    return false;
  }
  if (
    filters.componentIds.length > 0 &&
    !issue.components.some((component) => filters.componentIds.includes(component.id))
  ) {
    return false;
  }
  return true;
}

export type Lane = { id: string; title: string; issues: Issue[] };

const PRIORITY_ORDER: IssuePriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO_PRIORITY",
];

export function groupLanes(
  issues: Issue[],
  mode: BoardSwimlanes,
  members: WorkspaceMember[],
): Lane[] {
  if (mode === "NONE") return [{ id: "all", title: "All issues", issues }];

  if (mode === "SUBTASKS") return groupSubtaskLanes(issues);

  if (mode === "PRIORITY") {
    return PRIORITY_ORDER.map((priority) => ({
      id: priority,
      title: PRIORITY_LABELS[priority],
      issues: issues.filter((issue) => issue.priority === priority),
    })).filter((lane) => lane.issues.length > 0);
  }

  const lanes = new Map<string, Lane>();
  const fallback: Lane =
    mode === "ASSIGNEE"
      ? { id: UNASSIGNED, title: "Unassigned", issues: [] }
      : { id: "__no-epic", title: "Issues without epic", issues: [] };

  for (const issue of issues) {
    const owner =
      mode === "ASSIGNEE"
        ? issue.assignee && {
            id: issue.assignee.id,
            title:
              members.find((member) => member.id === issue.assignee?.id)?.name ??
              issue.assignee.name,
          }
        : (() => {
            const epic = epicOf(issue);
            return epic && { id: epic.id, title: epic.title };
          })();
    if (!owner) {
      fallback.issues.push(issue);
      continue;
    }
    const lane = lanes.get(owner.id) ?? { ...owner, issues: [] };
    lane.issues.push(issue);
    lanes.set(owner.id, lane);
  }

  return [
    ...[...lanes.values()].sort((left, right) =>
      left.title.localeCompare(right.title),
    ),
    ...(fallback.issues.length > 0 ? [fallback] : []),
  ];
}

/**
 * Jira's "Subtasks" swimlanes: every parent with subtasks on the board gets
 * its own lane holding those subtasks (the parent is the lane header, not a
 * card); all other work sits in "Everything else".
 */
export function groupSubtaskLanes(issues: Issue[]): Lane[] {
  const byParent = new Map<string, Lane>();
  for (const issue of issues) {
    if (!isSubtaskLevel(issue.kind) || !issue.parentId) continue;
    const lane = byParent.get(issue.parentId) ?? {
      id: issue.parentId,
      title: issue.parent
        ? `${issue.parent.id} ${issue.parent.title}`
        : issue.parentId,
      issues: [],
    };
    lane.issues.push(issue);
    byParent.set(issue.parentId, lane);
  }

  const rest = issues.filter(
    (issue) =>
      !(isSubtaskLevel(issue.kind) && issue.parentId) && !byParent.has(issue.id),
  );
  // Parent lanes follow the parents' board order (issues arrive ranked).
  const order = issues.map((issue) => issue.id);
  const parentLanes = [...byParent.values()].sort(
    (left, right) => rankIndex(order, left.id) - rankIndex(order, right.id),
  );
  return [
    ...parentLanes,
    ...(rest.length > 0
      ? [{ id: NO_SUBTASKS_LANE, title: "Everything else", issues: rest }]
      : []),
  ];
}

function rankIndex(order: string[], id: string) {
  const index = order.indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export type PointBreakdown = {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
};

export function pointBreakdown(issues: Issue[]): PointBreakdown {
  const result = { total: 0, todo: 0, inProgress: 0, done: 0 };
  for (const issue of issues) {
    const points = issue.estimate ?? 0;
    result.total += points;
    const category = statusCategory(issue.status);
    if (category === "DONE") result.done += points;
    else if (category === "IN_PROGRESS") result.inProgress += points;
    else result.todo += points;
  }
  return result;
}

export type DropTarget = {
  afterId?: string;
  beforeId?: string;
  /** The container's id order after the drop. */
  order: string[];
};

/**
 * Where a dragged block lands inside a container's ordered ids. `overId`
 * is the item under the pointer, or null for the container itself (append).
 */
export function computeDropTarget({
  list,
  movedIds,
  activeId,
  overId,
}: {
  list: string[];
  movedIds: string[];
  activeId: string;
  overId: string | null;
}): DropTarget | null {
  const moved = new Set(movedIds);
  if (overId && moved.has(overId)) return null;
  const remaining = list.filter((id) => !moved.has(id));
  let insertAt = remaining.length;

  if (overId) {
    const overIndex = remaining.indexOf(overId);
    if (overIndex === -1) return null;
    const activeIndex = list.indexOf(activeId);
    const placeAfter = activeIndex !== -1 && activeIndex < list.indexOf(overId);
    insertAt = placeAfter ? overIndex + 1 : overIndex;
  }

  const order = [
    ...remaining.slice(0, insertAt),
    ...movedIds,
    ...remaining.slice(insertAt),
  ];
  if (order.join("|") === list.join("|")) return null;

  return {
    afterId: remaining[insertAt - 1],
    beforeId: remaining[insertAt],
    order,
  };
}

/** Local ranks for an optimistic reorder; the server returns the real ones. */
export function optimisticRanks(
  target: DropTarget,
  movedIds: string[],
  rankOf: (id: string) => number,
) {
  const lower = target.afterId ? rankOf(target.afterId) : null;
  const upper = target.beforeId ? rankOf(target.beforeId) : null;
  const ranks = new Map<string, number>();
  movedIds.forEach((id, index) => {
    const position = index + 1;
    let rank: number;
    if (lower !== null && upper !== null) {
      rank = lower + ((upper - lower) * position) / (movedIds.length + 1);
    } else if (lower !== null) {
      rank = lower + position;
    } else if (upper !== null) {
      rank = upper - (movedIds.length - index);
    } else {
      rank = position;
    }
    ranks.set(id, rank);
  });
  return ranks;
}

export function activeSprintOf(cycles: Cycle[], projectId: string) {
  return (
    cycles.find(
      (cycle) => cycle.projectId === projectId && cycle.state === "ACTIVE",
    ) ?? null
  );
}

export function futureSprintsOf(cycles: Cycle[], projectId: string) {
  return cycles
    .filter(
      (cycle) =>
        cycle.projectId === projectId && (cycle.state ?? "FUTURE") === "FUTURE",
    )
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

export function toDateInput(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export function addDaysToDateInput(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return toDateInput(new Date(date.getTime() + days * DAY_MS));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export const BOARD_CREATE_DESCRIPTION = "<p>Created from the board.</p>";
export const BACKLOG_CREATE_DESCRIPTION = "<p>Created from the backlog.</p>";
