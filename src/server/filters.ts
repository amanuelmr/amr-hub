import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { basicFiltersToJql, parseJql } from "../app/data/jql";
import {
  canEditFilter,
  canManageFilter,
  canViewFilter,
  dedupeShares,
  parseShares,
  type FilterAudience,
  type FilterShare,
  type FilterSummary,
} from "../app/data/filters";
import { accessibleProjectIds, type AccessUser } from "./projectAccess";

export class FilterInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterInputError";
  }
}

export class FilterPermissionError extends Error {
  constructor(message = "You can't change this filter") {
    super(message);
    this.name = "FilterPermissionError";
  }
}

const jqlSchema = z
  .string()
  .trim()
  .max(4000)
  .superRefine((value, context) => {
    const parsed = parseJql(value, undefined, { customFields: "any" });
    if (!parsed.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${parsed.error.message} (at character ${parsed.error.position + 1})`,
      });
    }
  });

const shareSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("WORKSPACE") }).strict(),
  z.object({ type: z.literal("PROJECT"), id: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal("GROUP"), id: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal("TEAM"), id: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal("USER"), id: z.string().trim().min(1).max(120) }).strict(),
]);
const sharesSchema = z.array(shareSchema).max(50);

export const createFilterSchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().max(1000).nullable().optional(),
    jql: jqlSchema,
    viewers: sharesSchema.optional(),
    editors: sharesSchema.optional(),
  })
  .strict();

export const updateFilterSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    jql: jqlSchema.optional(),
    viewers: sharesSchema.optional(),
    editors: sharesSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one filter field to update",
  });

export const changeOwnerSchema = z
  .object({ userId: z.string().trim().min(1).max(120) })
  .strict();

type StoredFilter = Prisma.SavedViewGetPayload<{
  include: { _count: { select: { stars: true } } };
}>;

/** Who the viewer is, for share matching. */
export async function filterAudience(
  user: AccessUser,
  organizationId: string,
): Promise<FilterAudience> {
  const [teams, groups, projectIds] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId: user.id, team: { organizationId } },
      select: { teamId: true },
    }),
    prisma.userGroupMember.findMany({
      where: { userId: user.id, group: { organizationId } },
      select: { groupId: true },
    }),
    accessibleProjectIds(organizationId, user),
  ]);
  return {
    userId: user.id,
    role: user.role,
    teamIds: teams.map((team) => team.teamId),
    groupIds: groups.map((group) => group.groupId),
    projectIds: [...projectIds],
  };
}

/** Saved before filters stored JQL: rebuild the query from the basic fields. */
function legacyJql(view: StoredFilter) {
  return basicFiltersToJql({
    text: view.query,
    status: view.status,
    priority: view.priority,
    sort: view.sort === "OLDEST" ? "OLDEST" : "NEWEST",
  });
}

function shareable(view: StoredFilter) {
  return {
    ownerId: view.userId,
    viewers: parseShares(view.viewers),
    editors: parseShares(view.editors),
  };
}

function serialize(
  view: StoredFilter,
  audience: FilterAudience,
  starredIds: Set<string>,
): FilterSummary {
  const sharing = shareable(view);
  return {
    id: view.id,
    name: view.name,
    description: view.description,
    jql: view.jql ?? legacyJql(view),
    ownerId: view.userId,
    ownerName: view.owner,
    viewers: sharing.viewers,
    editors: sharing.editors,
    isStarred: starredIds.has(view.id),
    starCount: view._count.stars,
    canEdit: canEditFilter(sharing, audience),
    canManage: canManageFilter(sharing, audience),
    isMine: view.userId === audience.userId,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

const withStarCount = { _count: { select: { stars: true } } } as const;

async function starredFilterIds(userId: string) {
  const stars = await prisma.filterStar.findMany({
    where: { userId },
    select: { savedViewId: true },
  });
  return new Set(stars.map((star) => star.savedViewId));
}

/** Filters the viewer may see (Jira only lists filters shared with you). */
export async function listFilters(
  user: AccessUser,
  organizationId: string,
  scope: "all" | "mine" | "starred" = "all",
) {
  const [audience, starred] = await Promise.all([
    filterAudience(user, organizationId),
    starredFilterIds(user.id),
  ]);
  const views = await prisma.savedView.findMany({
    where: {
      organizationId,
      userId: scope === "mine" ? user.id : { not: null },
      ...(scope === "starred" ? { id: { in: [...starred] } } : {}),
    },
    include: withStarCount,
    orderBy: [{ name: "asc" }],
  });
  return views
    .filter((view) => canViewFilter(shareable(view), audience))
    .map((view) => serialize(view, audience, starred));
}

async function findVisible(id: string, user: AccessUser, organizationId: string) {
  const view = await prisma.savedView.findFirst({
    where: { id, organizationId, userId: { not: null } },
    include: withStarCount,
  });
  if (!view) return null;
  const audience = await filterAudience(user, organizationId);
  if (!canViewFilter(shareable(view), audience)) return null;
  return { view, audience };
}

export async function getFilter(id: string, user: AccessUser, organizationId: string) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  return serialize(found.view, found.audience, await starredFilterIds(user.id));
}

/** Every share must point at something in this workspace. */
async function validateShares(shares: FilterShare[], organizationId: string) {
  const unique = dedupeShares(shares);
  const ids = (type: FilterShare["type"]) =>
    unique.flatMap((share) => (share.type === type && "id" in share ? [share.id] : []));
  const [projects, groups, teams, members] = await Promise.all([
    prisma.project.count({ where: { id: { in: ids("PROJECT") }, organizationId } }),
    prisma.userGroup.count({ where: { id: { in: ids("GROUP") }, organizationId } }),
    prisma.team.count({ where: { id: { in: ids("TEAM") }, organizationId } }),
    prisma.member.count({ where: { userId: { in: ids("USER") }, organizationId } }),
  ]);
  if (projects !== ids("PROJECT").length) throw new FilterInputError("A shared project doesn't exist");
  if (groups !== ids("GROUP").length) throw new FilterInputError("A shared group doesn't exist");
  if (teams !== ids("TEAM").length) throw new FilterInputError("A shared team doesn't exist");
  if (members !== ids("USER").length) {
    throw new FilterInputError("You can only share with people in this workspace");
  }
  return JSON.stringify(unique);
}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new FilterInputError("You already have a filter with this name");
  }
  throw error;
}

export async function createFilter(
  input: z.infer<typeof createFilterSchema>,
  actor: { id: string; name: string; role: string; organizationId: string },
) {
  const [viewers, editors] = await Promise.all([
    validateShares(input.viewers ?? [], actor.organizationId),
    validateShares(input.editors ?? [], actor.organizationId),
  ]);
  try {
    const view = await prisma.savedView.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        jql: input.jql,
        viewers,
        editors,
        owner: actor.name,
        userId: actor.id,
        organizationId: actor.organizationId,
      },
    });
    return view.id;
  } catch (error) {
    rethrowDuplicate(error);
  }
}

export async function updateFilter(
  id: string,
  input: z.infer<typeof updateFilterSchema>,
  user: AccessUser,
  organizationId: string,
) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (!canEditFilter(shareable(found.view), found.audience)) {
    throw new FilterPermissionError("Only the owner and editors can change this filter");
  }
  const [viewers, editors] = await Promise.all([
    input.viewers ? validateShares(input.viewers, organizationId) : undefined,
    input.editors ? validateShares(input.editors, organizationId) : undefined,
  ]);
  try {
    await prisma.savedView.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.jql !== undefined ? { jql: input.jql } : {}),
        ...(viewers !== undefined ? { viewers } : {}),
        ...(editors !== undefined ? { editors } : {}),
      },
    });
  } catch (error) {
    rethrowDuplicate(error);
  }
  return true;
}

/** Jira "Copy filter": a private copy owned by the viewer. */
export async function copyFilter(
  id: string,
  actor: { id: string; name: string; role: string; organizationId: string },
) {
  const found = await findVisible(id, actor, actor.organizationId);
  if (!found) return null;
  const existing = await prisma.savedView.findMany({
    where: { organizationId: actor.organizationId, userId: actor.id },
    select: { name: true },
  });
  const taken = new Set(existing.map((view) => view.name.toLowerCase()));
  let name = `Copy of ${found.view.name}`.slice(0, 255);
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) {
    name = `Copy of ${found.view.name} (${n})`.slice(0, 255);
  }
  const view = await prisma.savedView.create({
    data: {
      name,
      description: found.view.description,
      jql: found.view.jql ?? legacyJql(found.view),
      owner: actor.name,
      userId: actor.id,
      organizationId: actor.organizationId,
    },
  });
  return view.id;
}

export async function changeFilterOwner(
  id: string,
  newOwnerId: string,
  user: AccessUser,
  organizationId: string,
) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (!canManageFilter(shareable(found.view), found.audience)) {
    throw new FilterPermissionError("Only the owner or a workspace owner can change the owner");
  }
  const member = await prisma.member.findFirst({
    where: { userId: newOwnerId, organizationId },
    include: { user: { select: { name: true } } },
  });
  if (!member) throw new FilterInputError("The new owner must be in this workspace");
  try {
    await prisma.savedView.update({
      where: { id },
      data: { userId: newOwnerId, owner: member.user.name },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FilterInputError("The new owner already has a filter with this name");
    }
    throw error;
  }
  return true;
}

export async function deleteFilter(id: string, user: AccessUser, organizationId: string) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (!canManageFilter(shareable(found.view), found.audience)) {
    throw new FilterPermissionError("Only the owner or a workspace owner can delete this filter");
  }
  await prisma.savedView.delete({ where: { id } });
  return true;
}

export async function setFilterStar(
  id: string,
  starred: boolean,
  user: AccessUser,
  organizationId: string,
) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (starred) {
    await prisma.filterStar.upsert({
      where: { savedViewId_userId: { savedViewId: id, userId: user.id } },
      create: { savedViewId: id, userId: user.id },
      update: {},
    });
  } else {
    await prisma.filterStar.deleteMany({ where: { savedViewId: id, userId: user.id } });
  }
  return true;
}
