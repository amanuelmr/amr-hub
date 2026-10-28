import prisma from "../../prisma/client";
import {
  canEditFilter,
  canManageFilter,
  canViewFilter,
  dedupeShares,
  parseShares,
  type FilterAudience,
  type FilterShare,
} from "../app/data/filters";
import {
  defaultGadgets,
  parseStoredGadgets,
  type Gadget,
} from "./dashboardSchemas";
import { filterAudience } from "./filters";
import type { AccessUser } from "./projectAccess";

export class DashboardInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardInputError";
  }
}

export class DashboardPermissionError extends Error {
  constructor(message = "You can't change this dashboard") {
    super(message);
    this.name = "DashboardPermissionError";
  }
}

export type DashboardRecord = {
  id: string;
  name: string;
  description: string | null;
  gadgets: Gadget[];
  ownerId: string;
  ownerName: string;
  viewers: FilterShare[];
  editors: FilterShare[];
  isStarred: boolean;
  starCount: number;
  canEdit: boolean;
  canManage: boolean;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
};

const dashboardInclude = {
  user: { select: { name: true } },
  _count: { select: { stars: true } },
} as const;

type StoredDashboard = {
  id: string;
  name: string;
  description: string | null;
  gadgets: string;
  viewers: string;
  editors: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string };
  _count: { stars: number };
};

function sharing(dashboard: StoredDashboard) {
  return {
    ownerId: dashboard.userId,
    viewers: parseShares(dashboard.viewers),
    editors: parseShares(dashboard.editors),
  };
}

function serialize(
  dashboard: StoredDashboard,
  audience: FilterAudience,
  starred: Set<string>,
): DashboardRecord {
  const shares = sharing(dashboard);
  return {
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description,
    gadgets: parseStoredGadgets(dashboard.gadgets),
    ownerId: dashboard.userId,
    ownerName: dashboard.user.name,
    viewers: shares.viewers,
    editors: shares.editors,
    isStarred: starred.has(dashboard.id),
    starCount: dashboard._count.stars,
    canEdit: canEditFilter(shares, audience),
    canManage: canManageFilter(shares, audience),
    isMine: dashboard.userId === audience.userId,
    createdAt: dashboard.createdAt.toISOString(),
    updatedAt: dashboard.updatedAt.toISOString(),
  };
}

async function starredDashboardIds(userId: string) {
  const stars = await prisma.dashboardStar.findMany({
    where: { userId },
    select: { dashboardId: true },
  });
  return new Set(stars.map((star) => star.dashboardId));
}

/**
 * Dashboards shared with the viewer (Jira lists only those). A user who owns
 * none gets a "Default dashboard" seeded on first visit.
 */
export async function listDashboards(
  user: AccessUser,
  organizationId: string,
  scope: "all" | "mine" | "starred" = "all",
) {
  const ownsAny = await prisma.dashboard.count({
    where: { userId: user.id, organizationId },
  });
  if (ownsAny === 0) {
    await prisma.dashboard.create({
      data: {
        name: "Default dashboard",
        gadgets: JSON.stringify(defaultGadgets()),
        userId: user.id,
        organizationId,
      },
    });
  }

  const [audience, starred] = await Promise.all([
    filterAudience(user, organizationId),
    starredDashboardIds(user.id),
  ]);
  const dashboards = await prisma.dashboard.findMany({
    where: {
      organizationId,
      ...(scope === "mine" ? { userId: user.id } : {}),
      ...(scope === "starred" ? { id: { in: [...starred] } } : {}),
    },
    include: dashboardInclude,
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
  return dashboards
    .filter((dashboard) => canViewFilter(sharing(dashboard), audience))
    .map((dashboard) => serialize(dashboard, audience, starred));
}

async function findVisible(id: string, user: AccessUser, organizationId: string) {
  const dashboard = await prisma.dashboard.findFirst({
    where: { id, organizationId },
    include: dashboardInclude,
  });
  if (!dashboard) return null;
  const audience = await filterAudience(user, organizationId);
  if (!canViewFilter(sharing(dashboard), audience)) return null;
  return { dashboard, audience };
}

export async function getDashboard(id: string, user: AccessUser, organizationId: string) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  return serialize(found.dashboard, found.audience, await starredDashboardIds(user.id));
}

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
  if (projects !== ids("PROJECT").length) throw new DashboardInputError("A shared project doesn't exist");
  if (groups !== ids("GROUP").length) throw new DashboardInputError("A shared group doesn't exist");
  if (teams !== ids("TEAM").length) throw new DashboardInputError("A shared team doesn't exist");
  if (members !== ids("USER").length) {
    throw new DashboardInputError("You can only share with people in this workspace");
  }
  return JSON.stringify(unique);
}

