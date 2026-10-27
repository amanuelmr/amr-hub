import type { Issue, IssueKind } from "../../../data/issues";
import { typeName, type WorkTypeConfig } from "../../../data/workflow";

type NoteTypes = readonly Pick<WorkTypeConfig, "key" | "name">[];

export type VersionStatus = "UNRELEASED" | "RELEASED" | "ARCHIVED";

export type ProjectVersion = {
  id: string;
  name: string;
  description: string | null;
  status: VersionStatus;
  startDate: string | null;
  releaseDate: string | null;
  releasedAt: string | null;
  /** The member responsible for getting the release out. */
  driverId?: string | null;
  driverName?: string | null;
  issueCount: number;
  doneCount: number;
  inProgressCount: number;
};

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  UNRELEASED: "Unreleased",
  RELEASED: "Released",
  ARCHIVED: "Archived",
};

const NOTE_ORDER: IssueKind[] = ["STORY", "BUG", "TASK", "EPIC", "SUBTASK"];
const NOTE_HEADINGS: Record<IssueKind, string> = {
  STORY: "Stories",
  BUG: "Bugs",
  TASK: "Tasks",
  EPIC: "Epics",
  SUBTASK: "Subtasks",
};

export function versionProgress(version: ProjectVersion) {
  const toDo = Math.max(
    0,
    version.issueCount - version.doneCount - version.inProgressCount,
  );
  const percent = (count: number) =>
    version.issueCount === 0 ? 0 : (count / version.issueCount) * 100;
  return {
    toDo,
    donePercent: percent(version.doneCount),
    inProgressPercent: percent(version.inProgressCount),
    toDoPercent: percent(toDo),
  };
}

/** Jira flags unreleased versions whose release date has passed. */
export function isVersionOverdue(
  version: Pick<ProjectVersion, "status" | "releaseDate">,
  now = new Date(),
) {
  if (version.status !== "UNRELEASED" || !version.releaseDate) return false;
  const endOfReleaseDay = new Date(version.releaseDate);
  endOfReleaseDay.setUTCHours(23, 59, 59, 999);
  return endOfReleaseDay.getTime() < now.getTime();
}

export type ReleaseNoteGroup = {
  kind: IssueKind;
  heading: string;
  issues: Pick<Issue, "id" | "title">[];
};

export function groupReleaseNotes(
  issues: Pick<Issue, "id" | "title" | "kind">[],
  types: NoteTypes = [],
): ReleaseNoteGroup[] {
  // Built-ins keep Jira's note order; custom types follow in config order.
  const order = [...NOTE_ORDER];
  for (const kind of [
    ...types.map((type) => type.key),
    ...issues.map((issue) => issue.kind),
  ]) {
    if (!order.includes(kind)) order.push(kind);
  }
  return order.map((kind) => ({
    kind,
    heading: NOTE_HEADINGS[kind] ?? typeName(kind, types),
    issues: issues
      .filter((issue) => issue.kind === kind)
      .map(({ id, title }) => ({ id, title })),
  })).filter((group) => group.issues.length > 0);
}

export function formatReleaseNotes(
  versionName: string,
  issues: Pick<Issue, "id" | "title" | "kind">[],
  types: NoteTypes = [],
) {
  const groups = groupReleaseNotes(issues, types);
  const lines = [`Release notes - ${versionName}`];
  for (const group of groups) {
    lines.push("", `## ${group.heading}`);
    for (const issue of group.issues) {
      lines.push(`- [${issue.id}] ${issue.title}`);
    }
  }
  if (groups.length === 0) lines.push("", "No issues in this version.");
  return lines.join("\n");
}
