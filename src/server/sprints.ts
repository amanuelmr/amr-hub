import { dispatchWebhook } from "./webhooks";
import { runSprintAutomations } from "./automation";
import {
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
} from "../app/data/workflow";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { assertActorPermission } from "./projectAccess";
import type { Cycle, Issue } from "../app/data/issues";
import { parseBoardConfig } from "../app/data/projects";
import {
  DuplicateCycleNameError,
  UnknownProjectError,
  parseCycleDate,
  serializeCycle,
} from "./cycles";
import { issueInclude, serializeIssue, type WorkspaceActor } from "./issues";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SPRINT_DAYS = 14;
export const DEFAULT_SPRINT_CAPACITY = 20;

export class SprintNotFoundError extends Error {
  constructor() {
    super("Sprint not found");
    this.name = "SprintNotFoundError";
  }
}

export class SprintStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SprintStateError";
  }
}

type PointIssue = { kind: string; status: string; estimate: number | null };

/** Story points that count toward a sprint: epics and subtasks are excluded. */
export function sprintPoints(issues: PointIssue[], onlyDone = false) {
  return issues
    .filter((issue) => !isEpicLevel(issue.kind) && !isSubtaskLevel(issue.kind))
    .filter((issue) => !onlyDone || isDoneStatus(issue.status))
    .reduce((total, issue) => total + (issue.estimate ?? 0), 0);
}

/**
 * Jira-style auto name. Follows the latest sprint's trailing number
 * ("Release 7" -> "Release 8"); otherwise "<KEY> Sprint N". `existingNames`
 * is ordered oldest first; names already used are skipped.
 */
export function nextSprintName(projectKey: string, existingNames: string[]) {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const latest = existingNames.at(-1)?.trim() ?? "";
  const trailing = /^(.*?)(\d+)$/.exec(latest);
  if (trailing && trailing[1].trim()) {
    let number = Number(trailing[2]) + 1;
    while (taken.has(`${trailing[1]}${number}`.toLowerCase())) number += 1;
    const candidate = `${trailing[1]}${number}`;
    if (candidate.length <= 80) return candidate;
  }
  let number = 1;
  for (const name of existingNames) {
    const match = new RegExp(`^${projectKey} Sprint (\\d+)$`, "i").exec(name.trim());
    if (match) number = Math.max(number, Number(match[1]) + 1);
  }
  if (number === 1) number = existingNames.length + 1;
  while (taken.has(`${projectKey} sprint ${number}`.toLowerCase())) number += 1;
  return `${projectKey} Sprint ${number}`;
}

/**
 * Jira allows one active sprint per board unless "parallel sprints" is on.
 * Returns the error message, or null when the sprint may start.
 */
export function parallelSprintConflict(
  activeNames: string[],
  allowParallel: boolean,
) {
  if (allowParallel || activeNames.length === 0) return null;
  return `${activeNames[0]} is already active. Complete it before starting another sprint, or turn on parallel sprints in the board settings.`;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Default window for a new sprint: the day after the latest one ends. */
export function defaultSprintWindow(
  latestEnd: Date | null,
  now = new Date(),
  days = DEFAULT_SPRINT_DAYS,
) {
  const startBase =
    latestEnd && latestEnd.getTime() > now.getTime()
      ? new Date(latestEnd.getTime() + DAY_MS)
      : now;
  const start = toDateOnly(startBase);
  const end = toDateOnly(
    new Date(new Date(`${start}T00:00:00.000Z`).getTime() + (days - 1) * DAY_MS),
  );
  return { startDate: start, endDate: end };
}

export function sortSprints<T extends { state?: string; startDate: string }>(
  sprints: T[],
) {
  const order: Record<string, number> = { CLOSED: 0, ACTIVE: 1, FUTURE: 2 };
  return [...sprints].sort(
    (left, right) =>
      (order[left.state ?? "FUTURE"] ?? 2) -
        (order[right.state ?? "FUTURE"] ?? 2) ||
      left.startDate.localeCompare(right.startDate),
  );
}

function isDuplicateName(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findSprint(id: string, organizationId: string) {
  const sprint = await prisma.cycle.findFirst({
    where: { id, organizationId },
  });
  if (!sprint) throw new SprintNotFoundError();
  return sprint;
}

async function createSprintRecord(
  transaction: Prisma.TransactionClient,
  input: {
    projectId: string;
    projectKey: string;
    name?: string;
    goal?: string | null;
    startDate?: string;
    endDate?: string;
    capacity?: number;
  },
  organizationId: string,
) {
  const existing = await transaction.cycle.findMany({
    where: { projectId: input.projectId, organizationId },
    select: { name: true, endDate: true },
    orderBy: { endDate: "asc" },
  });
  const window = defaultSprintWindow(existing.at(-1)?.endDate ?? null);
  const startDate = input.startDate ?? window.startDate;
  let endDate = input.endDate ?? window.endDate;
  if (endDate <= startDate) {
    endDate = toDateOnly(
      new Date(
        new Date(`${startDate}T00:00:00.000Z`).getTime() +
          (DEFAULT_SPRINT_DAYS - 1) * DAY_MS,
      ),
    );
  }

  return transaction.cycle.create({
    data: {
      id: randomUUID(),
      name:
        input.name ??
        nextSprintName(
          input.projectKey,
          existing.map((sprint) => sprint.name),
        ),
      goal: input.goal ?? null,
      state: "FUTURE",
      startDate: parseCycleDate(startDate, false),
      endDate: parseCycleDate(endDate, true),
      capacity: input.capacity ?? DEFAULT_SPRINT_CAPACITY,
      projectId: input.projectId,
      organizationId,
    },
  });
}

export async function createSprint(
  input: {
    projectId: string;
    name?: string;
    goal?: string | null;
    startDate?: string;
    endDate?: string;
    capacity?: number;
  },
  actor: WorkspaceActor,
): Promise<Cycle> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId: actor.organizationId },
    select: { id: true, key: true },
  });
  if (!project) throw new UnknownProjectError();
  await assertActorPermission(actor, project.id, "edit");

  try {
    const sprint = await prisma.$transaction((transaction) =>
      createSprintRecord(
        transaction,
        { ...input, projectKey: project.key },
        actor.organizationId,
      ),
    );
    return serializeCycle(sprint);
  } catch (error) {
    if (isDuplicateName(error)) throw new DuplicateCycleNameError();
    throw error;
  }
}

