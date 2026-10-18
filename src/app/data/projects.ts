import type { IssueStatus } from "./issues";

export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
export type BoardType = "SCRUM" | "KANBAN";
export type BoardSwimlanes = "NONE" | "ASSIGNEE" | "EPIC" | "PRIORITY" | "QUERY";

/** Fields a board card can show (Jira "Card layout"). */
export type CardField =
  | "epic"
  | "storyPoints"
  | "priority"
  | "assignee"
  | "dueDate"
  | "labels"
  | "components"
  | "fixVersion"
  | "subtasks";

/** Always-available card fields (shown by default, can be hidden). */
export const CARD_BASE_FIELDS: CardField[] = [
  "epic",
  "storyPoints",
  "priority",
  "assignee",
];
/** Jira's "extra fields": at most MAX_CARD_EXTRA_FIELDS of these at once. */
export const CARD_EXTRA_FIELDS: CardField[] = [
  "dueDate",
  "labels",
  "components",
  "fixVersion",
  "subtasks",
];
export const MAX_CARD_EXTRA_FIELDS = 3;

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  epic: "Epic",
  storyPoints: "Story points",
  priority: "Priority",
  assignee: "Assignee",
  dueDate: "Due date",
  labels: "Labels",
  components: "Components",
  fixVersion: "Fix version",
  subtasks: "Subtask progress",
};

export type CardColorStrategy =
  | "NONE"
  | "ISSUE_TYPE"
  | "PRIORITY"
  | "ASSIGNEE"
  | "QUERY";

/** A named JQL clause: quick filters, query swimlanes and query card colors. */
export type BoardQuery = {
  id: string;
  name: string;
  jql: string;
  /** Card color (#rrggbb) for query-based card colors. */
  color?: string;
};

export type BoardCardColors = {
  strategy: CardColorStrategy;
  /** Query strategy: first matching query colors the card. */
  queries: BoardQuery[];
};

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
  /** Card layout: optional fields shown on board cards. */
  cardFields: CardField[];
  cardColors: BoardCardColors;
  /** Named JQL quick filters shown in the board and backlog toolbars. */
  quickFilters: BoardQuery[];
  /** Lanes for QUERY swimlanes; first match wins, then "Everything else". */
  swimlaneQueries: BoardQuery[];
  /** Kanban: hide done issues older than this many days (null = never). */
  kanbanDoneDays: number | null;
  /** Scrum: allow more than one active sprint (Jira "parallel sprints"). */
  parallelSprints: boolean;
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
  cardFields: [...CARD_BASE_FIELDS, "labels", "subtasks", "dueDate"],
  cardColors: { strategy: "NONE", queries: [] },
  quickFilters: [],
  swimlaneQueries: [],
  kanbanDoneDays: 14,
  parallelSprints: false,
};

export function parseBoardConfig(raw: string | null | undefined): BoardConfig {
  if (!raw) return DEFAULT_BOARD_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardConfig>;
    const list = <T,>(value: unknown, fallback: T[]): T[] =>
      Array.isArray(value) ? (value as T[]) : fallback;
    const colors = parsed.cardColors;
    return {
      ...DEFAULT_BOARD_CONFIG,
      ...parsed,
      columns:
        Array.isArray(parsed.columns) && parsed.columns.length > 0
          ? parsed.columns
          : DEFAULT_BOARD_CONFIG.columns,
      cardFields: list(parsed.cardFields, DEFAULT_BOARD_CONFIG.cardFields),
      cardColors:
        colors && typeof colors === "object" && typeof colors.strategy === "string"
          ? { strategy: colors.strategy, queries: list(colors.queries, []) }
          : DEFAULT_BOARD_CONFIG.cardColors,
      quickFilters: list(parsed.quickFilters, []),
      swimlaneQueries: list(parsed.swimlaneQueries, []),
      kanbanDoneDays:
        parsed.kanbanDoneDays === null || typeof parsed.kanbanDoneDays === "number"
          ? parsed.kanbanDoneDays
          : DEFAULT_BOARD_CONFIG.kanbanDoneDays,
      parallelSprints: parsed.parallelSprints === true,
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
