import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Cycle, NewCycleInput, SprintState } from "../app/data/issues";
import prisma from "../../prisma/client";
import {
  assertActorPermission,
  visibleProjectWhere,
  type AccessUser,
} from "./projectAccess";
import type { WorkspaceActor } from "./issues";

export type StoredCycle = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  projectId: string;
  goal?: string | null;
  state?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  committedPoints?: number | null;
  completedPoints?: number | null;
};

export function serializeCycle(cycle: StoredCycle): Cycle {
  return {
    id: cycle.id,
    name: cycle.name,
    startDate: cycle.startDate.toISOString(),
    endDate: cycle.endDate.toISOString(),
    capacity: cycle.capacity,
    projectId: cycle.projectId,
    goal: cycle.goal ?? null,
    state: (cycle.state ?? "FUTURE") as SprintState,
    startedAt: cycle.startedAt?.toISOString() ?? null,
    completedAt: cycle.completedAt?.toISOString() ?? null,
    committedPoints: cycle.committedPoints ?? null,
    completedPoints: cycle.completedPoints ?? null,
  };
}

export async function listCycles(
  organizationId: string,
  projectId: string | undefined,
  viewer: AccessUser,
): Promise<Cycle[]> {
  const cycles = await prisma.cycle.findMany({
    where: {
      organizationId,
      ...(projectId ? { projectId } : {}),
      project: visibleProjectWhere(viewer, organizationId, { includeArchived: true }),
    },
    orderBy: { startDate: "asc" },
  });

  return cycles.map(serializeCycle);
}

export class UnknownProjectError extends Error {
  constructor() {
    super("The selected project does not exist");
    this.name = "UnknownProjectError";
  }
}

export class DuplicateCycleNameError extends Error {
  constructor() {
    super("A cycle with this name already exists in this project");
    this.name = "DuplicateCycleNameError";
  }
}

export function parseCycleDate(value: string, endOfDay: boolean) {
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function createCycle(
  input: NewCycleInput,
  actor: WorkspaceActor,
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!project) throw new UnknownProjectError();
  await assertActorPermission(actor, project.id, "edit");

  try {
    const cycle = await prisma.cycle.create({
      data: {
        id: randomUUID(),
        name: input.name,
        startDate: parseCycleDate(input.startDate, false),
        endDate: parseCycleDate(input.endDate, true),
        capacity: input.capacity,
        projectId: input.projectId,
        organizationId: actor.organizationId,
      },
    });

    return serializeCycle(cycle);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DuplicateCycleNameError();
    }
    throw error;
  }
}
