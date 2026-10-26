import type { IssueStatus } from "./issues";

export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
export type BoardType = "SCRUM" | "KANBAN";
export type BoardSwimlanes =
  | "NONE"
  | "ASSIGNEE"
  | "EPIC"
  | "PRIORITY"
  | "QUERY"
  | "SUBTASKS";

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

/** Appends a column holding only the new status (board "+ column"). */
export function addColumnForStatus(
  config: BoardConfig,
  key: string,
  name: string,
): BoardConfig {
  const taken = new Set(config.columns.map((column) => column.id));
  const base = `col-${key.split(":").at(-1) ?? "status"}`;
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return {
    ...config,
    columns: [
      ...config.columns.map((column) => ({
        ...column,
        statuses: column.statuses.filter((status) => status !== key),
      })),
      { id, name, statuses: [key], wipLimit: null },
    ],
  };
}

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
  /** Background of the project's pages; null for the plain theme. */
  background?: ProjectBackground | null;
  /** An outside page for the project (docs, repo, site). */
  url?: string | null;
  leadName?: string | null;
  /** Whether the current user starred the project. */
  starred?: boolean;
  /** Jira access level: who can see and edit the project. */
  accessLevel?: ProjectAccessLevel;
  /** Set when the project is archived (read-only, hidden from lists). */
  archivedAt?: string | null;
  /** The current user's permissions on this project. */
  permissions?: ProjectPermissions;
  /** The current user's explicit project role, if any. */
  myRole?: ProjectRole | null;
};

export const PROJECT_ACCESS_LEVELS = ["OPEN", "LIMITED", "PRIVATE"] as const;
export type ProjectAccessLevel = (typeof PROJECT_ACCESS_LEVELS)[number];
export const PROJECT_ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type ProjectPermissions = {
  canView: boolean;
  /** Comment on work items (any role, but not workspace viewers). */
  canComment: boolean;
  canEdit: boolean;
  canAdmin: boolean;
};

export const PROJECT_ACCESS_LABELS: Record<
  ProjectAccessLevel,
  { label: string; description: string }
> = {
  OPEN: {
    label: "Open",
    description:
      "Anyone in your workspace can view, create and edit work items in this project.",
  },
  LIMITED: {
    label: "Limited",
    description:
      "Anyone in your workspace can view and comment on work items. Only people added to the project can create and edit them.",
  },
  PRIVATE: {
    label: "Private",
    description:
      "Only people added to this project and workspace owners can find and access it.",
  },
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, { label: string; description: string }> = {
  ADMIN: {
    label: "Administrator",
    description: "Can manage project settings, people, workflows, automation and work.",
  },
  MEMBER: {
    label: "Member",
    description: "Can create, edit and comment on work items.",
  },
  VIEWER: {
    label: "Viewer",
    description: "Can search, view and comment on work items.",
  },
};

/** A person with explicit access to a project. */
export type ProjectMemberEntry = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: ProjectRole;
  workspaceRole: string;
  isLead: boolean;
  addedAt: string;
};

export type NewProjectInput = {
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  targetDate: string | null;
  boardType?: BoardType;
  accessLevel?: ProjectAccessLevel;
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
    | "background"
    | "url"
  >
>;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

/** Backgrounds a project's pages can use; each key maps to a CSS tint. */
export const PROJECT_BACKGROUNDS = [
  { key: "lime", label: "Lime" },
  { key: "cyan", label: "Cyan" },
  { key: "violet", label: "Violet" },
  { key: "amber", label: "Amber" },
  { key: "rose", label: "Rose" },
  { key: "sunrise", label: "Sunrise" },
  { key: "ocean", label: "Ocean" },
] as const;

export type ProjectBackground = (typeof PROJECT_BACKGROUNDS)[number]["key"];

export function isProjectBackground(value: unknown): value is ProjectBackground {
  return PROJECT_BACKGROUNDS.some((option) => option.key === value);
}

export const PROJECT_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
];

/** A board on a project; the project's own config is the default board. */
export type ProjectBoard = {
  id: string;
  name: string;
  /** JQL narrowing the project's issues shown on this board. */
  filterJql: string | null;
  isDefault: boolean;
  config: BoardConfig;
};

export const DEFAULT_BOARD_ID = "default";
