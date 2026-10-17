import prisma from "../../prisma/client";
import {
  defaultGadgets,
  parseStoredGadgets,
  type Gadget,
} from "./dashboardSchemas";

export type DashboardRecord = {
  id: string;
  name: string;
  gadgets: Gadget[];
  createdAt: string;
  updatedAt: string;
};

type StoredDashboard = {
  id: string;
  name: string;
  gadgets: string;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeDashboard(dashboard: StoredDashboard): DashboardRecord {
  return {
    id: dashboard.id,
    name: dashboard.name,
    gadgets: parseStoredGadgets(dashboard.gadgets),
    createdAt: dashboard.createdAt.toISOString(),
    updatedAt: dashboard.updatedAt.toISOString(),
  };
}

/** Lists the user's dashboards, seeding a default one on first visit. */
export async function listDashboards(userId: string, organizationId: string) {
  const dashboards = await prisma.dashboard.findMany({
    where: { userId, organizationId },
    orderBy: { createdAt: "asc" },
  });

  if (dashboards.length > 0) return dashboards.map(serializeDashboard);

  const seeded = await prisma.dashboard.create({
    data: {
      name: "Default dashboard",
      gadgets: JSON.stringify(defaultGadgets()),
      userId,
      organizationId,
    },
  });
  return [serializeDashboard(seeded)];
}

export async function getDashboard(
  id: string,
  userId: string,
  organizationId: string,
) {
  const dashboard = await prisma.dashboard.findFirst({
    where: { id, userId, organizationId },
  });
  return dashboard ? serializeDashboard(dashboard) : null;
}

export async function createDashboard(
  input: { name: string; gadgets?: Gadget[] },
  userId: string,
  organizationId: string,
) {
  const dashboard = await prisma.dashboard.create({
    data: {
      name: input.name,
      gadgets: JSON.stringify(input.gadgets ?? defaultGadgets()),
      userId,
      organizationId,
    },
  });
  return serializeDashboard(dashboard);
}

export async function updateDashboard(
  id: string,
  input: { name?: string; gadgets?: Gadget[] },
  userId: string,
  organizationId: string,
) {
  const result = await prisma.dashboard.updateMany({
    where: { id, userId, organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.gadgets !== undefined
        ? { gadgets: JSON.stringify(input.gadgets) }
        : {}),
    },
  });
  if (result.count === 0) return null;
  return getDashboard(id, userId, organizationId);
}

export async function deleteDashboard(
  id: string,
  userId: string,
  organizationId: string,
) {
  const result = await prisma.dashboard.deleteMany({
    where: { id, userId, organizationId },
  });
  return result.count > 0;
}