export async function updateSprint(
  id: string,
  updates: {
    name?: string;
    goal?: string | null;
    startDate?: string;
    endDate?: string;
    capacity?: number;
  },
  actor: WorkspaceActor,
): Promise<Cycle> {
  const sprint = await findSprint(id, actor.organizationId);
  await assertActorPermission(actor, sprint.projectId, "edit");
  const start = updates.startDate
    ? parseCycleDate(updates.startDate, false)
    : sprint.startDate;
  const end = updates.endDate ? parseCycleDate(updates.endDate, true) : sprint.endDate;
  if (start.getTime() >= end.getTime()) {
    throw new SprintStateError("Start date must be before the end date");
  }

  try {
    const updated = await prisma.cycle.update({
      where: { id: sprint.id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.goal !== undefined ? { goal: updates.goal || null } : {}),
        ...(updates.capacity !== undefined ? { capacity: updates.capacity } : {}),
        startDate: start,
        endDate: end,
      },
    });
    return serializeCycle(updated);
  } catch (error) {
    if (isDuplicateName(error)) throw new DuplicateCycleNameError();
    throw error;
  }
}

async function startSprintUnhooked(
  id: string,
  input: { name?: string; goal?: string | null; startDate: string; endDate: string },
  actor: WorkspaceActor,
): Promise<Cycle> {
  await assertSprintEditable(id, actor);
  try {
    const sprint = await prisma.$transaction(async (transaction) => {
      const sprint = await transaction.cycle.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!sprint) throw new SprintNotFoundError();
      if (sprint.state !== "FUTURE") {
        throw new SprintStateError("Only future sprints can be started");
      }
      const [active, project] = await Promise.all([
        transaction.cycle.findMany({
          where: {
            projectId: sprint.projectId,
            organizationId: actor.organizationId,
            state: "ACTIVE",
          },
          select: { name: true },
          orderBy: { startedAt: "asc" },
        }),
        transaction.project.findFirst({
          where: { id: sprint.projectId, organizationId: actor.organizationId },
          select: { boardConfig: true },
        }),
      ]);
      const conflict = parallelSprintConflict(
        active.map((cycle) => cycle.name),
        parseBoardConfig(project?.boardConfig).parallelSprints,
      );
      if (conflict) throw new SprintStateError(conflict);
      const issues = await transaction.issue.findMany({
        where: { cycleId: sprint.id, organizationId: actor.organizationId, deletedAt: null },
        select: { kind: true, status: true, estimate: true },
      });

      return transaction.cycle.update({
        where: { id: sprint.id },
        data: {
          state: "ACTIVE",
          startedAt: new Date(),
          committedPoints: sprintPoints(issues),
          startDate: parseCycleDate(input.startDate, false),
          endDate: parseCycleDate(input.endDate, true),
          ...(input.name ? { name: input.name } : {}),
          ...(input.goal !== undefined ? { goal: input.goal || null } : {}),
        },
      });
    });
    return serializeCycle(sprint);
  } catch (error) {
    if (isDuplicateName(error)) throw new DuplicateCycleNameError();
    throw error;
  }
}

export type CompleteSprintInput = {
  destination: "BACKLOG" | "SPRINT" | "NEW_SPRINT";
  sprintId?: string;
};

export type SprintMutationResult = {
  sprint: Cycle;
  /** A sprint created to receive open issues, if any. */
  createdSprint: Cycle | null;
  issues: Issue[];
};

