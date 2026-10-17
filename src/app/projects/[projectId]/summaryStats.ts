import {
  isDoneStatus,
  isEpicLevel,
  statusCategory,
} from "../../data/workflow";
import {
  type Issue,
  type IssueKind,
  type IssuePriority,
  type StatusCategory,
} from "../../data/issues";

const DAY = 24 * 60 * 60 * 1000;

export type ProjectSummary = {
  doneLast7: number;
  updatedLast7: number;
  createdLast7: number;
  dueNext7: number;
  byCategory: Record<StatusCategory, number>;
  byPriority: Record<IssuePriority, number>;
  byKind: Record<IssueKind, number>;
  workload: {
    id: string | null;
    name: string;
    count: number;
    percent: number;
  }[];
  epics: {
    id: string;
    kind: IssueKind;
    title: string;
    total: number;
    done: number;
  }[];
};

function within(value: string | null, from: number, to: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= from && time <= to;
}

export function computeProjectSummary(
  issues: Issue[],
  now = new Date(),
): ProjectSummary {
  const nowTime = now.getTime();
  const weekAgo = nowTime - 7 * DAY;
  const weekAhead = nowTime + 7 * DAY;

  const byCategory: Record<StatusCategory, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    DONE: 0,
  };
  const byPriority: Record<IssuePriority, number> = {
    URGENT: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NO_PRIORITY: 0,
  };
  const byKind: Record<IssueKind, number> = {
    EPIC: 0,
    STORY: 0,
    TASK: 0,
    BUG: 0,
    SUBTASK: 0,
  };
  const workloadMap = new Map<string | null, { name: string; count: number }>();
  let openCount = 0;

  for (const issue of issues) {
    byCategory[statusCategory(issue.status)] += 1;
    byPriority[issue.priority] += 1;
    byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
    if (!isDoneStatus(issue.status)) {
      openCount += 1;
      const key = issue.assignee?.id ?? null;
      const entry = workloadMap.get(key) ?? {
        name: issue.assignee?.name ?? "Unassigned",
        count: 0,
      };
      entry.count += 1;
      workloadMap.set(key, entry);
    }
  }

  const childrenByParent = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.parentId) continue;
    const siblings = childrenByParent.get(issue.parentId) ?? [];
    siblings.push(issue);
    childrenByParent.set(issue.parentId, siblings);
  }

  return {
    doneLast7: issues.filter(
      (issue) =>
        isDoneStatus(issue.status) &&
        within(issue.resolvedAt ?? issue.updatedAt, weekAgo, nowTime),
    ).length,
    updatedLast7: issues.filter((issue) =>
      within(issue.updatedAt, weekAgo, nowTime),
    ).length,
    createdLast7: issues.filter((issue) =>
      within(issue.createdAt, weekAgo, nowTime),
    ).length,
    dueNext7: issues.filter(
      (issue) =>
        !isDoneStatus(issue.status) &&
        within(issue.dueDate, nowTime - DAY, weekAhead),
    ).length,
    byCategory,
    byPriority,
    byKind,
    workload: [...workloadMap.entries()]
      .map(([id, entry]) => ({
        id,
        name: entry.name,
        count: entry.count,
        percent:
          openCount === 0 ? 0 : Math.round((entry.count / openCount) * 100),
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          Number(left.id === null) - Number(right.id === null),
      ),
    epics: issues
      .filter((issue) => isEpicLevel(issue.kind))
      .map((epic) => {
        const children = childrenByParent.get(epic.id) ?? [];
        return {
          id: epic.id,
          kind: epic.kind,
          title: epic.title,
          total: children.length || epic.childCount,
          done: children.length
            ? children.filter((child) => isDoneStatus(child.status)).length
            : epic.doneChildCount,
        };
      }),
  };
}

function startOfDay(time: number) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Jira's Summary "Recent activity" groups lines under Today / Yesterday / a date. */
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  now = new Date(),
): { label: string; items: T[] }[] {
  const today = startOfDay(now.getTime());
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const day = startOfDay(new Date(item.createdAt).getTime());
    const daysAgo = Math.round((today - day) / DAY);
    const label =
      daysAgo <= 0
        ? "Today"
        : daysAgo === 1
          ? "Yesterday"
          : new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "short",
              day: "numeric",
            }).format(new Date(day));
    const last = groups.at(-1);
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}