export async function createDashboard(
  input: {
    name: string;
    description?: string | null;
    gadgets?: Gadget[];
    viewers?: FilterShare[];
    editors?: FilterShare[];
  },
  user: AccessUser,
  organizationId: string,
) {
  const [viewers, editors] = await Promise.all([
    validateShares(input.viewers ?? [], organizationId),
    validateShares(input.editors ?? [], organizationId),
  ]);
  const dashboard = await prisma.dashboard.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      gadgets: JSON.stringify(input.gadgets ?? defaultGadgets()),
      viewers,
      editors,
      userId: user.id,
      organizationId,
    },
  });
  return getDashboard(dashboard.id, user, organizationId);
}

export async function updateDashboard(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    gadgets?: Gadget[];
    viewers?: FilterShare[];
    editors?: FilterShare[];
  },
  user: AccessUser,
  organizationId: string,
) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (!canEditFilter(sharing(found.dashboard), found.audience)) {
    throw new DashboardPermissionError("Only the owner and editors can change this dashboard");
  }
  const [viewers, editors] = await Promise.all([
    input.viewers ? validateShares(input.viewers, organizationId) : undefined,
    input.editors ? validateShares(input.editors, organizationId) : undefined,
  ]);
  await prisma.dashboard.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.gadgets !== undefined ? { gadgets: JSON.stringify(input.gadgets) } : {}),
      ...(viewers !== undefined ? { viewers } : {}),
      ...(editors !== undefined ? { editors } : {}),
    },
  });
  return getDashboard(id, user, organizationId);
}

export async function deleteDashboard(id: string, user: AccessUser, organizationId: string) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return false;
  if (!canManageFilter(sharing(found.dashboard), found.audience)) {
    throw new DashboardPermissionError("Only the owner or a workspace owner can delete this dashboard");
  }
  await prisma.dashboard.delete({ where: { id } });
  return true;
}

/** Jira "Copy dashboard": a private copy with the same gadgets. */
export async function copyDashboard(id: string, user: AccessUser, organizationId: string) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  const copy = await prisma.dashboard.create({
    data: {
      name: `Copy of ${found.dashboard.name}`.slice(0, 80),
      description: found.dashboard.description,
      gadgets: found.dashboard.gadgets,
      userId: user.id,
      organizationId,
    },
  });
  return getDashboard(copy.id, user, organizationId);
}

export async function changeDashboardOwner(
  id: string,
  newOwnerId: string,
  user: AccessUser,
  organizationId: string,
) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (!canManageFilter(sharing(found.dashboard), found.audience)) {
    throw new DashboardPermissionError("Only the owner or a workspace owner can change the owner");
  }
  const member = await prisma.member.findFirst({
    where: { userId: newOwnerId, organizationId },
    select: { id: true },
  });
  if (!member) throw new DashboardInputError("The new owner must be in this workspace");
  await prisma.dashboard.update({ where: { id }, data: { userId: newOwnerId } });
  // The previous owner may no longer see a private dashboard.
  return { dashboard: await getDashboard(id, user, organizationId) };
}

export async function setDashboardStar(
  id: string,
  starred: boolean,
  user: AccessUser,
  organizationId: string,
) {
  const found = await findVisible(id, user, organizationId);
  if (!found) return null;
  if (starred) {
    await prisma.dashboardStar.upsert({
      where: { dashboardId_userId: { dashboardId: id, userId: user.id } },
      create: { dashboardId: id, userId: user.id },
      update: {},
    });
  } else {
    await prisma.dashboardStar.deleteMany({ where: { dashboardId: id, userId: user.id } });
  }
  return getDashboard(id, user, organizationId);
}
