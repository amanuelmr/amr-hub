import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  parseBoardConfig,
  type BoardConfig,
} from "../app/data/projects";
import {
  DEFAULT_STATUSES,
  DEFAULT_TYPES,
  STATUS_CATEGORIES,
  WORK_TYPE_ICONS,
  allowedTransitions,
  canTransition,
  isBuiltinKind,
  makeStatusKey,
  makeTypeKey,
  orderStatuses,
  statusCategory,
  statusName,
  type ProjectWorkflow,
  type StatusCategory,
  type TypeLevel,
  type WorkTypeConfig,
  type WorkflowStatusConfig,
  type WorkflowTransitionConfig,
} from "../app/data/workflow";

type Db = Prisma.TransactionClient | typeof prisma;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class WorkflowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export class InvalidStatusError extends Error {
  constructor(message = "That status is not part of this project's workflow") {
    super(message);
    this.name = "InvalidStatusError";
  }
}

export class TransitionNotAllowedError extends Error {
  constructor(from: string, to: string) {
    super(`The workflow does not allow moving from ${from} to ${to}`);
    this.name = "TransitionNotAllowedError";
  }
}

export class InvalidWorkTypeError extends Error {
  constructor(message = "That work type is not available in this project") {
    super(message);
    this.name = "InvalidWorkTypeError";
  }
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #2563eb");
const categorySchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
const nameSchema = z.string().trim().min(1).max(40);
const keySchema = z.string().trim().min(1).max(80);

export const createStatusSchema = z
  .object({
    name: nameSchema,
    category: categorySchema,
    color: colorSchema.nullable().optional(),
  })
  .strict();

export const updateStatusSchema = z
  .object({
    name: nameSchema.optional(),
    color: colorSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const deleteStatusSchema = z
  .object({ replacementKey: keySchema.optional() })
  .strict();

export const reorderSchema = z
  .object({ keys: z.array(keySchema).min(1).max(200) })
  .strict();

export const createTransitionSchema = z
  .object({
    name: z.string().trim().max(60).default(""),
    fromKey: keySchema.nullable(),
    toKey: keySchema,
  })
  .strict();

export const updateTransitionSchema = z
  .object({
    name: z.string().trim().max(60).optional(),
    fromKey: keySchema.nullable().optional(),
    toKey: keySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

const iconSchema = z.enum(WORK_TYPE_ICONS);
const levelSchema = z.union([z.literal(1), z.literal(0), z.literal(-1)]);

export const createTypeSchema = z
  .object({
    name: nameSchema,
    level: levelSchema,
    icon: iconSchema.default("square-check"),
    color: colorSchema.default("#39c6d0"),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const updateTypeSchema = z
  .object({
    name: nameSchema.optional(),
    icon: iconSchema.optional(),
    color: colorSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const deleteTypeSchema = z
  .object({ replacementKey: keySchema.optional() })
  .strict();

/* ------------------------------------------------------------------ */
/* Loading + seeding                                                   */
/* ------------------------------------------------------------------ */

export async function seedProjectWorkflow(db: Db, projectId: string) {
  await db.workflowStatus.createMany({
    data: DEFAULT_STATUSES.map((status) => ({
      key: status.key,
      name: status.name,
      category: status.category,
      color: status.color,
      position: status.position,
      projectId,
    })),
    skipDuplicates: true,
  });
  await db.issueTypeConfig.createMany({
    data: DEFAULT_TYPES.map((type) => ({
      key: type.key,
      name: type.name,
      level: type.level,
      icon: type.icon,
      color: type.color,
      position: type.position,
      projectId,
    })),
    skipDuplicates: true,
  });
}

type StoredStatus = {
  id: string;
  key: string;
  name: string;
  category: string;
  color: string | null;
  position: number;
};
type StoredTransition = {
  id: string;
  name: string;
  fromKey: string | null;
  toKey: string;
};
type StoredType = {
  id: string;
  key: string;
  name: string;
  level: number;
  icon: string;
  color: string;
  description: string | null;
  position: number;
};

function serializeStatus(status: StoredStatus): WorkflowStatusConfig {
  return {
    id: status.id,
    key: status.key,
    name: status.name,
    category: (STATUS_CATEGORIES as string[]).includes(status.category)
      ? (status.category as StatusCategory)
      : statusCategory(status.key),
    color: status.color,
    position: status.position,
  };
}

function serializeTransition(
  transition: StoredTransition,
): WorkflowTransitionConfig {
  return {
    id: transition.id,
    name: transition.name,
    fromKey: transition.fromKey,
    toKey: transition.toKey,
  };
}

function serializeType(type: StoredType): WorkTypeConfig {
  return {
    id: type.id,
    key: type.key,
    name: type.name,
    level: (type.level === 1 || type.level === -1 ? type.level : 0) as TypeLevel,
    icon: type.icon,
    color: type.color,
    description: type.description,
    position: type.position,
  };
}

function buildWorkflow(
  statuses: StoredStatus[],
  transitions: StoredTransition[],
  types: StoredType[],
): ProjectWorkflow {
  return {
    statuses: orderStatuses(statuses.map(serializeStatus)),
    transitions: transitions.map(serializeTransition),
    types: types
      .map(serializeType)
      .sort((a, b) => b.level - a.level || a.position - b.position),
  };
}

/** Loads (seeding when empty) a project's workflow. Returns null if missing. */
export async function getProjectWorkflow(
  projectId: string,
  organizationId: string,
): Promise<ProjectWorkflow | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) return null;
  return loadWorkflow(prisma, projectId);
}

export async function loadWorkflow(db: Db, projectId: string) {
  let [statuses, transitions, types] = await Promise.all([
    db.workflowStatus.findMany({ where: { projectId } }),
    db.workflowTransition.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    }),
    db.issueTypeConfig.findMany({ where: { projectId } }),
  ]);
  if (statuses.length === 0 || types.length === 0) {
    await seedProjectWorkflow(db, projectId);
    // Re-read everything, including the transitions the seed just created.
    [statuses, transitions, types] = await Promise.all([
      db.workflowStatus.findMany({ where: { projectId } }),
      db.workflowTransition.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      }),
      db.issueTypeConfig.findMany({ where: { projectId } }),
    ]);
  }
  return buildWorkflow(statuses, transitions, types);
}

/** Every project's workflow in the organization, keyed by project id. */
export async function listOrganizationWorkflows(organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const ids = projects.map((project) => project.id);
  const [statuses, transitions, types] = await Promise.all([
    prisma.workflowStatus.findMany({ where: { projectId: { in: ids } } }),
    prisma.workflowTransition.findMany({
      where: { projectId: { in: ids } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.issueTypeConfig.findMany({ where: { projectId: { in: ids } } }),
  ]);
  const result: Record<string, ProjectWorkflow> = {};
  for (const id of ids) {
    const own = statuses.filter((status) => status.projectId === id);
    const ownTypes = types.filter((type) => type.projectId === id);
    result[id] =
      own.length === 0 || ownTypes.length === 0
        ? await loadWorkflow(prisma, id)
        : buildWorkflow(
            own,
            transitions.filter((transition) => transition.projectId === id),
            ownTypes,
          );
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Issue validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validates an issue's target status against the project's workflow.
 * `fromKey` null means a create (any configured status is allowed).
 */
export async function validateIssueStatus(
  projectId: string,
  fromKey: string | null,
  toKey: string,
  db: Db = prisma,
) {
  const workflow = await loadWorkflow(db, projectId);
  if (!workflow.statuses.some((status) => status.key === toKey)) {
    throw new InvalidStatusError(
      `"${statusName(toKey)}" is not a status in this project's workflow`,
    );
  }
  if (fromKey !== null && !canTransition(workflow, fromKey, toKey)) {
    throw new TransitionNotAllowedError(
      statusName(fromKey, workflow.statuses),
      statusName(toKey, workflow.statuses),
    );
  }
  return workflow;
}

export async function validateIssueType(
  projectId: string,
  kind: string,
  db: Db = prisma,
) {
  const types = await db.issueTypeConfig.findMany({
    where: { projectId },
    select: { key: true },
  });
  if (types.length === 0) {
    if (isBuiltinKind(kind)) return;
    throw new InvalidWorkTypeError();
  }
  if (!types.some((type) => type.key === kind)) {
    throw new InvalidWorkTypeError();
  }
}

/** The default status for new issues: first TODO status (OPEN when present). */
export async function defaultCreateStatus(projectId: string, db: Db = prisma) {
  const workflow = await loadWorkflow(db, projectId);
  if (workflow.statuses.some((status) => status.key === "OPEN")) return "OPEN";
  return (
    workflow.statuses.find((status) => status.category === "TODO")?.key ??
    workflow.statuses[0]?.key ??
    "OPEN"
  );
}

/* ------------------------------------------------------------------ */
/* Status CRUD                                                         */
/* ------------------------------------------------------------------ */

async function requireProject(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, boardConfig: true },
  });
  return project;
}

/** Adds a status to the first board column that only holds the same category. */
export function addStatusToBoard(
  config: BoardConfig,
  key: string,
  category: StatusCategory,
): BoardConfig {
  if (config.columns.some((column) => column.statuses.includes(key))) {
    return config;
  }
  const columnIndex = config.columns.findIndex(
    (column) =>
      column.statuses.length > 0 &&
      column.statuses.every((status) => statusCategory(status) === category),
  );
  if (columnIndex === -1) return config;
  return {
    ...config,
    columns: config.columns.map((column, index) =>
      index === columnIndex
        ? { ...column, statuses: [...column.statuses, key] }
        : column,
    ),
  };
}

export function removeStatusFromBoard(
  config: BoardConfig,
  key: string,
  replacementKey: string | null,
): BoardConfig {
  const replacementMapped =
    replacementKey !== null &&
    config.columns.some((column) => column.statuses.includes(replacementKey));
  return {
    ...config,
    columns: config.columns.map((column) => {
      if (!column.statuses.includes(key)) return column;
      const statuses = column.statuses.filter((status) => status !== key);
      if (replacementKey && !replacementMapped) {
        statuses.push(replacementKey);
      }
      return { ...column, statuses };
    }),
  };
}

export async function createStatus(
  projectId: string,
  input: z.infer<typeof createStatusSchema>,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  if (
    workflow.statuses.some(
      (status) => status.name.toLowerCase() === input.name.toLowerCase(),
    )
  ) {
    throw new WorkflowConflictError("A status with this name already exists");
  }
  const key = makeStatusKey(
    input.category,
    input.name,
    workflow.statuses.map((status) => status.key),
  );
  const position =
    Math.max(
      -1,
      ...workflow.statuses
        .filter((status) => status.category === input.category)
        .map((status) => status.position),
    ) + 1;
  // Make room: shift later categories so ordering stays category-first.
  await prisma.$transaction(async (transaction) => {
    await transaction.workflowStatus.updateMany({
      where: { projectId, position: { gte: position } },
      data: { position: { increment: 1 } },
    });
    await transaction.workflowStatus.create({
      data: {
        key,
        name: input.name,
        category: input.category,
        color: input.color ?? null,
        position,
        projectId,
      },
    });
    const config = addStatusToBoard(
      parseBoardConfig(project.boardConfig),
      key,
      input.category,
    );
    await transaction.project.update({
      where: { id: projectId },
      data: { boardConfig: JSON.stringify(config) },
    });
  });
  return loadWorkflow(prisma, projectId);
}

export async function updateStatus(
  projectId: string,
  key: string,
  input: z.infer<typeof updateStatusSchema>,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  if (!workflow.statuses.some((status) => status.key === key)) return null;
  if (
    input.name &&
    workflow.statuses.some(
      (status) =>
        status.key !== key &&
        status.name.toLowerCase() === input.name!.toLowerCase(),
    )
  ) {
    throw new WorkflowConflictError("A status with this name already exists");
  }
  await prisma.workflowStatus.update({
    where: { projectId_key: { projectId, key } },
    data: input,
  });
  return loadWorkflow(prisma, projectId);
}

export async function deleteStatus(
  projectId: string,
  key: string,
  replacementKey: string | undefined,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  const target = workflow.statuses.find((status) => status.key === key);
  if (!target) return null;

  const sameCategory = workflow.statuses.filter(
    (status) => status.category === target.category,
  );
  if (target.category !== "IN_PROGRESS" && sameCategory.length <= 1) {
    throw new WorkflowError(
      `A workflow needs at least one ${
        target.category === "DONE" ? "done" : "to do"
      } status`,
    );
  }
  if (workflow.statuses.length <= 1) {
    throw new WorkflowError("A workflow needs at least one status");
  }

  const issueCount = await prisma.issue.count({
    where: { projectId, status: key },
  });
  if (replacementKey === key) {
    throw new WorkflowError("Choose a different status for existing work");
  }
  if (replacementKey && !workflow.statuses.some((s) => s.key === replacementKey)) {
    throw new WorkflowError("The replacement status is not in this workflow");
  }
  if (issueCount > 0 && !replacementKey) {
    throw new WorkflowError(
      `${issueCount} work item${issueCount === 1 ? "" : "s"} use this status; choose a replacement status`,
    );
  }

  await prisma.$transaction(async (transaction) => {
    if (replacementKey && issueCount > 0) {
      const leavingDone =
        statusCategory(key) === "DONE" && statusCategory(replacementKey) !== "DONE";
      const enteringDone =
        statusCategory(key) !== "DONE" && statusCategory(replacementKey) === "DONE";
      await transaction.issue.updateMany({
        where: { projectId, status: key },
        data: {
          status: replacementKey,
          ...(leavingDone ? { resolution: null, resolvedAt: null } : {}),
          ...(enteringDone ? { resolution: "DONE", resolvedAt: new Date() } : {}),
        },
      });
    }
    await transaction.workflowTransition.deleteMany({
      where: { projectId, OR: [{ fromKey: key }, { toKey: key }] },
    });
    await transaction.workflowStatus.delete({
      where: { projectId_key: { projectId, key } },
    });
    const config = removeStatusFromBoard(
      parseBoardConfig(project.boardConfig),
      key,
      replacementKey ?? null,
    );
    await transaction.project.update({
      where: { id: projectId },
      data: { boardConfig: JSON.stringify(config) },
    });
  });
  return loadWorkflow(prisma, projectId);
}

export async function reorderStatuses(
  projectId: string,
  keys: string[],
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  const known = new Set(workflow.statuses.map((status) => status.key));
  if (keys.length !== known.size || keys.some((key) => !known.has(key))) {
    throw new WorkflowError("Reorder must list every status exactly once");
  }
  // Category order wins (Jira keeps To do → In progress → Done).
  const categoryOf = new Map(
    workflow.statuses.map((status) => [status.key, status.category]),
  );
  const ordered = orderStatuses(
    keys.map((key, position) => ({
      key,
      position,
      category: categoryOf.get(key) ?? statusCategory(key),
    })),
  );
  await prisma.$transaction(
    ordered.map((entry, position) =>
      prisma.workflowStatus.update({
        where: { projectId_key: { projectId, key: entry.key } },
        data: { position },
      }),
    ),
  );
  return loadWorkflow(prisma, projectId);
}

/* ------------------------------------------------------------------ */
/* Transition CRUD                                                     */
/* ------------------------------------------------------------------ */

function assertTransitionKeys(
  workflow: ProjectWorkflow,
  fromKey: string | null,
  toKey: string,
) {
  const keys = new Set(workflow.statuses.map((status) => status.key));
  if (!keys.has(toKey)) throw new WorkflowError("Unknown target status");
  if (fromKey !== null && !keys.has(fromKey)) {
    throw new WorkflowError("Unknown source status");
  }
  if (fromKey === toKey) {
    throw new WorkflowError("A transition must change the status");
  }
}

export async function createTransition(
  projectId: string,
  input: z.infer<typeof createTransitionSchema>,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  assertTransitionKeys(workflow, input.fromKey, input.toKey);
  if (
    workflow.transitions.some(
      (transition) =>
        transition.fromKey === input.fromKey && transition.toKey === input.toKey,
    )
  ) {
    throw new WorkflowConflictError("This transition already exists");
  }
  await prisma.workflowTransition.create({
    data: {
      name: input.name || statusName(input.toKey, workflow.statuses),
      fromKey: input.fromKey,
      toKey: input.toKey,
      projectId,
    },
  });
  return loadWorkflow(prisma, projectId);
}

export async function updateTransition(
  projectId: string,
  transitionId: string,
  input: z.infer<typeof updateTransitionSchema>,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const existing = await prisma.workflowTransition.findFirst({
    where: { id: transitionId, projectId },
  });
  if (!existing) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  const fromKey = input.fromKey !== undefined ? input.fromKey : existing.fromKey;
  const toKey = input.toKey ?? existing.toKey;
  assertTransitionKeys(workflow, fromKey, toKey);
  if (
    workflow.transitions.some(
      (transition) =>
        transition.id !== transitionId &&
        transition.fromKey === fromKey &&
        transition.toKey === toKey,
    )
  ) {
    throw new WorkflowConflictError("This transition already exists");
  }
  await prisma.workflowTransition.update({
    where: { id: transitionId },
    data: {
      fromKey,
      toKey,
      ...(input.name !== undefined
        ? { name: input.name || statusName(toKey, workflow.statuses) }
        : {}),
    },
  });
  return loadWorkflow(prisma, projectId);
}

export async function deleteTransition(
  projectId: string,
  transitionId: string,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const result = await prisma.workflowTransition.deleteMany({
    where: { id: transitionId, projectId },
  });
  if (result.count === 0) return null;
  return loadWorkflow(prisma, projectId);
}

/* ------------------------------------------------------------------ */
/* Work type CRUD                                                      */
/* ------------------------------------------------------------------ */

export async function createType(
  projectId: string,
  input: z.infer<typeof createTypeSchema>,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  if (
    workflow.types.some(
      (type) => type.name.toLowerCase() === input.name.toLowerCase(),
    )
  ) {
    throw new WorkflowConflictError("A work type with this name already exists");
  }
  const key = makeTypeKey(
    input.level,
    input.name,
    workflow.types.map((type) => type.key),
  );
  await prisma.issueTypeConfig.create({
    data: {
      key,
      name: input.name,
      level: input.level,
      icon: input.icon,
      color: input.color,
      description: input.description ?? null,
      position: Math.max(-1, ...workflow.types.map((type) => type.position)) + 1,
      projectId,
    },
  });
  return loadWorkflow(prisma, projectId);
}

export async function updateType(
  projectId: string,
  key: string,
  input: z.infer<typeof updateTypeSchema>,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  if (!workflow.types.some((type) => type.key === key)) return null;
  if (
    input.name &&
    workflow.types.some(
      (type) =>
        type.key !== key && type.name.toLowerCase() === input.name!.toLowerCase(),
    )
  ) {
    throw new WorkflowConflictError("A work type with this name already exists");
  }
  await prisma.issueTypeConfig.update({
    where: { projectId_key: { projectId, key } },
    data: input,
  });
  return loadWorkflow(prisma, projectId);
}

export async function deleteType(
  projectId: string,
  key: string,
  replacementKey: string | undefined,
  organizationId: string,
) {
  const project = await requireProject(projectId, organizationId);
  if (!project) return null;
  const workflow = await loadWorkflow(prisma, projectId);
  const target = workflow.types.find((type) => type.key === key);
  if (!target) return null;
  if (
    target.level === 0 &&
    workflow.types.filter((type) => type.level === 0).length <= 1
  ) {
    throw new WorkflowError("A project needs at least one standard work type");
  }
  const issueCount = await prisma.issue.count({
    where: { projectId, kind: key },
  });
  if (replacementKey === key) {
    throw new WorkflowError("Choose a different work type for existing work");
  }
  const replacement = replacementKey
    ? workflow.types.find((type) => type.key === replacementKey)
    : undefined;
  if (replacementKey && !replacement) {
    throw new WorkflowError("The replacement work type is not in this project");
  }
  if (issueCount > 0 && !replacement) {
    throw new WorkflowError(
      `${issueCount} work item${issueCount === 1 ? "" : "s"} use this type; choose a replacement type`,
    );
  }
  if (replacement && replacement.level !== target.level && issueCount > 0) {
    throw new WorkflowError(
      "The replacement must sit at the same hierarchy level so parents stay valid",
    );
  }
  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { projectId, kind: key },
      data: { kind: replacementKey ?? "TASK" },
    }),
    prisma.issueTypeConfig.delete({
      where: { projectId_key: { projectId, key } },
    }),
  ]);
  return loadWorkflow(prisma, projectId);
}

export const workflowDomainErrors = [
  WorkflowError,
  InvalidStatusError,
  TransitionNotAllowedError,
  InvalidWorkTypeError,
];
export const workflowConflictErrors = [WorkflowConflictError];

export { allowedTransitions };

/** Prisma filter: issue is in a DONE-category status (built-in or custom). */
export function doneStatusWhere(): Prisma.IssueWhereInput {
  return { OR: [{ status: "DONE" }, { status: { startsWith: "DONE:" } }] };
}

/** Prisma filter: issue is not in a DONE-category status. */
export function notDoneStatusWhere(): Prisma.IssueWhereInput {
  return { NOT: [{ status: "DONE" }, { status: { startsWith: "DONE:" } }] };
}

/** Workflow validation failures surface as 400s from issue routes. */
export function isWorkflowValidationError(error: unknown): error is Error {
  return (
    error instanceof InvalidStatusError ||
    error instanceof TransitionNotAllowedError ||
    error instanceof InvalidWorkTypeError
  );
}

/** Prisma filter: issue kind is at the subtask level (built-in or custom). */
export function subtaskKindWhere(): Prisma.IssueWhereInput {
  return { OR: [{ kind: "SUBTASK" }, { kind: { startsWith: "L-1:" } }] };
}

/** Prisma filter: issue kind is at the epic level (built-in or custom). */
export function epicKindWhere(): Prisma.IssueWhereInput {
  return { OR: [{ kind: "EPIC" }, { kind: { startsWith: "L1:" } }] };
}
