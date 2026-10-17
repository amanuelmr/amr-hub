import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "../../prisma/client";
import type { Issue } from "../app/data/issues";
import { bearerToken, resolveApiToken, type ApiTokenPrincipal } from "./apiTokens";
import type { WorkspaceActor } from "./issues";
import { plainTextToHtml } from "./csvImportCore";

export type ApiContext = ApiTokenPrincipal & { actor: WorkspaceActor; baseUrl: string };

export function apiError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ errorMessages: [message], ...extra }, { status });
}

/**
 * Authenticates `Authorization: Bearer amr_...`. Pass `write: true` for
 * mutating endpoints so viewer tokens are rejected.
 */
export async function authenticateApiRequest(
  request: Request,
  options: { write?: boolean } = {},
): Promise<{ response: NextResponse } | { context: ApiContext }> {
  const raw = bearerToken(request.headers.get("authorization"));
  if (!raw) {
    return {
      response: NextResponse.json(
        { errorMessages: ["Send an API token as Authorization: Bearer amr_..."] },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="amr-hub"' } },
      ),
    };
  }
  const principal = await resolveApiToken(raw).catch((error) => {
    console.error("API token lookup failed", error);
    return null;
  });
  if (!principal) {
    return {
      response: NextResponse.json(
        { errorMessages: ["The API token is invalid, expired or revoked"] },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } },
      ),
    };
  }
  if (options.write && principal.role === "viewer") {
    return { response: apiError(403, "Viewer tokens have read-only access") };
  }
  return {
    context: {
      ...principal,
      baseUrl: new URL(request.url).origin,
      actor: {
        id: principal.user.id,
        name: principal.user.name,
        organizationId: principal.organization.id,
        organizationKey: principal.organization.key,
      },
    },
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiInputError("Request body must be valid JSON");
  }
}

