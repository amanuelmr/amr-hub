import prisma from "../../prisma/client";
import { KIND_LABELS, PRIORITY_LABELS } from "../app/data/issues";
import { htmlToPlainText, minutesToHours, toCsv } from "./csvExportCore";
import { exportFieldValue, parseCustomFieldValues, sortFields } from "../app/data/customFields";
import { listAllCustomFields } from "./customFields";
import { listOrganizationMembers } from "./members";

const exportInclude = {
  project: { select: { id: true, key: true, name: true } },
  assignee: { include: { user: { select: { name: true, email: true } } } },
  creator: { select: { name: true, email: true } },
  labels: { include: { label: { select: { name: true } } } },
  cycle: { select: { name: true } },
  fixVersion: { select: { name: true } },
  components: { include: { component: { select: { name: true } } } },
  outgoingLinks: { select: { type: true, targetId: true } },
} as const;

export class ExportProjectError extends Error {
  constructor() {
    super("The selected project does not exist");
    this.name = "ExportProjectError";
  }
}

async function loadScope(organizationId: string, projectId: string | null) {
  if (!projectId) return { scope: "all-projects", projectIds: null as string[] | null };
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, key: true },
  });
  if (!project) throw new ExportProjectError();
  return { scope: project.key, projectIds: [project.id] };
}

