import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";

export type UserGroupSummary = {
  id: string;
  name: string;
  description: string | null;
  members: { userId: string; name: string; email: string }[];
};

export class GroupNameTakenError extends Error {
  constructor() {
    super("A group with this name already exists");
    this.name = "GroupNameTakenError";
  }
}

export class UnknownGroupMemberError extends Error {
  constructor() {
    super("Group members must belong to this workspace");
    this.name = "UnknownGroupMemberError";
  }
}

const memberIdsSchema = z.array(z.string().trim().min(1).max(120)).max(500);

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).nullable().optional(),
    memberIds: memberIdsSchema.optional(),
  })
  .strict();

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    /** Replaces the whole member list. */
    memberIds: memberIdsSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one group field to update",
  });

const groupInclude = {
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  },
} satisfies Prisma.UserGroupInclude;

type StoredGroup = Prisma.UserGroupGetPayload<{ include: typeof groupInclude }>;

function serialize(group: StoredGroup): UserGroupSummary {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    members: group.members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
    })),
  };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Members must be people in the workspace; duplicates are dropped. */
async function validMemberIds(memberIds: string[], organizationId: string) {
  const unique = [...new Set(memberIds)];
  const count = await prisma.member.count({ where: { organizationId, userId: { in: unique } } });
  if (count !== unique.length) throw new UnknownGroupMemberError();
  return unique;
}

export async function listGroups(organizationId: string) {
  const groups = await prisma.userGroup.findMany({
    where: { organizationId },
    include: groupInclude,
    orderBy: { name: "asc" },
  });
  return groups.map(serialize);
}

export async function createGroup(
  organizationId: string,
  input: z.infer<typeof createGroupSchema>,
) {
  const memberIds = await validMemberIds(input.memberIds ?? [], organizationId);
  try {
    const group = await prisma.userGroup.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      include: groupInclude,
    });
    return serialize(group);
  } catch (error) {
    if (isUniqueViolation(error)) throw new GroupNameTakenError();
    throw error;
  }
}

export async function updateGroup(
  id: string,
  organizationId: string,
  input: z.infer<typeof updateGroupSchema>,
) {
  const existing = await prisma.userGroup.findFirst({ where: { id, organizationId } });
  if (!existing) return null;
  const memberIds =
    input.memberIds === undefined ? null : await validMemberIds(input.memberIds, organizationId);
  try {
    const group = await prisma.$transaction(async (tx) => {
      if (memberIds) {
        await tx.userGroupMember.deleteMany({ where: { groupId: id } });
        await tx.userGroupMember.createMany({
          data: memberIds.map((userId) => ({ groupId: id, userId })),
        });
      }
      return tx.userGroup.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
        include: groupInclude,
      });
    });
    return serialize(group);
  } catch (error) {
    if (isUniqueViolation(error)) throw new GroupNameTakenError();
    throw error;
  }
}

/**
 * Deletes a group. Filters and dashboards shared with it keep their other
 * shares; the dangling group share simply matches nobody.
 */
export async function deleteGroup(id: string, organizationId: string) {
  const deleted = await prisma.userGroup.deleteMany({ where: { id, organizationId } });
  return deleted.count > 0;
}

/** The user ids in a group, for adding a whole group to a project. */
export async function groupMemberIds(id: string, organizationId: string) {
  const group = await prisma.userGroup.findFirst({
    where: { id, organizationId },
    select: { members: { select: { userId: true } } },
  });
  return group ? group.members.map((member) => member.userId) : null;
}
