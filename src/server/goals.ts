import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  computeGoalProgress,
  descendantGoalIds,
  isGoalStatus,
  sortGoals,
  type GoalDetail,
  type GoalPerson,
  type GoalStatus,
  type GoalSummary,
  type GoalWorkItem,
} from "../app/components/goals/goalModel";
import type {
  CreateGoalInput,
  CreateGoalUpdateInput,
  UpdateGoalInput,
} from "./goalSchemas";

export class GoalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalInputError";
  }
}

type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";

const BUILT_IN_STATUS: Record<string, { name: string; category: StatusCategory }> = {
  BACKLOG: { name: "Backlog", category: "TODO" },
  OPEN: { name: "To do", category: "TODO" },
  IN_PROGRESS: { name: "In progress", category: "IN_PROGRESS" },
  IN_REVIEW: { name: "In review", category: "IN_PROGRESS" },
  DONE: { name: "Done", category: "DONE" },
};

function asCategory(value: string): StatusCategory {
  return value === "DONE" || value === "IN_PROGRESS" ? value : "TODO";
}

/** Resolves status name + category from each project's workflow (falls back to built-ins). */
async function statusResolver(projectIds: string[]) {
  const statuses = projectIds.length
    ? await prisma.workflowStatus.findMany({
        where: { projectId: { in: [...new Set(projectIds)] } },
        select: { projectId: true, key: true, name: true, category: true },
      })
    : [];
  const byKey = new Map(
    statuses.map((status) => [
      `${status.projectId}:${status.key}`,
      { name: status.name, category: asCategory(status.category) },
    ]),
  );
  return (projectId: string, key: string) =>
    byKey.get(`${projectId}:${key}`) ??
    BUILT_IN_STATUS[key] ?? { name: key, category: "TODO" as StatusCategory };
}

const activeIssueWhere = { deletedAt: null, archivedAt: null } satisfies Prisma.IssueWhereInput;

const goalSummaryInclude = {
  owner: { select: { id: true, name: true, email: true } },
  parent: { select: { id: true, name: true } },
  _count: { select: { children: true } },
  issues: {
    where: activeIssueWhere,
    select: { projectId: true, status: true },
  },
  updates: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true },
  },
} satisfies Prisma.GoalInclude;

type StoredGoalSummary = Prisma.GoalGetPayload<{ include: typeof goalSummaryInclude }>;

function toStatus(value: string): GoalStatus {
  return isGoalStatus(value) ? value : "PENDING";
}

function serializeGoal(
  goal: StoredGoalSummary,
  resolve: (projectId: string, key: string) => { category: StatusCategory },
): GoalSummary {
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description ?? "",
    status: toStatus(goal.status),
    targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null,
    owner: goal.owner
      ? { userId: goal.owner.id, name: goal.owner.name, email: goal.owner.email }
      : null,
    parent: goal.parent,
    subGoalCount: goal._count.children,
    progress: computeGoalProgress(
      goal.issues.map((issue) => resolve(issue.projectId, issue.status).category),
    ),
    lastUpdateAt: goal.updates[0]?.createdAt.toISOString() ?? null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

async function serializeGoals(goals: StoredGoalSummary[]) {
  const resolve = await statusResolver(
    goals.flatMap((goal) => goal.issues.map((issue) => issue.projectId)),
  );
  return goals.map((goal) => serializeGoal(goal, resolve));
}

export async function listGoalPeople(organizationId: string): Promise<GoalPerson[]> {
  const members = await prisma.member.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
  }));
}

export async function listGoals(organizationId: string) {
  const goals = await prisma.goal.findMany({
    where: { organizationId },
    include: goalSummaryInclude,
  });
  return sortGoals(await serializeGoals(goals));
}

