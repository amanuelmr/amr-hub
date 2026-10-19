import { z } from "zod";
import prisma from "../../prisma/client";
import {
  DEFAULT_BOARD_ID,
  parseBoardConfig,
  type ProjectBoard,
} from "../app/data/projects";
import { parseJql } from "../app/data/jql";
import { boardConfigSchema } from "./projectSchemas";

export class BoardInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardInputError";
  }
}

const filterJqlSchema = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((value) => (value ? value : null))
  .refine((value) => !value || parseJql(value, undefined, { customFields: "any" }).ok, {
    message: "The board filter is not valid JQL",
  });

export const createBoardSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    filterJql: filterJqlSchema.optional(),
  })
  .strict();

export const updateBoardSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    filterJql: filterJqlSchema.optional(),
    config: boardConfigSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one board field to update",
  });

async function findProject(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, key: true, boardConfig: true },
  });
}

/** The default board (the project's own config) followed by extra boards. */
export async function listBoards(
  projectId: string,
  organizationId: string,
): Promise<ProjectBoard[] | null> {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const extra = await prisma.board.findMany({
    where: { projectId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return [
    {
      id: DEFAULT_BOARD_ID,
      name: `${project.key} board`,
      filterJql: null,
      isDefault: true,
      config: parseBoardConfig(project.boardConfig),
    },
    ...extra.map((board) => ({
      id: board.id,
      name: board.name,
      filterJql: board.filterJql,
      isDefault: false,
      config: parseBoardConfig(board.config),
    })),
  ];
}

/** New boards start from the default board's columns and settings. */
export async function createBoard(
  projectId: string,
  input: z.infer<typeof createBoardSchema>,
  organizationId: string,
) {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const count = await prisma.board.count({ where: { projectId } });
  if (count >= 20) throw new BoardInputError("A project can have at most 21 boards");
  const board = await prisma.board.create({
    data: {
      projectId,
      name: input.name,
      filterJql: input.filterJql ?? null,
      config: JSON.stringify(parseBoardConfig(project.boardConfig)),
      position: count,
    },
  });
  return board.id;
}

export async function updateBoard(
  projectId: string,
  boardId: string,
  input: z.infer<typeof updateBoardSchema>,
  organizationId: string,
) {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  if (boardId === DEFAULT_BOARD_ID) {
    if (input.name !== undefined || input.filterJql !== undefined) {
      throw new BoardInputError(
        "The default board takes the project's name and shows all its work",
      );
    }
    if (input.config) {
      await prisma.project.update({
        where: { id: projectId },
        data: { boardConfig: JSON.stringify(input.config) },
      });
    }
    return true;
  }
  const result = await prisma.board.updateMany({
    where: { id: boardId, projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.filterJql !== undefined ? { filterJql: input.filterJql } : {}),
      ...(input.config ? { config: JSON.stringify(input.config) } : {}),
    },
  });
  return result.count > 0 ? true : null;
}

export async function deleteBoard(
  projectId: string,
  boardId: string,
  organizationId: string,
) {
  if (boardId === DEFAULT_BOARD_ID) {
    throw new BoardInputError("The default board can't be deleted");
  }
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const result = await prisma.board.deleteMany({ where: { id: boardId, projectId } });
  return result.count > 0 ? true : null;
}