async function loadIssues<T extends object>(
  organizationId: string,
  projectIds: string[] | null,
  extraInclude: T,
) {
  return prisma.issue.findMany({
    where: {
      organizationId,
      deletedAt: null,
      project: { deletedAt: null },
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
    include: { ...exportInclude, ...extraInclude },
    orderBy: [{ projectId: "asc" }, { sequence: "asc" }],
  });
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : "");
const day = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");

export const CSV_EXPORT_HEADERS = [
  "Issue key",
  "Issue id",
  "Summary",
  "Issue Type",
  "Status",
  "Priority",
  "Resolution",
  "Assignee",
  "Assignee email",
  "Reporter",
  "Reporter email",
  "Created",
  "Updated",
  "Resolved",
  "Start date",
  "Due date",
  "Labels",
  "Story points",
  "Sprint",
  "Fix version",
  "Components",
  "Parent",
  "Linked issues",
  "Flagged",
  "Original estimate (h)",
  "Remaining estimate (h)",
  "Time spent (h)",
  "Environment",
  "Project key",
  "Project name",
  "Description",
];

/** All standard fields for a project (or the whole workspace) as a CSV document. */
export async function exportIssuesCsv(organizationId: string, projectId: string | null) {
  const { scope, projectIds } = await loadScope(organizationId, projectId);
  const issues = await loadIssues(organizationId, projectIds, {});
  const { statusNames, typeNames } = await nameLookups(organizationId);
  // Jira-style "Custom field (Name)" columns for the fields in scope.
  const [allFields, members] = await Promise.all([
    listAllCustomFields(organizationId),
    listOrganizationMembers(organizationId),
  ]);
  const customFields = sortFields(
    allFields.filter(
      (field) => !projectIds || field.projectId === null || projectIds.includes(field.projectId),
    ),
  );

  const rows: unknown[][] = [
    [...CSV_EXPORT_HEADERS, ...customFields.map((field) => `Custom field (${field.name})`)],
  ];
  for (const issue of issues) {
    const customValues = parseCustomFieldValues(issue.customFields);
    rows.push([
      issue.id,
      issue.id,
      issue.title,
      typeNames.get(`${issue.projectId}:${issue.kind}`) ??
        (KIND_LABELS as Record<string, string>)[issue.kind] ??
        issue.kind,
      statusNames.get(`${issue.projectId}:${issue.status}`) ?? issue.status,
      (PRIORITY_LABELS as Record<string, string>)[issue.priority] ?? issue.priority,
      issue.resolution ?? "",
      issue.assignee?.user.name ?? "",
      issue.assignee?.user.email ?? "",
      issue.creator?.name ?? "",
      issue.creator?.email ?? "",
      iso(issue.createdAt),
      iso(issue.updatedAt),
      iso(issue.resolvedAt),
      day(issue.startDate),
      day(issue.dueDate),
      issue.labels.map((entry) => entry.label.name).join("; "),
      issue.estimate ?? "",
      issue.cycle?.name ?? "",
      issue.fixVersion?.name ?? "",
      issue.components.map((entry) => entry.component.name).join("; "),
      issue.parentId ?? "",
      issue.outgoingLinks.map((link) => `${link.type} ${link.targetId}`).join("; "),
      issue.flagged ? "Yes" : "",
      minutesToHours(issue.originalEstimateMinutes),
      minutesToHours(issue.remainingEstimateMinutes),
      minutesToHours(issue.timeSpentMinutes),
      issue.environment ?? "",
      issue.project.key,
      issue.project.name,
      htmlToPlainText(issue.description),
      ...customFields.map((field) =>
        field.type === "PARAGRAPH"
          ? htmlToPlainText(String(customValues[field.id] ?? ""))
          : exportFieldValue(field, customValues[field.id], members),
      ),
    ]);
  }
  return { scope, count: issues.length, body: toCsv(rows) };
}

async function nameLookups(organizationId: string) {
  const [statuses, types] = await Promise.all([
    prisma.workflowStatus.findMany({
      where: { project: { organizationId } },
      select: { projectId: true, key: true, name: true },
    }),
    prisma.issueTypeConfig.findMany({
      where: { project: { organizationId } },
      select: { projectId: true, key: true, name: true },
    }),
  ]);
  const byKey = (rows: Array<{ projectId: string; key: string; name: string }>) =>
    new Map(rows.map((row) => [`${row.projectId}:${row.key}`, row.name]));
  return { statusNames: byKey(statuses), typeNames: byKey(types) };
}

/** Projects with their issues, comments and worklogs as a JSON document. */
export async function exportIssuesJson(organizationId: string, projectId: string | null) {
  const { scope, projectIds } = await loadScope(organizationId, projectId);
  const [organization, projects, issues] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, key: true, slug: true },
    }),
    prisma.project.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(projectIds ? { id: { in: projectIds } } : {}),
      },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        boardType: true,
        createdAt: true,
        versions: { select: { id: true, name: true, status: true, releaseDate: true } },
        cycles: {
          select: { id: true, name: true, state: true, startDate: true, endDate: true, goal: true },
        },
        workflowStatuses: {
          orderBy: { position: "asc" },
          select: { key: true, name: true, category: true },
        },
      },
      orderBy: { key: "asc" },
    }),
    loadIssues(organizationId, projectIds, {
      comments: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, body: true, author: true, authorId: true, createdAt: true, editedAt: true },
      },
      worklogs: {
        orderBy: { startedAt: "asc" as const },
        select: {
          id: true,
          minutes: true,
          startedAt: true,
          comment: true,
          author: true,
          userId: true,
          createdAt: true,
        },
      },
    }),
  ]);

  const document = {
    exportedAt: new Date().toISOString(),
    format: "amr-hub-export/1",
    organization,
    projects: projects.map((project) => ({
      ...project,
      issues: issues
        .filter((issue) => issue.projectId === project.id)
        .map((issue) => ({
          key: issue.id,
          summary: issue.title,
          description: issue.description,
          type: issue.kind,
          status: issue.status,
          priority: issue.priority,
          resolution: issue.resolution,
          assignee: issue.assignee
            ? { name: issue.assignee.user.name, email: issue.assignee.user.email }
            : null,
          reporter: issue.creator,
          labels: issue.labels.map((entry) => entry.label.name),
          storyPoints: issue.estimate,
          sprint: issue.cycle?.name ?? null,
          fixVersion: issue.fixVersion?.name ?? null,
          components: issue.components.map((entry) => entry.component.name),
          parent: issue.parentId,
          links: issue.outgoingLinks,
          flagged: issue.flagged,
          environment: issue.environment,
          startDate: issue.startDate,
          dueDate: issue.dueDate,
          originalEstimateMinutes: issue.originalEstimateMinutes,
          remainingEstimateMinutes: issue.remainingEstimateMinutes,
          timeSpentMinutes: issue.timeSpentMinutes,
          customFields: safeJson(issue.customFields),
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          resolvedAt: issue.resolvedAt,
          comments: issue.comments,
          worklogs: issue.worklogs,
        })),
    })),
  };

  return { scope, count: issues.length, body: JSON.stringify(document, null, 2) };
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
