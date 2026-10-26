import type {
  IssueEstimate,
  IssueKind,
  IssuePriority,
  IssueStatus,
} from "../data/issues";
import type { CustomFieldValue } from "../data/customFields";

/**
 * Optional fields of the Create dialog that each person can hide. Project,
 * type, summary, a subtask's parent and required custom fields always show.
 */
export const CREATE_FIELDS = [
  { key: "status", label: "Status" },
  { key: "description", label: "Description" },
  { key: "assignee", label: "Assignee" },
  { key: "labels", label: "Labels" },
  { key: "parent", label: "Parent" },
  { key: "sprint", label: "Sprint" },
  { key: "estimate", label: "Story point estimate" },
  { key: "custom", label: "Custom fields" },
  { key: "priority", label: "Priority" },
  { key: "fixVersion", label: "Fix versions" },
  { key: "components", label: "Components" },
  { key: "dates", label: "Start and due date" },
  { key: "originalEstimate", label: "Original estimate" },
  { key: "reporter", label: "Reporter" },
  { key: "environment", label: "Environment (bugs)" },
] as const;

export type CreateField = (typeof CREATE_FIELDS)[number]["key"];

const FIELD_KEYS = CREATE_FIELDS.map((field) => field.key) as string[];

/** Hidden optional fields; empty means every field shows. */
export function parseHiddenCreateFields(raw: string | null): CreateField[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? (value.filter((key) => typeof key === "string" && FIELD_KEYS.includes(key)) as CreateField[])
      : [];
  } catch {
    return [];
  }
}

/** Everything typed into the Create dialog, kept while it is minimized. */
export type CreateDraft = {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  kind: IssueKind;
  projectId: string | null;
  parentId: string;
  assigneeId: string;
  dueDate: string;
  startDate: string;
  cycleId: string | null;
  estimate: IssueEstimate | null;
  originalEstimate: string;
  environment: string;
  labelIds: string[];
  fixVersionId: string;
  componentIds: string[];
  customValues: Record<string, CustomFieldValue | null>;
};

/** The label of a minimized draft: its summary, or a placeholder. */
export function draftLabel(draft: Pick<CreateDraft, "title"> | null) {
  const title = draft?.title.trim();
  return title ? title : "Untitled work item";
}
