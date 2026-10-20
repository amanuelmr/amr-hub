import { isDoneStatus, isInProgressStatus } from "../app/data/workflow";
import { dispatchWebhook } from "./webhooks";
import { notDoneStatusWhere } from "./workflows";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";

export type VersionStatus = "UNRELEASED" | "RELEASED" | "ARCHIVED";

export type ProjectVersion = {
  id: string;
  name: string;
  description: string | null;
  status: VersionStatus;
  startDate: string | null;
  releaseDate: string | null;
  releasedAt: string | null;
  issueCount: number;
  doneCount: number;
  inProgressCount: number;
};

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date");

export const createVersionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable().default(null),
    startDate: dateSchema.nullable().default(null),
    releaseDate: dateSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (input) =>
      !input.startDate ||
      !input.releaseDate ||
      input.startDate <= input.releaseDate,
    {
      message: "Start date must be before the release date",
      path: ["releaseDate"],
    },
  );

export const updateVersionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    startDate: dateSchema.nullable().optional(),
    releaseDate: dateSchema.nullable().optional(),
    status: z.enum(["UNRELEASED", "RELEASED", "ARCHIVED"]).optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one version field to update",
  });

export const releaseVersionSchema = z
  .object({
    moveUnresolvedTo: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .default(null),
    releaseDate: dateSchema.nullable().optional(),
  })
  .strict();

export class DuplicateVersionNameError extends Error {
  constructor() {
    super("A version with this name already exists in the project");
    this.name = "DuplicateVersionNameError";
  }
}

export class InvalidTargetVersionError extends Error {
  constructor() {
    super("Choose another unreleased version from this project");
    this.name = "InvalidTargetVersionError";
  }
}

function toDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function optionalDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value ? toDate(value) : null;
}

type StoredVersion = Prisma.VersionGetPayload<{
  include: { issues: { where: { deletedAt: null }; select: { status: true } } };
}>;

const versionInclude = {
  issues: { where: { deletedAt: null }, select: { status: true } },
} satisfies Prisma.VersionInclude;

function serializeVersion(version: StoredVersion): ProjectVersion {
  return {
    id: version.id,
    name: version.name,
    description: version.description,
    status: version.status as VersionStatus,
    startDate: version.startDate?.toISOString() ?? null,
    releaseDate: version.releaseDate?.toISOString() ?? null,
    releasedAt: version.releasedAt?.toISOString() ?? null,
    issueCount: version.issues.length,
    doneCount: version.issues.filter((issue) => isDoneStatus(issue.status))
      .length,
    inProgressCount: version.issues.filter((issue) =>
      isInProgressStatus(issue.status),
    ).length,
  };
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findProject(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
}

async function findVersion(
  projectId: string,
  versionId: string,
  organizationId: string,
) {
  return prisma.version.findFirst({
    where: { id: versionId, projectId, project: { organizationId } },
  });
}

async function assertTargetVersion(
  projectId: string,
  targetId: string,
  excludeId: string,
) {
  if (targetId === excludeId) throw new InvalidTargetVersionError();
  const target = await prisma.version.findFirst({
    where: { id: targetId, projectId, status: "UNRELEASED" },
    select: { id: true },
  });
  if (!target) throw new InvalidTargetVersionError();
}

export async function listVersions(projectId: string, organizationId: string) {
  if (!(await findProject(projectId, organizationId))) return null;
  const versions = await prisma.version.findMany({
    where: { projectId },
    include: versionInclude,
    orderBy: [
      { releaseDate: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });
  return versions.map(serializeVersion);
}

export async function createVersion(
  projectId: string,
  input: z.infer<typeof createVersionSchema>,
  organizationId: string,
) {
  if (!(await findProject(projectId, organizationId))) return null;
  try {
    const version = await prisma.version.create({
      data: {
        projectId,
        name: input.name,
        description: input.description,
        startDate: optionalDate(input.startDate),
        releaseDate: optionalDate(input.releaseDate),
      },
      include: versionInclude,
    });
    return serializeVersion(version);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateVersionNameError();
    throw error;
  }
}

export async function updateVersion(
  projectId: string,
  versionId: string,
  updates: z.infer<typeof updateVersionSchema>,
  organizationId: string,
) {
  const current = await findVersion(projectId, versionId, organizationId);
  if (!current) return null;

  const { startDate, releaseDate, status, ...fields } = updates;
  const statusFields: Prisma.VersionUpdateInput = {};
  if (status && status !== current.status) {
    statusFields.status = status;
    if (status === "RELEASED" && !current.releasedAt) {
      statusFields.releasedAt = new Date();
    }
    if (status === "UNRELEASED") statusFields.releasedAt = null;
  }

  try {
    const version = await prisma.version.update({
      where: { id: versionId },
      data: {
        ...fields,
        ...statusFields,
        startDate: optionalDate(startDate),
        releaseDate: optionalDate(releaseDate),
      },
      include: versionInclude,
    });
    return serializeVersion(version);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateVersionNameError();
    throw error;
  }
}

async function releaseVersionUnhooked(
  projectId: string,
  versionId: string,
  input: z.infer<typeof releaseVersionSchema>,
  organizationId: string,
) {
  const current = await findVersion(projectId, versionId, organizationId);
  if (!current) return null;
  if (input.moveUnresolvedTo) {
    await assertTargetVersion(projectId, input.moveUnresolvedTo, versionId);
  }

  const version = await prisma.$transaction(async (tx) => {
    if (input.moveUnresolvedTo) {
      await tx.issue.updateMany({
        where: { fixVersionId: versionId, AND: [notDoneStatusWhere()] },
        data: { fixVersionId: input.moveUnresolvedTo },
      });
    }
    const now = new Date();
    return tx.version.update({
      where: { id: versionId },
      data: {
        status: "RELEASED",
        releasedAt: now,
        releaseDate: input.releaseDate
          ? toDate(input.releaseDate)
          : (current.releaseDate ?? now),
      },
      include: versionInclude,
    });
  });
  return serializeVersion(version);
}

export async function deleteVersion(
  projectId: string,
  versionId: string,
  moveTo: string | null,
  organizationId: string,
) {
  const current = await findVersion(projectId, versionId, organizationId);
  if (!current) return false;
  if (moveTo) await assertTargetVersion(projectId, moveTo, versionId);

  await prisma.$transaction(async (tx) => {
    await tx.issue.updateMany({
      where: { fixVersionId: versionId },
      data: { fixVersionId: moveTo },
    });
    await tx.version.delete({ where: { id: versionId } });
  });
  return true;
}

export async function releaseVersion(
  ...args: Parameters<typeof releaseVersionUnhooked>
) {
  const version = await releaseVersionUnhooked(...args);
  if (version) {
    dispatchWebhook(args[3], "version_released", { version });
  }
  return version;
}