export async function getGoal(
  id: string,
  organizationId: string,
): Promise<GoalDetail | null> {
  const goal = await prisma.goal.findFirst({
    where: { id, organizationId },
    include: {
      ...goalSummaryInclude,
      children: { include: goalSummaryInclude },
      updates: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      },
      issues: {
        where: activeIssueWhere,
        orderBy: [{ projectId: "asc" }, { sequence: "asc" }],
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          projectId: true,
          assignee: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!goal) return null;

  const resolve = await statusResolver([
    ...goal.issues.map((issue) => issue.projectId),
    ...goal.children.flatMap((child) => child.issues.map((issue) => issue.projectId)),
  ]);

  const issues: GoalWorkItem[] = goal.issues.map((issue) => {
    const meta = resolve(issue.projectId, issue.status);
    return {
      id: issue.id,
      title: issue.title,
      kind: issue.kind,
      status: issue.status,
      statusName: meta.name,
      statusCategory: meta.category,
      projectId: issue.projectId,
      assigneeName: issue.assignee?.user.name ?? null,
    };
  });

  const summary = serializeGoal(
    {
      ...goal,
      issues: goal.issues.map((issue) => ({
        projectId: issue.projectId,
        status: issue.status,
      })),
      updates: goal.updates.slice(0, 1),
    },
    resolve,
  );

  return {
    ...summary,
    children: sortGoals(goal.children.map((child) => serializeGoal(child, resolve))),
    issues,
    updates: goal.updates.map((update) => ({
      id: update.id,
      status: toStatus(update.status),
      body: update.body,
      author: update.author
        ? { userId: update.author.id, name: update.author.name }
        : null,
      createdAt: update.createdAt.toISOString(),
    })),
  };
}

async function validateOwner(ownerId: string | null | undefined, organizationId: string) {
  if (!ownerId) return;
  const member = await prisma.member.findFirst({
    where: { organizationId, userId: ownerId },
    select: { id: true },
  });
  if (!member) throw new GoalInputError("The goal owner must be a workspace member");
}

async function validateParent(
  parentId: string | null | undefined,
  goalId: string | null,
  organizationId: string,
) {
  if (!parentId) return;
  const goals = await prisma.goal.findMany({
    where: { organizationId },
    select: { id: true, parentId: true },
  });
  if (!goals.some((goal) => goal.id === parentId)) {
    throw new GoalInputError("The parent goal does not exist");
  }
  if (goalId && descendantGoalIds(goalId, goals).has(parentId)) {
    throw new GoalInputError(
      "A goal can't be a sub-goal of itself or of one of its sub-goals",
    );
  }
}

function toDate(value: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

export async function createGoal(
  input: CreateGoalInput,
  organizationId: string,
): Promise<GoalSummary> {
  await validateOwner(input.ownerId, organizationId);
  await validateParent(input.parentId, null, organizationId);
  const goal = await prisma.goal.create({
    data: {
      name: input.name,
      description: input.description || null,
      status: input.status,
      targetDate: toDate(input.targetDate),
      ownerId: input.ownerId,
      parentId: input.parentId,
      organizationId,
    },
    include: goalSummaryInclude,
  });
  const [summary] = await serializeGoals([goal]);
  return summary;
}

export async function updateGoal(
  id: string,
  input: UpdateGoalInput,
  organizationId: string,
) {
  const existing = await prisma.goal.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) return null;
  await validateOwner(input.ownerId, organizationId);
  await validateParent(input.parentId, id, organizationId);

  await prisma.goal.update({
    where: { id },
    data: {
      name: input.name,
      description:
        input.description === undefined ? undefined : input.description || null,
      status: input.status,
      targetDate:
        input.targetDate === undefined ? undefined : toDate(input.targetDate),
      ownerId: input.ownerId,
      parentId: input.parentId,
    },
  });
  return getGoal(id, organizationId);
}

export async function deleteGoal(id: string, organizationId: string) {
  const result = await prisma.goal.deleteMany({ where: { id, organizationId } });
  return result.count > 0;
}

/** Posting a status update also moves the goal to that status (Atlas behaviour). */
export async function addGoalUpdate(
  id: string,
  input: CreateGoalUpdateInput,
  authorId: string,
  organizationId: string,
) {
  const goal = await prisma.goal.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!goal) return null;
  await prisma.$transaction([
    prisma.goalUpdate.create({
      data: { goalId: id, status: input.status, body: input.body, authorId },
    }),
    prisma.goal.update({ where: { id }, data: { status: input.status } }),
  ]);
  return getGoal(id, organizationId);
}

export async function linkGoalIssues(
  id: string,
  issueIds: string[],
  organizationId: string,
) {
  const goal = await prisma.goal.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!goal) return null;
  const found = await prisma.issue.findMany({
    where: { id: { in: issueIds }, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== issueIds.length) {
    const known = new Set(found.map((issue) => issue.id));
    const missing = issueIds.filter((issueId) => !known.has(issueId));
    throw new GoalInputError(`Work item not found: ${missing.join(", ")}`);
  }
  await prisma.issue.updateMany({
    where: { id: { in: issueIds }, organizationId },
    data: { goalId: id },
  });
  return getGoal(id, organizationId);
}

export async function unlinkGoalIssue(
  id: string,
  issueId: string,
  organizationId: string,
) {
  const goal = await prisma.goal.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!goal) return null;
  await prisma.issue.updateMany({
    where: { id: issueId, organizationId, goalId: id },
    data: { goalId: null },
  });
  return getGoal(id, organizationId);
}
