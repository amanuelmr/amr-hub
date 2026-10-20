import type { CommentReactionSummary } from "./reactions";
import type {
  BuiltinKind,
  BuiltinStatus,
  StatusCategory,
} from "./workflow";
import { STATUS_CATEGORY } from "./workflow";
import type { CustomFieldValue } from "./customFields";

export { STATUS_CATEGORY };
export type { BuiltinKind, BuiltinStatus, StatusCategory };

/**
 * A workflow status key: a built-in (BACKLOG, OPEN, IN_PROGRESS, IN_REVIEW,
 * DONE) or a custom "<CATEGORY>:<slug>" key. Use the helpers in
 * ./workflow (statusCategory, isDoneStatus, ...) instead of comparing keys.
 */
export type IssueStatus = string;
export type IssuePriority =
  | "NO_PRIORITY"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "URGENT";
/** A work type key: built-in (EPIC, STORY, TASK, BUG, SUBTASK) or "L<level>:<slug>". */
export type IssueKind = string;
export type IssueEstimate = 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21;
export type IssueResolution =
  | "DONE"
  | "WONT_DO"
  | "DUPLICATE"
  | "CANNOT_REPRODUCE";
export type IssueLinkType =
  | "BLOCKS"
  | "IS_BLOCKED_BY"
  | "RELATES_TO"
  | "DUPLICATES"
  | "IS_DUPLICATED_BY"
  | "CLONES"
  | "IS_CLONED_BY";

export const ISSUE_STATUSES: BuiltinStatus[] = [
  "BACKLOG",
  "OPEN",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];
export const ISSUE_KINDS: BuiltinKind[] = [
  "EPIC",
  "STORY",
  "TASK",
  "BUG",
  "SUBTASK",
];
export const ISSUE_ESTIMATES: IssueEstimate[] = [0, 1, 2, 3, 5, 8, 13, 21];


/** A compact reference to another issue (parent, child, link target). */
export type IssueRef = {
  id: string;
  /** Present on server-serialized refs; lets badges use the right workflow. */
  projectId?: string;
  title: string;
  status: IssueStatus;
  kind: IssueKind;
  priority: IssuePriority;
  assignee: WorkspaceMember | null;
  estimate: IssueEstimate | null;
};

export type IssueLinkSummary = {
  id: string;
  type: IssueLinkType;
  issue: IssueRef;
};

export type IssueComponentRef = { id: string; name: string };
export type IssueVersionRef = { id: string; name: string; status: string };

export type IssueComment = {
  id: string;
  body: string;
  author: string;
  authorId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  reactions?: CommentReactionSummary[];
};

export type IssueActivityType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "TYPE_CHANGED"
  | "CONTENT_UPDATED"
  | "COMMENT_ADDED"
  | "DUE_DATE_CHANGED"
  | "LABELS_CHANGED"
  | "CYCLE_CHANGED"
  | "ESTIMATE_CHANGED"
  | "PARENT_CHANGED"
  | "VERSION_CHANGED"
  | "COMPONENTS_CHANGED"
  | "FLAG_CHANGED"
  | "START_DATE_CHANGED"
  | "TIME_TRACKING_CHANGED"
  | "WORK_LOGGED"
  | "LINK_ADDED"
  | "LINK_REMOVED"
  | "ATTACHMENT_ADDED"
  | "ATTACHMENT_REMOVED"
  | "RESOLUTION_CHANGED"
  | "PROJECT_MOVED"
  | "AUTOMATION"
  | "TEAM_CHANGED"
  | "GOAL_CHANGED"
  | "CUSTOM_FIELD_CHANGED"
  | "ARCHIVE_CHANGED";

export type IssueActivity = {
  id: string;
  type: IssueActivityType;
  description: string;
  actor: string;
  createdAt: string;
};

export type WorkspaceLabel = {
  id: string;
  name: string;
  color: string;
};

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  /** The member's user id, for profile links (/people/[userId]). */
  userId?: string;
};

export type SavedViewStatus = "ALL" | "ACTIVE" | IssueStatus;
export type SavedViewPriority = "ALL" | IssuePriority;
export type SavedViewSort = "NEWEST" | "OLDEST";

export type SavedView = {
  id: string;
  name: string;
  owner: string;
  query: string;
  status: SavedViewStatus;
  priority: SavedViewPriority;
  assignee: string;
  sort: SavedViewSort;
  labelId: string | null;
  jql?: string | null;
  isSystem: boolean;
};

export type SavedViewInput = Omit<SavedView, "id" | "owner" | "isSystem">;

export type Cycle = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  capacity: number;
  projectId: string;
  goal?: string | null;
  state?: SprintState;
  startedAt?: string | null;
  completedAt?: string | null;
  committedPoints?: number | null;
  completedPoints?: number | null;
};

export type SprintState = "FUTURE" | "ACTIVE" | "CLOSED";

export type NewCycleInput = {
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  capacity: number;
};

