import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  type SavedView,
  type SavedViewInput,
  type SavedViewPriority,
  type SavedViewSort,
  type SavedViewStatus,
} from "../app/data/issues";
import { UnknownLabelError, type WorkspaceActor } from "./issues";
import { canViewFilter, parseShares } from "../app/data/filters";
import { filterAudience } from "./filters";
import type { AccessUser } from "./projectAccess";

/** A saved view plus ownership info the Filters directory needs. */
export type SavedFilter = SavedView & { isMine: boolean };

type StoredSavedView = {
  id: string;
  name: string;
  owner: string;
  query: string;
  status: string;
  priority: string;
  assignee: string;
  sort: string;
  labelId: string | null;
  jql: string | null;
  userId: string | null;
};

function serializeSavedView(
  view: StoredSavedView,
  currentUserId?: string,
): SavedFilter {
  return {
    id: view.id,
    name: view.name,
    owner: view.owner,
    query: view.query,
    status: view.status as SavedViewStatus,
    priority: view.priority as SavedViewPriority,
    assignee: view.assignee,
    sort: view.sort as SavedViewSort,
    labelId: view.labelId,
    jql: view.jql,
    isSystem: view.userId === null,
    isMine: !!currentUserId && view.userId === currentUserId,
  };
}

/**
 * Own + system views by default; `all` adds other members' filters that are
 * shared with the viewer (never their private ones).
 */
export async function listSavedViews(
  user: AccessUser,
  organizationId: string,
  options: { all?: boolean } = {},
) {
  const views = await prisma.savedView.findMany({
    where: options.all
      ? { organizationId }
      : { organizationId, OR: [{ userId: user.id }, { userId: null }] },
    orderBy: [{ owner: "asc" }, { name: "asc" }],
  });
  const audience = options.all ? await filterAudience(user, organizationId) : null;

  return views
    .filter(
      (view) =>
        !audience ||
        canViewFilter(
          {
            ownerId: view.userId,
            viewers: parseShares(view.viewers),
            editors: parseShares(view.editors),
          },
          audience,
        ),
    )
    .map((view) => serializeSavedView(view, user.id));
}

export type CreateSavedViewInput =
  | (SavedViewInput & { jql?: string | null })
  | { name: string; jql: string };

function withDefaults(input: CreateSavedViewInput): SavedViewInput & { jql: string | null } {
  if ("status" in input) {
    return { ...input, jql: input.jql ?? null };
  }
  return {
    name: input.name,
    query: "",
    status: "ALL",
    priority: "ALL",
    assignee: "ALL",
    sort: "NEWEST",
    labelId: null,
    jql: input.jql,
  };
}

function rethrowDuplicate(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new DuplicateSavedViewError();
  }
  throw error;
}

export async function createSavedView(
  rawInput: CreateSavedViewInput,
  actor: WorkspaceActor,
) {
  const input = withDefaults(rawInput);
  if (input.labelId) {
    const labelExists = await prisma.label.count({
      where: {
        id: input.labelId,
        organizationId: actor.organizationId,
      },
    });
    if (!labelExists) throw new UnknownLabelError();
  }

  try {
    const view = await prisma.savedView.create({
      data: {
        ...input,
        owner: actor.name,
        userId: actor.id,
        organizationId: actor.organizationId,
      },
    });
    return serializeSavedView(view, actor.id);
  } catch (error) {
    rethrowDuplicate(error);
  }
}

export async function updateSavedView(
  id: string,
  updates: { name?: string; jql?: string | null },
  userId: string,
  organizationId: string,
) {
  const existing = await prisma.savedView.findFirst({
    where: { id, userId, organizationId },
    select: { id: true },
  });
  if (!existing) return null;

  try {
    const view = await prisma.savedView.update({
      where: { id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.jql !== undefined ? { jql: updates.jql } : {}),
      },
    });
    return serializeSavedView(view, userId);
  } catch (error) {
    rethrowDuplicate(error);
  }
}

export async function deleteSavedView(
  id: string,
  userId: string,
  organizationId: string,
) {
  const result = await prisma.savedView.deleteMany({
    where: {
      id,
      userId,
      organizationId,
    },
  });

  return result.count === 1;
}

export class DuplicateSavedViewError extends Error {
  constructor() {
    super("A saved view with this name already exists");
    this.name = "DuplicateSavedViewError";
  }
}
