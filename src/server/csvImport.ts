import { serializeCustomField } from "./customFields";
import type { CustomFieldDefinition } from "../app/data/customFields";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  ISSUE_KINDS,
  ISSUE_STATUSES,
  KIND_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type NewIssueInput,
} from "../app/data/issues";
import { recordAudit } from "./audit";
import {
  MAX_IMPORT_ROWS,
  orderRowsForImport,
  plainTextToHtml,
  validateImportRow,
  type ImportOption,
  type ImportValidationContext,
} from "./csvImportCore";
import { createIssue, ensureWorkspaceLabels, type WorkspaceActor } from "./issues";
import { listOrganizationMembers } from "./members";
import { sanitizeDescriptionHtml } from "./richText";

const cell = z.string().max(20000).default("");

export const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  issueId: cell,
  summary: cell,
  description: cell,
  kind: cell,
  status: cell,
  priority: cell,
  assignee: cell,
  labels: z.array(z.string().max(255)).max(50).default([]),
  storyPoints: cell,
  dueDate: cell,
  parentKey: cell,
  sprint: cell,
  fixVersion: cell,
  customFields: z
    .record(z.string().trim().min(1).max(120), z.string().max(20000))
    .refine((values) => Object.keys(values).length <= 50, "Too many custom fields")
    .optional(),
});

