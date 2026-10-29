import { randomUUID } from "node:crypto";
import { recordAudit } from "./audit";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import type { WorkspaceActor } from "./issues";
import { doneStatusWhere, seedProjectWorkflow } from "./workflows";
import {
  isProjectRole,
  projectAudienceUserIds,
  resolveProjectPermissions,
  visibleProjectWhere,
  type AccessUser,
} from "./projectAccess";

import { findProjectTemplate, templateColumns } from "../app/data/projectTemplates";
import {
  DEFAULT_BOARD_CONFIG,
  isProjectBackground,
  parseBoardConfig,
  type ProjectAccessLevel,
  type ProjectMemberEntry,
  type ProjectRole,
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
  background?: string | null;
  url?: string | null;
  accessLevel: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

const liveIssues = { deletedAt: null, archivedAt: null } as const;

async function serializeProject(
  project: StoredProject,
  user?: AccessUser,
): Promise<Project> {
  const userId = user?.id;
  const [issueCount, doneIssueCount, activeCycle, lead, star, membership, aliases] =
    await Promise.all([
      prisma.issue.count({ where: { projectId: project.id, ...liveIssues } }),
      prisma.issue.count({
        where: { projectId: project.id, ...liveIssues, AND: [doneStatusWhere()] },
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
      userId
        ? prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: project.id, userId } },
            select: { role: true },
          })
        : null,
      prisma.projectKeyAlias.findMany({
        where: { projectId: project.id },
        select: { key: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  const myRole = membership && isProjectRole(membership.role) ? membership.role : null;

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
    background: isProjectBackground(project.background) ? project.background : null,
    url: project.url ?? null,
    previousKeys: aliases.map((alias) => alias.key),
    leadName: lead?.name ?? null,
    starred: Boolean(star),
    accessLevel: project.accessLevel as ProjectAccessLevel,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    myRole,
    ...(user
      ? {
          permissions: resolveProjectPermissions({
            accessLevel: project.accessLevel,
            workspaceRole: user.role,
            projectRole: myRole,
            isLead: project.leadUserId === user.id,
            archived: project.archivedAt !== null,
            deleted: project.deletedAt !== null,
          }),
        }
      : {}),
  };
}

/**
 * Projects the user can see. Archived projects are left out unless
 * `archived` is "include" (all) or "only" (the Archived projects filter).
 */
export async function listProjects(
  organizationId: string,
  user: AccessUser,
  options: { archived?: "exclude" | "include" | "only" } = {},
): Promise<Project[]> {
  const archived = options.archived ?? "exclude";
  const projects = await prisma.project.findMany({
    where: {
      ...visibleProjectWhere(user, organizationId, {
        includeArchived: archived !== "exclude",
      }),
      ...(archived === "only" ? { archivedAt: { not: null } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(projects.map((project) => serializeProject(project, user)));
}

/** A project the user can see (archived ones included: they open read-only). */
export async function getProject(
  id: string,
  organizationId: string,
  user: AccessUser,
) {
  const project = await prisma.project.findFirst({
    where: {
      id,
      ...visibleProjectWhere(user, organizationId, { includeArchived: true }),
    },
  });

  return project ? serializeProject(project, user) : null;
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

/**
 * Workspace people who can be assigned or mentioned on the project: everyone
 * for Open/Limited projects; project members, the lead and owners for Private.
 */
export async function listProjectPeople(
  organizationId: string,
  projectId?: string,
): Promise<ProjectPerson[]> {
  const audience = projectId
    ? await projectAudienceUserIds(projectId, organizationId)
    : null;
  const members = await prisma.member.findMany({
    where: {
      organizationId,
      ...(audience ? { userId: { in: [...audience] } } : {}),
    },
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
    where: { id: projectId, organizationId, deletedAt: null },
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

/** Moves a project to the trash (Jira keeps it 60 days before purging). */
export async function deleteProject(id: string, organizationId: string) {
  const result = await prisma.project.updateMany({
    where: { id, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

/** Archives (read-only, hidden) or restores a project. */
export async function setProjectArchived(
  id: string,
  organizationId: string,
  archived: boolean,
) {
  const result = await prisma.project.updateMany({
    where: { id, organizationId, deletedAt: null },
    data: { archivedAt: archived ? new Date() : null },
  });
  return result.count > 0;
}

/* ------------------------------------------------------------------ */
/* Project access: level + people                                      */
/* ------------------------------------------------------------------ */

export class ProjectPeopleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPeopleError";
  }
}

export type ProjectAccessSettings = {
  accessLevel: ProjectAccessLevel;
  leadUserId: string | null;
  members: ProjectMemberEntry[];
};

export async function getProjectAccess(
  projectId: string,
  organizationId: string,
): Promise<ProjectAccessSettings | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: {
      accessLevel: true,
      leadUserId: true,
      members: {
        include: { user: { select: { name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return null;
  const workspaceMembers = await prisma.member.findMany({
    where: {
      organizationId,
      userId: { in: project.members.map((member) => member.userId) },
    },
    select: { userId: true, role: true },
  });
  const workspaceRoles = new Map(
    workspaceMembers.map((member) => [member.userId, member.role]),
  );
  return {
    accessLevel: project.accessLevel as ProjectAccessLevel,
    leadUserId: project.leadUserId,
    members: project.members
      // People who left the workspace keep no project access.
      .filter((member) => workspaceRoles.has(member.userId))
      .map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
        role: (isProjectRole(member.role) ? member.role : "MEMBER") as ProjectRole,
        workspaceRole: workspaceRoles.get(member.userId) ?? "member",
        isLead: member.userId === project.leadUserId,
        addedAt: member.createdAt.toISOString(),
      })),
  };
}

export async function setProjectAccessLevel(
  projectId: string,
  organizationId: string,
  accessLevel: ProjectAccessLevel,
) {
  const current = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { accessLevel: true },
  });
  if (!current) return null;
  await prisma.project.update({
    where: { id: projectId },
    data: { accessLevel },
  });
  return { previous: current.accessLevel as ProjectAccessLevel, accessLevel };
}

export async function addProjectMembers(
  projectId: string,
  organizationId: string,
  userIds: string[],
  role: ProjectRole,
) {
  const unique = [...new Set(userIds)];
  const members = await prisma.member.findMany({
    where: { organizationId, userId: { in: unique } },
    select: { userId: true },
  });
  if (members.length !== unique.length) {
    throw new ProjectPeopleError("Everyone you add must be a member of this workspace");
  }
  for (const userId of unique) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role },
      update: { role },
    });
  }
  return unique;
}

/** Changes a role; refuses to demote the last administrator. */
export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
) {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!existing) return null;
  if (existing.role === "ADMIN" && role !== "ADMIN") {
    await ensureAnotherAdmin(projectId, userId);
  }
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
  });
  return { previous: existing.role, role };
}

export async function removeProjectMember(projectId: string, userId: string) {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!existing) return null;
  if (existing.role === "ADMIN") await ensureAnotherAdmin(projectId, userId);
  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  return { role: existing.role };
}

async function ensureAnotherAdmin(projectId: string, leavingUserId: string) {
  const [otherAdmins, project] = await Promise.all([
    prisma.projectMember.count({
      where: { projectId, role: "ADMIN", userId: { not: leavingUserId } },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { leadUserId: true },
    }),
  ]);
  const leadIsAnotherAdmin =
    project?.leadUserId !== null &&
    project?.leadUserId !== undefined &&
    project.leadUserId !== leavingUserId;
  if (otherAdmins === 0 && !leadIsAnotherAdmin) {
    throw new ProjectPeopleError("A project needs at least one administrator");
  }
}

/**
 * Renames a project's key. Every work item keeps its number under the new key
 * (WEB-12 becomes SHOP-12); links follow through ON UPDATE CASCADE. The old key
 * stays reserved as an alias so old links and queries keep resolving.
 */
export async function changeProjectKey(
  projectId: string,
  newKey: string,
  organizationId: string,
  user: AccessUser,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, key: true },
  });
  if (!project) return null;
  if (project.key === newKey) return getProject(projectId, organizationId, user);

  const [taken, alias] = await Promise.all([
    prisma.project.findFirst({ where: { organizationId, key: newKey }, select: { id: true } }),
    prisma.projectKeyAlias.findUnique({
      where: { organizationId_key: { organizationId, key: newKey } },
      select: { projectId: true },
    }),
  ]);
  // A project may take back one of its own old keys, but never another's.
  if (taken || (alias && alias.projectId !== projectId)) throw new DuplicateProjectKeyError();

  await prisma.$transaction(async (tx) => {
    if (alias) {
      await tx.projectKeyAlias.delete({
        where: { organizationId_key: { organizationId, key: newKey } },
      });
    }
    await tx.projectKeyAlias.create({
      data: { organizationId, key: project.key, projectId },
    });
    await tx.project.update({ where: { id: projectId }, data: { key: newKey } });
    // Tables that hold work item keys without a foreign key are updated first,
    // while the old keys still match.
    await tx.$executeRaw`
      UPDATE "IssueView" AS v SET "issueId" = ${newKey} || '-' || i."sequence"
      FROM "Issue" AS i WHERE v."issueId" = i."id" AND i."projectId" = ${projectId}`;
    await tx.$executeRaw`
      UPDATE "AutomationRunLog" AS l SET "issueId" = ${newKey} || '-' || i."sequence"
      FROM "Issue" AS i WHERE l."issueId" = i."id" AND i."projectId" = ${projectId}`;
    await tx.$executeRaw`
      UPDATE "Issue" SET "id" = ${newKey} || '-' || "sequence"
      WHERE "projectId" = ${projectId}`;
  });

  return getProject(projectId, organizationId, user);
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
  const template = findProjectTemplate(input.template);
  // A key another project used before its rename stays reserved.
  const reserved = await prisma.projectKeyAlias.findUnique({
    where: { organizationId_key: { organizationId: actor.organizationId, key: input.key } },
    select: { id: true },
  });
  if (reserved) throw new DuplicateProjectKeyError();
  try {
    const project = await prisma.$transaction(async (transaction) => {
      const created = await transaction.project.create({
        data: {
          id: randomUUID(),
          key: input.key,
          name: input.name,
          description: input.description,
          color: input.color,
          boardType: template?.boardType ?? input.boardType ?? "SCRUM",
          // A template names the board columns after its statuses.
          ...(template
            ? {
                boardConfig: JSON.stringify({
                  ...DEFAULT_BOARD_CONFIG,
                  columns: templateColumns(template),
                }),
              }
            : {}),
          accessLevel: input.accessLevel ?? "OPEN",
          leadUserId: actor.id,
          organizationId: actor.organizationId,
          targetDate: input.targetDate
            ? parseTargetDate(input.targetDate)
            : null,
        },
      });
      // Every new project starts with Jira's default workflow and work types.
      await seedProjectWorkflow(transaction, created.id, template);
      // Jira: whoever creates a project administers it.
      await transaction.projectMember.create({
        data: { projectId: created.id, userId: actor.id, role: "ADMIN" },
      });
      return created;
    });

    return serializeProject(project, { id: actor.id, role: actor.role ?? "member" });
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
  user: AccessUser,
) {
  const current = await prisma.project.findFirst({
    where: { id, organizationId, deletedAt: null },
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

  return serializeProject(project, user);
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
