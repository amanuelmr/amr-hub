import type { IssueStatus } from "./issues";

export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
export type BoardType = "SCRUM" | "KANBAN";
export type BoardSwimlanes = "NONE" | "ASSIGNEE" | "EPIC" | "PRIORITY";

export type BoardColumnConfig = {
  id: string;
  name: string;
  statuses: IssueStatus[];
  /** Jira WIP limit: the column header turns red once exceeded. */
  wipLimit: number | null;
};

export type BoardConfig = {
  columns: BoardColumnConfig[];
  swimlanes: BoardSwimlanes;
  /** Kanban boards can hide the Backlog status from the board. */
  showBacklogColumn: boolean;
  estimation: "STORY_POINTS" | "TIME";
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  columns: [
    { id: "todo", name: "To do", statuses: ["OPEN"], wipLimit: null },
    {
      id: "in-progress",
      name: "In progress",
      statuses: ["IN_PROGRESS"],
      wipLimit: null,
    },
    { id: "in-review", name: "In review", statuses: ["IN_REVIEW"], wipLimit: null },
    { id: "done", name: "Done", statuses: ["DONE"], wipLimit: null },
  ],
  swimlanes: "NONE",
  showBacklogColumn: false,
  estimation: "STORY_POINTS",
};

export function parseBoardConfig(raw: string | null | undefined): BoardConfig {
  if (!raw) return DEFAULT_BOARD_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardConfig>;
    return {
      ...DEFAULT_BOARD_CONFIG,
      ...parsed,
      columns:
        Array.isArray(parsed.columns) && parsed.columns.length > 0
          ? parsed.columns
          : DEFAULT_BOARD_CONFIG.columns,
    };
  } catch {
    return DEFAULT_BOARD_CONFIG;
  }
}

export type Project = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  status: ProjectStatus;
  targetDate: string | null;
  createdAt: string;
  issueCount: number;
  doneIssueCount: number;
  activeCycleName: string | null;
  activeCycleId: string | null;
  boardType: BoardType;
  leadUserId: string | null;
  boardConfig: BoardConfig;
  leadName?: string | null;
  /** Whether the current user starred the project. */
  starred?: boolean;
};

export type NewProjectInput = {
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  targetDate: string | null;
  boardType?: BoardType;
};

export type ProjectUpdates = Partial<
  Pick<
    Project,
    | "name"
    | "description"
    | "color"
    | "status"
    | "targetDate"
    | "boardType"
    | "leadUserId"
    | "boardConfig"
  >
>;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

export const PROJECT_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
];
