import type { Issue } from "../../data/issues";

/** Row fields the backlog can show; each viewer picks their own. */
export const BACKLOG_FIELDS = [
  { key: "type", label: "Work type" },
  { key: "key", label: "Work item key" },
  { key: "epic", label: "Epic" },
  { key: "subtasks", label: "Subtask progress" },
  { key: "dueDate", label: "Due date" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "estimate", label: "Story points" },
  { key: "assignee", label: "Assignee" },
] as const;

export type BacklogField = (typeof BACKLOG_FIELDS)[number]["key"];

export type BacklogView = {
  density: "default" | "compact";
  hidden: BacklogField[];
};

export const DEFAULT_BACKLOG_VIEW: BacklogView = { density: "default", hidden: ["dueDate"] };

const FIELD_KEYS = BACKLOG_FIELDS.map((field) => field.key) as string[];

export function parseBacklogView(raw: string | null): BacklogView {
  if (!raw) return DEFAULT_BACKLOG_VIEW;
  try {
    const value = JSON.parse(raw) as Partial<BacklogView>;
    return {
      density: value.density === "compact" ? "compact" : "default",
      hidden: Array.isArray(value.hidden)
        ? (value.hidden.filter((key) => FIELD_KEYS.includes(key)) as BacklogField[])
        : DEFAULT_BACKLOG_VIEW.hidden,
    };
  } catch {
    return DEFAULT_BACKLOG_VIEW;
  }
}

export type WorkloadRow = {
  assigneeId: string | null;
  name: string;
  items: number;
  points: number;
};

/**
 * Work items and story points per assignee in a sprint. With subtasks, their
 * own estimates count too (Jira's "Include subtasks in estimates").
 */
export function workloadByAssignee(issues: Issue[], subtasks: Issue[] = []): {
  rows: WorkloadRow[];
  total: { items: number; points: number };
} {
  const byPerson = new Map<string, WorkloadRow>();
  for (const issue of [...issues, ...subtasks]) {
    const key = issue.assignee?.id ?? "";
    const row = byPerson.get(key) ?? {
      assigneeId: issue.assignee?.id ?? null,
      name: issue.assignee?.name ?? "Unassigned",
      items: 0,
      points: 0,
    };
    row.items += 1;
    row.points += issue.estimate ?? 0;
    byPerson.set(key, row);
  }
  const rows = [...byPerson.values()].sort(
    (left, right) =>
      Number(left.assigneeId === null) - Number(right.assigneeId === null) ||
      left.name.localeCompare(right.name),
  );
  return {
    rows,
    total: {
      items: rows.reduce((sum, row) => sum + row.items, 0),
      points: rows.reduce((sum, row) => sum + row.points, 0),
    },
  };
}