export type Issue = {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  kind: IssueKind;
  assignee: WorkspaceMember | null;
  creator: WorkspaceMember | null;
  dueDate: string | null;
  estimate: IssueEstimate | null;
  projectId: string;
  cycleId: string | null;
  labels: WorkspaceLabel[];
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  parent: IssueRef | null;
  fixVersion: IssueVersionRef | null;
  team: { id: string; name: string } | null;
  goal: { id: string; name: string; status: string } | null;
  components: IssueComponentRef[];
  startDate: string | null;
  rank: number;
  flagged: boolean;
  /** Set when the work item is archived (hidden from boards and search). */
  archivedAt?: string | null;
  resolution: IssueResolution | null;
  resolvedAt: string | null;
  /** When the issue entered its current status (board "days in column"). */
  statusChangedAt?: string;
  environment: string | null;
  originalEstimateMinutes: number | null;
  remainingEstimateMinutes: number | null;
  timeSpentMinutes: number;
  childCount: number;
  doneChildCount: number;
  /** Custom field values keyed by field id (empty values are omitted). */
  customFields: Record<string, CustomFieldValue>;
  /** Detail-only collections (present on single-issue reads). */
  children?: IssueRef[];
  links?: IssueLinkSummary[];
  watcherIds?: string[];
  voterIds?: string[];
  comments?: IssueComment[];
  activity?: IssueActivity[];
};

export type NewIssueInput = Pick<
  Issue,
  | "title"
  | "description"
  | "priority"
  | "kind"
  | "estimate"
  | "cycleId"
  | "projectId"
> & {
  assigneeId: string | null;
  dueDate: string | null;
  labelIds: string[];
  status?: IssueStatus;
  parentId?: string | null;
  fixVersionId?: string | null;
  componentIds?: string[];
  teamId?: string | null;
  goalId?: string | null;
  startDate?: string | null;
  originalEstimateMinutes?: number | null;
  environment?: string | null;
  /** Keyed by field id (or name); when present, required fields are enforced. */
  customFields?: Record<string, CustomFieldValue | null>;
};

export type IssueUpdates = Partial<
  Pick<
    Issue,
    | "title"
    | "description"
    | "status"
    | "priority"
    | "kind"
    | "dueDate"
    | "estimate"
    | "cycleId"
    | "parentId"
    | "startDate"
    | "rank"
    | "flagged"
    | "resolution"
    | "environment"
    | "originalEstimateMinutes"
    | "remainingEstimateMinutes"
  >
> & {
  assigneeId?: string | null;
  labelIds?: string[];
  fixVersionId?: string | null;
  componentIds?: string[];
  teamId?: string | null;
  goalId?: string | null;
  /** Partial: only the given keys change; null clears a value. */
  customFields?: Record<string, CustomFieldValue | null>;
};

export const WORKSPACE_LABELS: WorkspaceLabel[] = [
  { id: "label-customer", name: "Customer impact", color: "#dc2626" },
  { id: "label-frontend", name: "Frontend", color: "#2563eb" },
  { id: "label-backend", name: "Backend", color: "#059669" },
  { id: "label-reliability", name: "Reliability", color: "#d97706" },
  { id: "label-design", name: "Design", color: "#7c3aed" },
];

export const STATUS_LABELS: Record<BuiltinStatus, string> = {
  BACKLOG: "Backlog",
  OPEN: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  NO_PRIORITY: "No priority",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const KIND_LABELS: Record<BuiltinKind, string> = {
  EPIC: "Epic",
  STORY: "Story",
  TASK: "Task",
  BUG: "Bug",
  SUBTASK: "Subtask",
};

export const RESOLUTION_LABELS: Record<IssueResolution, string> = {
  DONE: "Done",
  WONT_DO: "Won't do",
  DUPLICATE: "Duplicate",
  CANNOT_REPRODUCE: "Cannot reproduce",
};

export const LINK_TYPE_LABELS: Record<IssueLinkType, string> = {
  BLOCKS: "blocks",
  IS_BLOCKED_BY: "is blocked by",
  RELATES_TO: "relates to",
  DUPLICATES: "duplicates",
  IS_DUPLICATED_BY: "is duplicated by",
  CLONES: "clones",
  IS_CLONED_BY: "is cloned by",
};

/** Formats minutes Jira-style: 90 -> "1h 30m", 2400 -> "1w" (5d x 8h). */
export function formatDuration(minutes: number | null | undefined) {
  if (!minutes) return "0m";
  const units: [string, number][] = [
    ["w", 5 * 8 * 60],
    ["d", 8 * 60],
    ["h", 60],
    ["m", 1],
  ];
  let remaining = Math.round(minutes);
  const parts: string[] = [];
  for (const [unit, size] of units) {
    if (remaining >= size) {
      parts.push(`${Math.floor(remaining / size)}${unit}`);
      remaining %= size;
    }
  }
  return parts.join(" ") || "0m";
}

/** Parses Jira duration strings like "1w 2d 3h 30m" or "45m" into minutes. */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 60;
  const pattern = /(\d+(?:\.\d+)?)\s*([wdhm])/g;
  const sizes: Record<string, number> = { w: 2400, d: 480, h: 60, m: 1 };
  let total = 0;
  let consumed = "";
  for (const match of trimmed.matchAll(pattern)) {
    total += Number(match[1]) * sizes[match[2]];
    consumed += match[0];
  }
  if (consumed.replace(/\s/g, "") !== trimmed.replace(/\s/g, "")) return null;
  return Math.round(total);
}
