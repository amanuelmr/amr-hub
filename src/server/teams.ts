import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import type {
  TeamDetail,
  TeamSummary,
} from "../app/components/people/types";
import { canEditTeam } from "./peopleLogic";
import { countOpenIssues, loadWorkItems } from "./people";
import type { CreateTeamInput, UpdateTeamInput } from "./teamSchemas";

export type TeamViewer = { userId: string; role: string };

export class TeamNameTakenError extends Error {
  constructor(name: string) {
    super(`A team named "${name}" already exists`);
    this.name = "TeamNameTakenError";
  }
}

export class UnknownTeamMemberError extends Error {
  constructor() {
    super("Team members must belong to this workspace");
    this.name = "UnknownTeamMemberError";
  }
}

export class TeamForbiddenError extends Error {
  constructor() {
    super("Only team members or workspace owners can change this team");
    this.name = "TeamForbiddenError";
  }
}

const teamInclude = {
  members: {
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  },
} satisfies Prisma.TeamInclude;

type StoredTeam = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;

function serializeTeam(
  team: StoredTeam,
  viewer: TeamViewer,
  openIssueCount: number,
): TeamSummary {
  const members = team.members
    .map((entry) => ({
      userId: entry.user.id,
      name: entry.user.name,
      email: entry.user.email,
      image: entry.user.image,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    createdAt: team.createdAt.toISOString(),
    members,
    openIssueCount,
    canEdit: canEditTeam(
      viewer.role,
      viewer.userId,
      members.map((member) => member.userId),
    ),
  };
}

export async function listTeams(
  organizationId: string,
  viewer: TeamViewer,
  filters: { memberUserId?: string } = {},
): Promise<TeamSummary[]> {
  const [teams, counts] = await Promise.all([
    prisma.team.findMany({
      where: {
        organizationId,
        ...(filters.memberUserId
          ? { members: { some: { userId: filters.memberUserId } } }
          : {}),
      },
      include: teamInclude,
      orderBy: { name: "asc" },
    }),
    countOpenIssues(organizationId, { teamId: { not: null } }, (row) => row.teamId),
  ]);
  return teams.map((team) => serializeTeam(team, viewer, counts.get(team.id) ?? 0));
}

async function findTeam(id: string, organizationId: string) {
  return prisma.team.findFirst({
    where: { id, organizationId },
    include: teamInclude,
  });
}

export async function getTeam(
  id: string,
  organizationId: string,
  viewer: TeamViewer,
): Promise<TeamDetail | null> {
  const team = await findTeam(id, organizationId);
  if (!team) return null;
  const work = await loadWorkItems({ organizationId, teamId: team.id }, { take: 300 });
  const open = work.filter((issue) => issue.statusCategory !== "DONE").length;
  return { ...serializeTeam(team, viewer, open), work };
}

async function assertWorkspaceUsers(userIds: string[], organizationId: string) {
  if (userIds.length === 0) return;
  const count = await prisma.member.count({
    where: { organizationId, userId: { in: userIds } },
  });
  if (count !== userIds.length) throw new UnknownTeamMemberError();
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createTeam(
  organizationId: string,
  input: CreateTeamInput,
  viewer: TeamViewer,
): Promise<TeamDetail> {
  // Jira adds the creator to the team they create.
  const memberUserIds = [...new Set([viewer.userId, ...input.memberUserIds])];
  await assertWorkspaceUsers(memberUserIds, organizationId);
  if (await findTeamIdByName(input.name, organizationId)) {
    throw new TeamNameTakenError(input.name);
  }
  try {
    const team = await prisma.team.create({
      data: {
        name: input.name,
        description: input.description,
        organizationId,
        members: { create: memberUserIds.map((userId) => ({ userId })) },
      },
    });
    return (await getTeam(team.id, organizationId, viewer)) as TeamDetail;
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamNameTakenError(input.name);
    throw error;
  }
}

/** Loads the team and enforces edit permission; null when it does not exist. */
async function editableTeam(id: string, organizationId: string, viewer: TeamViewer) {
  const team = await findTeam(id, organizationId);
  if (!team) return null;
  const memberIds = team.members.map((member) => member.userId);
  if (!canEditTeam(viewer.role, viewer.userId, memberIds)) {
    throw new TeamForbiddenError();
  }
  return team;
}

export async function updateTeam(
  id: string,
  organizationId: string,
  input: UpdateTeamInput,
  viewer: TeamViewer,
): Promise<TeamDetail | null> {
  const team = await editableTeam(id, organizationId, viewer);
  if (!team) return null;
  if (input.memberUserIds) {
    await assertWorkspaceUsers(input.memberUserIds, organizationId);
  }
  if (input.name !== undefined) {
    const existing = await findTeamIdByName(input.name, organizationId);
    if (existing && existing !== team.id) throw new TeamNameTakenError(input.name);
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: team.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        },
      });
      if (input.memberUserIds) {
        await tx.teamMember.deleteMany({
          where: { teamId: team.id, userId: { notIn: input.memberUserIds } },
        });
        await tx.teamMember.createMany({
          data: input.memberUserIds.map((userId) => ({ teamId: team.id, userId })),
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error) && input.name) {
      throw new TeamNameTakenError(input.name);
    }
    throw error;
  }
  return getTeam(team.id, organizationId, viewer);
}

export async function deleteTeam(
  id: string,
  organizationId: string,
  viewer: TeamViewer,
) {
  const team = await editableTeam(id, organizationId, viewer);
  if (!team) return false;
  // Issue.teamId is ON DELETE SET NULL, so team work stays in place.
  await prisma.team.delete({ where: { id: team.id } });
  return true;
}

export async function addTeamMembers(
  id: string,
  organizationId: string,
  userIds: string[],
  viewer: TeamViewer,
): Promise<TeamDetail | null> {
  const team = await editableTeam(id, organizationId, viewer);
  if (!team) return null;
  await assertWorkspaceUsers(userIds, organizationId);
  await prisma.teamMember.createMany({
    data: userIds.map((userId) => ({ teamId: team.id, userId })),
    skipDuplicates: true,
  });
  return getTeam(team.id, organizationId, viewer);
}

export async function removeTeamMembers(
  id: string,
  organizationId: string,
  userIds: string[],
  viewer: TeamViewer,
): Promise<TeamDetail | null> {
  const team = await editableTeam(id, organizationId, viewer);
  if (!team) return null;
  await prisma.teamMember.deleteMany({
    where: { teamId: team.id, userId: { in: userIds } },
  });
  return getTeam(team.id, organizationId, viewer);
}

/** For the issue "Team" field / JQL: resolve a team id within a workspace. */
export async function findTeamIdByName(name: string, organizationId: string) {
  const team = await prisma.team.findFirst({
    where: { organizationId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return team?.id ?? null;
}