export const importRequestSchema = z
  .object({
    projectId: z.string().trim().min(1).max(120),
    rows: z
      .array(importRowSchema)
      .min(1, "The file has no rows to import")
      .max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} rows at a time`),
  })
  .strict();

export class ImportProjectError extends Error {
  constructor() {
    super("The selected project does not exist");
    this.name = "ImportProjectError";
  }
}

const PRIORITY_OPTIONS: ImportOption[] = Object.entries(PRIORITY_LABELS).map(
  ([key, name]) => ({ key, name }),
);

export type ImportProjectContext = {
  project: { id: string; key: string; name: string };
  statuses: ImportOption[];
  kinds: ImportOption[];
  priorities: ImportOption[];
  sprints: Array<{ id: string; name: string }>;
  versions: Array<{ id: string; name: string }>;
  customFields: CustomFieldDefinition[];
  defaults: { status: string; kind: string; priority: string };
};

/** Statuses, types, sprints and versions of one project, for mapping and validation. */
export async function loadProjectImportContext(
  organizationId: string,
  projectId: string,
): Promise<ImportProjectContext | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: {
      id: true,
      key: true,
      name: true,
      workflowStatuses: { orderBy: { position: "asc" }, select: { key: true, name: true } },
      issueTypes: { orderBy: { position: "asc" }, select: { key: true, name: true } },
      cycles: { orderBy: { startDate: "asc" }, select: { id: true, name: true } },
      versions: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
    },
  });
  if (!project) return null;

  const customFields = (
    await prisma.customField.findMany({
      where: { organizationId, OR: [{ projectId: null }, { projectId: project.id }] },
      orderBy: { position: "asc" },
    })
  ).map((field) => serializeCustomField(field));

  const statuses: ImportOption[] = project.workflowStatuses.length
    ? project.workflowStatuses
    : ISSUE_STATUSES.map((key) => ({ key, name: STATUS_LABELS[key] }));
  const kinds: ImportOption[] = project.issueTypes.length
    ? project.issueTypes
    : ISSUE_KINDS.map((key) => ({ key, name: KIND_LABELS[key] }));

  return {
    project: { id: project.id, key: project.key, name: project.name },
    statuses,
    kinds,
    priorities: PRIORITY_OPTIONS,
    sprints: project.cycles,
    versions: project.versions,
    customFields,
    defaults: {
      status: statuses.some((s) => s.key === "OPEN") ? "OPEN" : statuses[0]?.key ?? "OPEN",
      kind: kinds.some((k) => k.key === "TASK") ? "TASK" : kinds[0]?.key ?? "TASK",
      priority: "MEDIUM",
    },
  };
}

export async function loadImportProjects(organizationId: string) {
  return prisma.project.findMany({
    where: { organizationId, deletedAt: null, archivedAt: null },
    select: { id: true, key: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type ImportRowResult = {
  rowNumber: number;
  key: string | null;
  summary: string;
  errors: string[];
  warnings: string[];
};

export type ImportResult = {
  created: number;
  failed: number;
  results: ImportRowResult[];
};

const LABEL_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

async function resolveLabelIds(organizationId: string, names: string[]) {
  await ensureWorkspaceLabels(organizationId);
  const existing = await prisma.label.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((label) => [label.name.toLowerCase(), label.id]));
  for (const name of names) {
    const lookup = name.toLowerCase();
    if (byName.has(lookup)) continue;
    const label = await prisma.label.upsert({
      where: { organizationId_name: { organizationId, name } },
      create: {
        id: `${organizationId}:label-${randomBytes(6).toString("hex")}`,
        name,
        color: LABEL_COLORS[byName.size % LABEL_COLORS.length],
        organizationId,
      },
      update: {},
      select: { id: true },
    });
    byName.set(lookup, label.id);
  }
  return byName;
}

async function resolveVersionIds(projectId: string, names: string[]) {
  const byName = new Map<string, string>();
  const existing = await prisma.version.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  for (const version of existing) byName.set(version.name.toLowerCase(), version.id);
  for (const name of names) {
    if (byName.has(name.toLowerCase())) continue;
    const version = await prisma.version.upsert({
      where: { projectId_name: { projectId, name } },
      create: { name, projectId },
      update: {},
      select: { id: true },
    });
    byName.set(name.toLowerCase(), version.id);
  }
  return byName;
}

/**
 * Re-validates and imports rows into a project, in parent-first order, through
 * createIssue so activity, notifications and automations behave as usual.
 */
export async function runImport(
  input: z.infer<typeof importRequestSchema>,
  actor: WorkspaceActor,
): Promise<ImportResult> {
  const projectContext = await loadProjectImportContext(actor.organizationId, input.projectId);
  if (!projectContext) throw new ImportProjectError();

  const [members, existingIssues] = await Promise.all([
    listOrganizationMembers(actor.organizationId),
    prisma.issue.findMany({
      where: { organizationId: actor.organizationId },
      select: { id: true },
    }),
  ]);
  const existingKeys = new Set(existingIssues.map((issue) => issue.id.toUpperCase()));

  const context: ImportValidationContext = {
    statuses: projectContext.statuses,
    kinds: projectContext.kinds,
    priorities: projectContext.priorities,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email ?? "",
    })),
    sprints: projectContext.sprints,
    customFields: projectContext.customFields,
    existingKeys,
    defaults: projectContext.defaults,
  };

  const validated = input.rows.map((row) => validateImportRow(row, context));
  const ordered = orderRowsForImport(validated, existingKeys);
  const importable = ordered.filter((row) => row.errors.length === 0);

  const labelIds = await resolveLabelIds(
    actor.organizationId,
    [...new Set(importable.flatMap((row) => row.labels))],
  );
  const versionIds = await resolveVersionIds(
    projectContext.project.id,
    [...new Set(importable.flatMap((row) => (row.fixVersion ? [row.fixVersion] : [])))],
  );

  const createdByIssueId = new Map<string, string | null>();
  const resultsByRow = new Map<number, ImportRowResult>();

  for (const row of ordered) {
    const result: ImportRowResult = {
      rowNumber: row.rowNumber,
      key: null,
      summary: row.summary,
      errors: [...row.errors],
      warnings: [...row.warnings],
    };
    resultsByRow.set(row.rowNumber, result);

    let parentId: string | null = null;
    if (row.parentRef && result.errors.length === 0) {
      if (createdByIssueId.has(row.parentRef)) {
        parentId = createdByIssueId.get(row.parentRef) ?? null;
        if (!parentId) result.errors.push(`Parent "${row.parentRef}" could not be imported`);
      } else {
        parentId = row.parentRef.toUpperCase();
      }
    }

    if (result.errors.length === 0) {
      try {
        const issue = await createIssue(
          {
            title: row.summary,
            description: sanitizeDescriptionHtml(plainTextToHtml(row.description)),
            priority: row.priority,
            kind: row.kind,
            status: row.status,
            estimate: row.estimate,
            cycleId: row.cycleId,
            projectId: projectContext.project.id,
            assigneeId: row.assigneeId,
            dueDate: row.dueDate,
            labelIds: row.labels
              .map((name) => labelIds.get(name.toLowerCase()))
              .filter((id): id is string => Boolean(id)),
            parentId,
            fixVersionId: row.fixVersion
              ? versionIds.get(row.fixVersion.toLowerCase()) ?? null
              : null,
            // Only rows that carry custom values send them, so a required
            // field the file never mentions doesn't block the import.
            ...(Object.keys(row.customFields).length > 0
              ? { customFields: row.customFields }
              : {}),
          } as NewIssueInput,
          actor,
        );
        result.key = issue.id;
      } catch (error) {
        result.errors.push(
          error instanceof Error && error.name !== "Error" && error.message
            ? error.message
            : "The issue could not be created",
        );
        if (!(error instanceof Error) || error.name === "Error") {
          console.error("CSV import row failed", row.rowNumber, error);
        }
      }
    }

    if (row.issueId) createdByIssueId.set(row.issueId, result.key);
  }

  const results = input.rows
    .map((row) => resultsByRow.get(row.rowNumber))
    .filter((result): result is ImportRowResult => Boolean(result));
  const created = results.filter((result) => result.key).length;

  await recordAudit({
    organizationId: actor.organizationId,
    actor,
    action: "import.completed",
    targetType: "project",
    targetId: projectContext.project.id,
    details: {
      project: projectContext.project.key,
      rows: input.rows.length,
      created,
      failed: results.length - created,
    },
  });

  return { created, failed: results.length - created, results };
}