export class ApiInputError extends Error {
  constructor(
    message: string,
    public errors: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

/* ------------------------------------------------------------------ */
/* Output shapes (Jira-like)                                           */
/* ------------------------------------------------------------------ */

export function serializeApiUser(
  member: { id: string; name: string; email?: string | null } | null,
) {
  if (!member) return null;
  return {
    accountId: member.id,
    displayName: member.name,
    emailAddress: member.email ?? null,
  };
}

type LookupProject = {
  id: string;
  key: string;
  name: string;
  statuses: Map<string, { name: string; category: string }>;
  types: Map<string, string>;
};
export type ProjectLookup = Map<string, LookupProject>;

const PRIORITY_NAMES: Record<string, string> = {
  NO_PRIORITY: "No priority",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

/** Projects of the org with their workflow status and issue type display names. */
export async function projectLookup(organizationId: string): Promise<ProjectLookup> {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: {
      id: true,
      key: true,
      name: true,
      workflowStatuses: { select: { key: true, name: true, category: true } },
      issueTypes: { select: { key: true, name: true } },
    },
  });
  return new Map(
    projects.map((project) => [
      project.id,
      {
        id: project.id,
        key: project.key,
        name: project.name,
        statuses: new Map(
          project.workflowStatuses.map((status) => [
            status.key,
            { name: status.name, category: status.category },
          ]),
        ),
        types: new Map(project.issueTypes.map((type) => [type.key, type.name])),
      },
    ]),
  );
}

export function serializeApiIssue(issue: Issue, projects: ProjectLookup, baseUrl: string) {
  const project = projects.get(issue.projectId);
  const status = project?.statuses.get(issue.status);
  return {
    id: issue.id,
    key: issue.id,
    self: `${baseUrl}/api/v1/issues/${encodeURIComponent(issue.id)}`,
    fields: {
      summary: issue.title,
      description: issue.description,
      status: {
        id: issue.status,
        name: status?.name ?? issue.status,
        statusCategory: status?.category ?? null,
      },
      issuetype: { id: issue.kind, name: project?.types.get(issue.kind) ?? issue.kind },
      priority: { id: issue.priority, name: PRIORITY_NAMES[issue.priority] ?? issue.priority },
      resolution: issue.resolution ? { name: issue.resolution } : null,
      assignee: serializeApiUser(issue.assignee),
      reporter: serializeApiUser(issue.creator),
      project: project
        ? { id: project.id, key: project.key, name: project.name }
        : { id: issue.projectId },
      labels: issue.labels.map((label) => label.name),
      storyPoints: issue.estimate,
      duedate: issue.dueDate,
      startdate: issue.startDate,
      parent: issue.parent ? { key: issue.parent.id, summary: issue.parent.title } : null,
      sprint: issue.cycleId,
      fixVersions: issue.fixVersion ? [issue.fixVersion] : [],
      components: issue.components,
      flagged: issue.flagged,
      environment: issue.environment,
      timetracking: {
        originalEstimateMinutes: issue.originalEstimateMinutes,
        remainingEstimateMinutes: issue.remainingEstimateMinutes,
        timeSpentMinutes: issue.timeSpentMinutes,
      },
      created: issue.createdAt,
      updated: issue.updatedAt,
      resolutiondate: issue.resolvedAt,
      ...(issue.comments
        ? {
            comment: {
              total: issue.comments.length,
              comments: issue.comments,
            },
          }
        : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Input mapping: Jira-like `fields` → internal create/update input   */
/* ------------------------------------------------------------------ */

const named = z.union([
  z.string(),
  z.object({ id: z.string().optional(), key: z.string().optional(), name: z.string().optional() }),
]);
const userRef = z
  .union([
    z.string(),
    z.object({
      accountId: z.string().optional(),
      emailAddress: z.string().optional(),
      name: z.string().optional(),
    }),
  ])
  .nullable();

export const apiIssueFieldsSchema = z
  .object({
    project: named.optional(),
    summary: z.string().optional(),
    description: z.string().nullable().optional(),
    issuetype: named.optional(),
    status: named.optional(),
    priority: named.optional(),
    assignee: userRef.optional(),
    labels: z.array(z.string()).optional(),
    storyPoints: z.number().nullable().optional(),
    duedate: z.string().nullable().optional(),
    startdate: z.string().nullable().optional(),
    parent: z.union([named, z.null()]).optional(),
    environment: z.string().nullable().optional(),
    flagged: z.boolean().optional(),
  })
  .passthrough();

export const apiIssueBodySchema = z.object({ fields: apiIssueFieldsSchema }).passthrough();

function refValue(value: z.infer<typeof named> | undefined) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return value.key ?? value.id ?? value.name;
}

function normalizeEnumValue(value: string | undefined) {
  return value?.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

async function resolveProjectId(organizationId: string, ref: string) {
  const project = await prisma.project.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ id: ref }, { key: ref.toUpperCase() }],
    },
    select: { id: true },
  });
  if (!project) throw new ApiInputError(`Project "${ref}" was not found`);
  return project.id;
}

async function resolveAssigneeId(
  organizationId: string,
  ref: z.infer<typeof userRef> | undefined,
) {
  if (ref === undefined) return undefined;
  if (ref === null) return null;
  const needle =
    typeof ref === "string" ? ref : ref.accountId ?? ref.emailAddress ?? ref.name ?? "";
  const members = await prisma.member.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true } } },
  });
  const lower = needle.toLowerCase();
  const member =
    members.find((candidate) => candidate.id === needle) ??
    members.find((candidate) => candidate.userId === needle) ??
    members.find((candidate) => candidate.user.email.toLowerCase() === lower) ??
    members.find((candidate) => candidate.user.name.toLowerCase() === lower);
  if (!member) throw new ApiInputError(`Assignee "${needle}" is not a member of this workspace`);
  return member.id;
}

async function resolveLabelIds(organizationId: string, names: string[] | undefined) {
  if (names === undefined) return undefined;
  const labels = await prisma.label.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  return names.map((name) => {
    const label = labels.find(
      (candidate) =>
        candidate.id === name || candidate.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!label) throw new ApiInputError(`Label "${name}" does not exist`);
    return label.id;
  });
}

function describe(description: string | null | undefined) {
  if (description === undefined) return undefined;
  if (description === null) return "";
  // Accept HTML as-is; wrap plain text in paragraphs.
  return /<\/?[a-z][\s\S]*>/i.test(description) ? description : plainTextToHtml(description);
}

function dropUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

