import type { BoardColumnConfig, BoardType } from "./projects";
import {
  DEFAULT_STATUSES,
  DEFAULT_TYPES,
  type BuiltinKind,
  type BuiltinStatus,
  type WorkTypeConfig,
  type WorkflowStatusConfig,
} from "./workflow";

export const TEMPLATE_CATEGORIES = [
  "Software development",
  "Work management",
  "Service management",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * A starting point for a new project. Templates keep every built-in status
 * (boards and filters rely on them) but rename them, choose the board
 * columns and pick which work types the project starts with.
 */
export type ProjectTemplate = {
  key: string;
  name: string;
  category: TemplateCategory;
  description: string;
  boardType: BoardType;
  statusNames?: Partial<Record<BuiltinStatus, string>>;
  /** Work types to start with; subtasks are always kept. */
  types?: BuiltinKind[];
  typeNames?: Partial<Record<BuiltinKind, string>>;
  /** Statuses shown as board columns, left to right. */
  columns: BuiltinStatus[];
};

const FLOW: BuiltinStatus[] = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "DONE"];

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: "scrum",
    name: "Scrum",
    category: "Software development",
    description: "Plan work in sprints from a ranked backlog. For teams shipping on a regular cadence.",
    boardType: "SCRUM",
    columns: FLOW,
  },
  {
    key: "kanban",
    name: "Kanban",
    category: "Software development",
    description: "Keep work flowing across a board with column limits. For continuous delivery.",
    boardType: "KANBAN",
    columns: FLOW,
  },
  {
    key: "bug-tracking",
    name: "Bug tracking",
    category: "Software development",
    description: "Capture, fix and verify bugs, with a testing step before they close.",
    boardType: "KANBAN",
    statusNames: { IN_REVIEW: "In testing", DONE: "Fixed" },
    types: ["BUG", "TASK"],
    columns: FLOW,
  },
  {
    key: "project-management",
    name: "Project management",
    category: "Work management",
    description: "Break a project into epics and tasks and see what is waiting on others.",
    boardType: "KANBAN",
    statusNames: { IN_REVIEW: "Waiting" },
    types: ["EPIC", "TASK"],
    columns: FLOW,
  },
  {
    key: "task-tracking",
    name: "Task tracking",
    category: "Work management",
    description: "A simple to do, doing and done list for a team's everyday tasks.",
    boardType: "KANBAN",
    statusNames: { IN_PROGRESS: "Doing", IN_REVIEW: "Blocked" },
    types: ["TASK"],
    columns: ["OPEN", "IN_PROGRESS", "DONE"],
  },
  {
    key: "it-service",
    name: "IT service desk",
    category: "Service management",
    description: "Handle requests and incidents, including those waiting on the person who asked.",
    boardType: "KANBAN",
    statusNames: { OPEN: "Waiting for support", IN_REVIEW: "Waiting for customer", DONE: "Resolved" },
    types: ["TASK", "BUG"],
    typeNames: { TASK: "Service request", BUG: "Incident" },
    columns: FLOW,
  },
];

export function findProjectTemplate(key: string | null | undefined) {
  return PROJECT_TEMPLATES.find((template) => template.key === key) ?? null;
}

/** The statuses a template starts with: every built-in one, renamed. */
export function templateStatuses(template: ProjectTemplate | null): WorkflowStatusConfig[] {
  return DEFAULT_STATUSES.map((status) => ({
    ...status,
    name: template?.statusNames?.[status.key as BuiltinStatus] ?? status.name,
  }));
}

/** The work types a template starts with; subtasks are always included. */
export function templateTypes(template: ProjectTemplate | null): WorkTypeConfig[] {
  const keep = template?.types ? new Set<string>([...template.types, "SUBTASK"]) : null;
  return DEFAULT_TYPES.filter((type) => !keep || keep.has(type.key)).map((type, position) => ({
    ...type,
    name: template?.typeNames?.[type.key as BuiltinKind] ?? type.name,
    position,
  }));
}

/** One board column per template status, named like the status. */
export function templateColumns(template: ProjectTemplate): BoardColumnConfig[] {
  const names = templateStatuses(template);
  return template.columns.map((key) => ({
    id: key.toLowerCase().replace(/_/g, "-"),
    name: names.find((status) => status.key === key)?.name ?? key,
    statuses: [key],
    wipLimit: null,
  }));
}
