import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import { isOrganizationUser } from "./projects";

export type ProjectComponent = {
  id: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  issueCount: number;
};

export const createComponentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable().default(null),
    leadUserId: z.string().trim().min(1).max(120).nullable().default(null),
  })
  .strict();

export const updateComponentSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    leadUserId: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one component field to update",
  });

export class DuplicateComponentNameError extends Error {
  constructor() {
    super("A component with this name already exists in the project");
    this.name = "DuplicateComponentNameError";
  }
}

export class InvalidComponentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidComponentInputError";
  }
}

const componentInclude = {
  _count: { select: { issues: true } },
} satisfies Prisma.ComponentInclude;

type StoredComponent = Prisma.ComponentGetPayload<{
  include: typeof componentInclude;
}>;

function serializeComponent(component: StoredComponent): ProjectComponent {
  return {
    id: component.id,
    name: component.name,
    description: component.description,
    leadUserId: component.leadUserId,
    issueCount: component._count.issues,
  };
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function assertLead(
  leadUserId: string | null | undefined,
  organizationId: string,
) {
  if (leadUserId && !(await isOrganizationUser(leadUserId, organizationId))) {
    throw new InvalidComponentInputError(
      "The component lead must be a member of this workspace",
    );
  }
}

async function findProject(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
}

async function findComponent(
  projectId: string,
  componentId: string,
  organizationId: string,
) {
  return prisma.component.findFirst({
    where: { id: componentId, projectId, project: { organizationId } },
    select: { id: true },
  });
}

export async function listComponents(
  projectId: string,
  organizationId: string,
) {
  if (!(await findProject(projectId, organizationId))) return null;
  const components = await prisma.component.findMany({
    where: { projectId },
    include: componentInclude,
    orderBy: { name: "asc" },
  });
  return components.map(serializeComponent);
}

export async function createComponent(
  projectId: string,
  input: z.infer<typeof createComponentSchema>,
  organizationId: string,
) {
  if (!(await findProject(projectId, organizationId))) return null;
  await assertLead(input.leadUserId, organizationId);
  try {
    const component = await prisma.component.create({
      data: { projectId, ...input },
      include: componentInclude,
    });
    return serializeComponent(component);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateComponentNameError();
    throw error;
  }
}

export async function updateComponent(
  projectId: string,
  componentId: string,
  updates: z.infer<typeof updateComponentSchema>,
  organizationId: string,
) {
  if (!(await findComponent(projectId, componentId, organizationId)))
    return null;
  await assertLead(updates.leadUserId, organizationId);
  try {
    const component = await prisma.component.update({
      where: { id: componentId },
      data: updates,
      include: componentInclude,
    });
    return serializeComponent(component);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateComponentNameError();
    throw error;
  }
}

export async function deleteComponent(
  projectId: string,
  componentId: string,
  moveTo: string | null,
  organizationId: string,
) {
  if (!(await findComponent(projectId, componentId, organizationId)))
    return false;
  if (moveTo) {
    if (
      moveTo === componentId ||
      !(await findComponent(projectId, moveTo, organizationId))
    ) {
      throw new InvalidComponentInputError(
        "Choose another component from this project",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (moveTo) {
      const links = await tx.issueComponent.findMany({
        where: { componentId },
        select: { issueId: true },
      });
      await tx.issueComponent.createMany({
        data: links.map((link) => ({
          issueId: link.issueId,
          componentId: moveTo,
        })),
        skipDuplicates: true,
      });
    }
    await tx.component.delete({ where: { id: componentId } });
  });
  return true;
}
