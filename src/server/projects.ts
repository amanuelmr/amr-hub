import { randomUUID } from "node:crypto";
import { recordAudit } from "./audit";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import type { WorkspaceActor } from "./issues";
import { doneStatusWhere, seedProjectWorkflow } from "./workflows";

import {
  parseBoardConfig,
  type BoardType,
  type NewProjectInput,
  type Project,
  type ProjectStatus,
  type ProjectUpdates,
} from "../app/data/projects";

export type { NewProjectInput, Project, ProjectStatus, ProjectUpdates };

function parseTargetDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

type StoredProject = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  status: string;
  targetDate: Date | null;
  createdAt: Date;
  boardType: string;
  leadUserId: string | null;
  boardConfig: string | null;
};

async function serializeProject(
  project: StoredProject,
  userId?: string,
): Promise<Project> {
  const [issueCount, doneIssueCount, activeCycle, lead, star] =
    await Promise.all([
      prisma.issue.count({ where: { projectId: project.id } }),
      prisma.issue.count({
        where: { projectId: project.id, AND: [doneStatusWhere()] },
      }),
      prisma.cycle.findFirst({
        where: { projectId: project.id, state: "ACTIVE" },
        orderBy: { startDate: "asc" },
        select: { id: true, name: true },
      }),
      project.leadUserId
        ? prisma.user.findUnique({
            where: { id: project.leadUserId },
            select: { name: true },
          })
        : null,
      userId
        ? prisma.projectStar.findUnique({
            where: { projectId_userId: { projectId: project.id, userId } },
            select: { userId: true },
          })
        : null,
    ]);

  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    color: project.color,
    status: project.status as ProjectStatus,
    targetDate: project.targetDate?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    issueCount,
    doneIssueCount,
    activeCycleName: activeCycle?.name ?? null,
    activeCycleId: activeCycle?.id ?? null,
    boardType: project.boardType as BoardType,
    leadUserId: project.leadUserId,
    boardConfig: parseBoardConfig(project.boardConfig),
    leadName: lead?.name ?? null,
    starred: Boolean(star),
  };
}

export async function listProjects(
  organizationId: string,
  userId?: string,
): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
    projects.map((project) => serializeProject(project, userId)),
  );
}

export async function getProject(
  id: string,
  organizationId: string,
  userId?: string,
) {
  const project = await prisma.project.findFirst({
    where: { id, organizationId },
  });

  return project ? serializeProject(project, userId) : null;
}

export class UnknownProjectLeadError extends Error {
  constructor() {
    super("The project lead must be a member of this workspace");
    this.name = "UnknownProjectLeadError";
  }
}

export type ProjectPerson = {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  role: string;
};

export async function listProjectPeople(
  organizationId: string,
): Promise<ProjectPerson[]> {
  const members = await prisma.member.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return members.map((member) => ({
    userId: member.userId,
    memberId: member.id,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
  }));
}

export async function isOrganizationUser(
  userId: string,
  organizationId: string,
) {
  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true },
  });
  return Boolean(member);
}

export async function setProjectStar(
  projectId: string,
  userId: string,
  organizationId: string,
  starred: boolean,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) return null;

  if (starred) {
    await prisma.projectStar.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId },
      update: {},
    });
  } else {
    await prisma.projectStar.deleteMany({ where: { projectId, userId } });
  }
  return { starred };
}

export async function deleteProject(id: string, organizationId: string) {
  const result = await prisma.project.deleteMany({
    where: { id, organizationId },
  });
  return result.count > 0;
}

export class DuplicateProjectKeyError extends Error {
  constructor() {
    super("A project with this key already exists");
    this.name = "DuplicateProjectKeyError";
  }
}

export class DuplicateProjectNameError extends Error {
  constructor() {
    super("A project with this name already exists");
    this.name = "DuplicateProjectNameError";
  }
}

async function createProjectUnhooked(
  input: NewProjectInput,
  actor: WorkspaceActor,
) {
  try {
    const project = await prisma.$transaction(async (transaction) => {
      const created = await transaction.project.create({
        data: {
          id: randomUUID(),
          key: input.key,
          name: input.name,
          description: input.description,
          color: input.color,
          boardType: input.boardType ?? "SCRUM",
          leadUserId: actor.id,
          organizationId: actor.organizationId,
          targetDate: input.targetDate
            ? parseTargetDate(input.targetDate)
            : null,
        },
      });
      // Every new project starts with Jira's default workflow and work types.
      await seedProjectWorkflow(transaction, created.id);
      return created;
    });

    return serializeProject(project, actor.id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      if (target.includes("key")) throw new DuplicateProjectKeyError();
      if (target.includes("name")) throw new DuplicateProjectNameError();
    }
    throw error;
  }
}

export async function updateProject(
  id: string,
  updates: ProjectUpdates,
  organizationId: string,
  userId?: string,
) {
  const current = await prisma.project.findFirst({
    where: { id, organizationId },
  });
  if (!current) return null;

  if (
    updates.leadUserId &&
    !(await isOrganizationUser(updates.leadUserId, organizationId))
  ) {
    throw new UnknownProjectLeadError();
  }

  const { targetDate, boardConfig, ...fields } = updates;

  let project: StoredProject;
  try {
    project = await prisma.project.update({
      where: { id },
      data: {
        ...fields,
        ...(boardConfig !== undefined
          ? { boardConfig: JSON.stringify(boardConfig) }
          : {}),
        ...(targetDate !== undefined
          ? { targetDate: targetDate ? parseTargetDate(targetDate) : null }
          : {}),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DuplicateProjectNameError();
    }
    throw error;
  }

  return serializeProject(project, userId);
}

export async function createProject(
  ...args: Parameters<typeof createProjectUnhooked>
) {
  const project = await createProjectUnhooked(...args);
  await recordAudit({
    organizationId: args[1].organizationId,
    actor: { id: args[1].id, name: args[1].name },
    action: "project.created",
    targetType: "project",
    targetId: project.id,
    details: { key: project.key, name: project.name },
  });
  return project;
}
