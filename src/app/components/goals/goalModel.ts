/**
 * Goals (Jira/Atlas goals): shared types, labels and pure helpers used by
 * both the API layer (src/server/goals.ts) and the goals UI.
 */

export const GOAL_STATUSES = [
  "PENDING",
  "ON_TRACK",
  "AT_RISK",
  "OFF_TRACK",
  "PAUSED",
  "DONE",
  "CANCELLED",
] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  PENDING: "Pending",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  PAUSED: "Paused",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/** Closed goals sort after active ones and stop counting as "in flight". */
export const CLOSED_GOAL_STATUSES: GoalStatus[] = ["DONE", "CANCELLED"];

export function isGoalStatus(value: unknown): value is GoalStatus {
  return (
    typeof value === "string" &&
    (GOAL_STATUSES as readonly string[]).includes(value)
  );
}

export type GoalPerson = {
  userId: string;
  name: string;
  email: string;
};

export type GoalProgress = { done: number; total: number };

export type GoalSummary = {
  id: string;
  name: string;
  description: string;
  status: GoalStatus;
  targetDate: string | null;
  owner: GoalPerson | null;
  parent: { id: string; name: string } | null;
  subGoalCount: number;
  progress: GoalProgress;
  lastUpdateAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoalStatusUpdate = {
  id: string;
  status: GoalStatus;
  body: string;
  author: { userId: string; name: string } | null;
  createdAt: string;
};

export type GoalWorkItem = {
  id: string;
  title: string;
  kind: string;
  status: string;
  statusName: string;
  statusCategory: "TODO" | "IN_PROGRESS" | "DONE";
  projectId: string;
  assigneeName: string | null;
};

export type GoalDetail = GoalSummary & {
  updates: GoalStatusUpdate[];
  children: GoalSummary[];
  issues: GoalWorkItem[];
};

export type GoalListResponse = {
  goals: GoalSummary[];
  people: GoalPerson[];
};

export function goalProgressPercent(progress: GoalProgress) {
  if (progress.total === 0) return 0;
  return Math.round((progress.done / progress.total) * 100);
}

export function computeGoalProgress(
  categories: Array<"TODO" | "IN_PROGRESS" | "DONE">,
): GoalProgress {
  return {
    done: categories.filter((category) => category === "DONE").length,
    total: categories.length,
  };
}

/**
 * Ids of `goalId` and all its descendants. A goal may not be re-parented
 * under any of these (it would create a cycle).
 */
export function descendantGoalIds(
  goalId: string,
  goals: Array<{ id: string; parentId: string | null }>,
) {
  const childrenByParent = new Map<string, string[]>();
  for (const goal of goals) {
    if (!goal.parentId) continue;
    const list = childrenByParent.get(goal.parentId) ?? [];
    list.push(goal.id);
    childrenByParent.set(goal.parentId, list);
  }
  const result = new Set<string>([goalId]);
  const queue = [goalId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of childrenByParent.get(current) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      queue.push(child);
    }
  }
  return result;
}

/** Jira sorts goals: active first, then by target date (soonest first), then name. */
export function sortGoals<T extends Pick<GoalSummary, "status" | "targetDate" | "name">>(
  goals: T[],
) {
  return [...goals].sort((left, right) => {
    const leftClosed = CLOSED_GOAL_STATUSES.includes(left.status) ? 1 : 0;
    const rightClosed = CLOSED_GOAL_STATUSES.includes(right.status) ? 1 : 0;
    if (leftClosed !== rightClosed) return leftClosed - rightClosed;
    if (left.targetDate !== right.targetDate) {
      if (!left.targetDate) return 1;
      if (!right.targetDate) return -1;
      return left.targetDate.localeCompare(right.targetDate);
    }
    return left.name.localeCompare(right.name);
  });
}

export function isGoalOverdue(
  goal: Pick<GoalSummary, "status" | "targetDate">,
  today = new Date().toISOString().slice(0, 10),
) {
  return Boolean(
    goal.targetDate &&
      !CLOSED_GOAL_STATUSES.includes(goal.status) &&
      goal.targetDate.slice(0, 10) < today,
  );
}