async function completeSprintUnhooked(
  id: string,
  input: CompleteSprintInput,
  actor: WorkspaceActor,
): Promise<SprintMutationResult> {
  await assertSprintEditable(id, actor);
  const result = await prisma.$transaction(async (transaction) => {
    const sprint = await transaction.cycle.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { project: { select: { key: true } } },
    });
    if (!sprint) throw new SprintNotFoundError();
    if (sprint.state !== "ACTIVE") {
      throw new SprintStateError("Only the active sprint can be completed");
    }

    let target: { id: string; name: string } | null = null;
    let createdSprint = null;
    if (input.destination === "SPRINT") {
      const candidate = await transaction.cycle.findFirst({
        where: {
          id: input.sprintId,
          projectId: sprint.projectId,
          organizationId: actor.organizationId,
          state: "FUTURE",
        },
        select: { id: true, name: true },
      });
      if (!candidate || candidate.id === sprint.id) {
        throw new SprintStateError("Open issues can only move to a future sprint");
      }
      target = candidate;
    } else if (input.destination === "NEW_SPRINT") {
      createdSprint = await createSprintRecord(
        transaction,
        { projectId: sprint.projectId, projectKey: sprint.project.key },
        actor.organizationId,
      );
      target = createdSprint;
    }

    const issues = await transaction.issue.findMany({
      where: { cycleId: sprint.id, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, kind: true, status: true, estimate: true },
    });
    const openIssues = issues.filter((issue) => !isDoneStatus(issue.status));

    for (const issue of openIssues) {
      await transaction.issue.update({
        where: { id: issue.id },
        data: {
          cycleId: target?.id ?? null,
          activity: {
            create: {
              type: "CYCLE_CHANGED",
              description: target
                ? `moved the issue from ${sprint.name} to ${target.name}`
                : `moved the issue from ${sprint.name} to the backlog`,
              actor: actor.name,
              user: { connect: { id: actor.id } },
            },
          },
        },
      });
    }

    const completed = await transaction.cycle.update({
      where: { id: sprint.id },
      data: {
        state: "CLOSED",
        completedAt: new Date(),
        completedPoints: sprintPoints(issues, true),
      },
    });

    return {
      completed,
      createdSprint,
      movedIds: openIssues.map((issue) => issue.id),
    };
  });

  const moved = await prisma.issue.findMany({
    where: { id: { in: result.movedIds }, organizationId: actor.organizationId },
    include: issueInclude,
  });

  return {
    sprint: serializeCycle(result.completed),
    createdSprint: result.createdSprint ? serializeCycle(result.createdSprint) : null,
    issues: moved.map(serializeIssue),
  };
}

/** Sprint changes need edit access to the sprint's project. */
async function assertSprintEditable(id: string, actor: WorkspaceActor) {
  const sprint = await prisma.cycle.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { projectId: true },
  });
  if (sprint) await assertActorPermission(actor, sprint.projectId, "edit");
}

export async function deleteSprint(id: string, actor: WorkspaceActor) {
  await assertSprintEditable(id, actor);
  const movedIds = await prisma.$transaction(async (transaction) => {
    const sprint = await transaction.cycle.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!sprint) throw new SprintNotFoundError();
    if (sprint.state === "ACTIVE") {
      throw new SprintStateError("Complete the active sprint before deleting it");
    }
    const issues = await transaction.issue.findMany({
      where: { cycleId: sprint.id, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true },
    });
    for (const issue of issues) {
      await transaction.issue.update({
        where: { id: issue.id },
        data: {
          cycleId: null,
          activity: {
            create: {
              type: "CYCLE_CHANGED",
              description: `moved the issue to the backlog when ${sprint.name} was deleted`,
              actor: actor.name,
              user: { connect: { id: actor.id } },
            },
          },
        },
      });
    }
    await transaction.cycle.delete({ where: { id: sprint.id } });
    return issues.map((issue) => issue.id);
  });

  const moved = await prisma.issue.findMany({
    where: { id: { in: movedIds }, organizationId: actor.organizationId },
    include: issueInclude,
  });
  return { issues: moved.map(serializeIssue) };
}

export async function startSprint(
  ...args: Parameters<typeof startSprintUnhooked>
) {
  const sprint = await startSprintUnhooked(...args);
  dispatchWebhook(args[2].organizationId, "sprint_started", { sprint });
  await runSprintAutomations({
    trigger: "SPRINT_STARTED",
    sprintId: sprint.id,
    projectId: sprint.projectId,
    actor: args[2],
  });
  return sprint;
}

export async function completeSprint(
  ...args: Parameters<typeof completeSprintUnhooked>
) {
  const result = await completeSprintUnhooked(...args);
  dispatchWebhook(args[2].organizationId, "sprint_closed", result);
  await runSprintAutomations({
    trigger: "SPRINT_COMPLETED",
    sprintId: result.sprint.id,
    projectId: result.sprint.projectId,
    actor: args[2],
    issueIds: result.issues.map((issue) => issue.id),
  });
  return result;
}