/** Maps Jira-like create fields to the shape createIssueSchema validates. */
export async function mapCreateFields(
  organizationId: string,
  fields: z.infer<typeof apiIssueFieldsSchema>,
) {
  const projectRef = refValue(fields.project);
  if (!projectRef) throw new ApiInputError("fields.project is required");
  return dropUndefined({
    title: fields.summary,
    description: describe(fields.description) ?? "",
    projectId: await resolveProjectId(organizationId, projectRef),
    kind: normalizeEnumValue(refValue(fields.issuetype)) ?? "TASK",
    priority: normalizeEnumValue(refValue(fields.priority)) ?? "MEDIUM",
    status: normalizeEnumValue(refValue(fields.status)),
    assigneeId: (await resolveAssigneeId(organizationId, fields.assignee)) ?? null,
    labelIds: (await resolveLabelIds(organizationId, fields.labels)) ?? [],
    estimate: fields.storyPoints ?? null,
    dueDate: fields.duedate ?? null,
    startDate: fields.startdate,
    cycleId: null,
    parentId: fields.parent === null ? null : refValue(fields.parent)?.toUpperCase(),
    environment: fields.environment,
  });
}

/** Maps Jira-like update fields to the shape updateIssueSchema validates. */
export async function mapUpdateFields(
  organizationId: string,
  fields: z.infer<typeof apiIssueFieldsSchema>,
) {
  if (fields.project !== undefined) {
    throw new ApiInputError("Moving issues between projects is not supported here");
  }
  return dropUndefined({
    title: fields.summary,
    description: describe(fields.description),
    kind: normalizeEnumValue(refValue(fields.issuetype)),
    priority: normalizeEnumValue(refValue(fields.priority)),
    status: normalizeEnumValue(refValue(fields.status)),
    assigneeId: await resolveAssigneeId(organizationId, fields.assignee),
    labelIds: await resolveLabelIds(organizationId, fields.labels),
    estimate: fields.storyPoints,
    dueDate: fields.duedate,
    startDate: fields.startdate,
    parentId:
      fields.parent === null ? null : refValue(fields.parent ?? undefined)?.toUpperCase(),
    environment: fields.environment,
    flagged: fields.flagged,
  });
}

/** Resolves a requested status (key or display name) against the issue's project workflow. */
export async function resolveTransitionStatus(projectId: string, requested: string) {
  const statuses = await prisma.workflowStatus.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
    select: { key: true, name: true, category: true },
  });
  const lower = requested.trim().toLowerCase();
  const match = statuses.find(
    (status) => status.key.toLowerCase() === lower || status.name.toLowerCase() === lower,
  );
  if (match) return { key: match.key, statuses };
  if (statuses.length === 0) return { key: normalizeEnumValue(requested) ?? requested, statuses };
  return { key: null, statuses };
}

const API_FIELD_NAMES: Record<string, string> = {
  title: "summary",
  kind: "issuetype",
  estimate: "storyPoints",
  dueDate: "duedate",
  startDate: "startdate",
  assigneeId: "assignee",
  labelIds: "labels",
  parentId: "parent",
  projectId: "project",
};

export function validationResponse(error: z.ZodError) {
  const flat = error.flatten();
  const errors = Object.fromEntries(
    Object.entries(flat.fieldErrors).map(([field, messages]) => [
      API_FIELD_NAMES[field] ?? field,
      messages,
    ]),
  );
  return NextResponse.json(
    { errorMessages: flat.formErrors.length ? flat.formErrors : ["Validation failed"], errors },
    { status: 400 },
  );
}

/** Maps known server errors (named Error subclasses) to 400 JSON responses. */
export function handleApiError(error: unknown, fallback: string) {
  if (error instanceof ApiInputError) {
    return apiError(400, error.message, Object.keys(error.errors).length ? { errors: error.errors } : {});
  }
  if (
    error instanceof Error &&
    /^(Unknown\w+Error|InvalidParentError|InvalidTargetVersionError|WorkflowTransitionError|InvalidTransitionError)$/.test(
      error.name,
    )
  ) {
    return apiError(400, error.message);
  }
  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    return apiError(error.status, error.message);
  }
  console.error(fallback, error);
  return apiError(500, fallback);
}
