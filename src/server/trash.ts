import prisma from "../../prisma/client";
import { recordAudit } from "./audit";
import { dispatchWebhook } from "./webhooks";
import { isSubtaskLevel } from "../app/data/workflow";
import { subtaskKindWhere } from "./workflows";
import {
  assertIssuePermission,
  assertProjectPermission,
  ProjectAccessError,
  type AccessUser,
} from "./projectAccess";
import type { WorkspaceActor } from "./issues";

/** Jira keeps trashed work items and projects for 60 days. */
export const TRASH_RETENTION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trashExpiresAt(deletedAt: Date) {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

/** Items deleted before this moment are due for permanent deletion. */
export function purgeCutoff(now: Date) {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);
}

export function daysUntilPurge(deletedAt: Date, now: Date) {
  return Math.max(
    0,
    Math.ceil((trashExpiresAt(deletedAt).getTime() - now.getTime()) / DAY_MS),
  );
}

/**
 * Who may move a work item to the trash: project admins, or anyone who can
 * edit the project and reported the item.
 */
export function canTrashIssue(
  creatorId: string | null,
  actorId: string,
  permissions: { canEdit: boolean; canAdmin: boolean },
) {
  return (
    permissions.canAdmin ||
    (permissions.canEdit && creatorId !== null && creatorId === actorId)
  );
}

export class TrashError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "TrashError";
  }
}

function auditActor(actor: { id: string; name: string }) {
  return { id: actor.id, name: actor.name };
}

/* ------------------------------------------------------------------ */
/* Work items                                                          */
/* ------------------------------------------------------------------ */

/**
 * Moves a work item (and its subtasks) to the trash. Other children (an
 * epic's stories) are detached, like Jira. Returns false when not found.
 */
export async function trashIssue(
  issueId: string,
  actor: WorkspaceActor,
  user: AccessUser,
) {
  const { issue, permissions } = await assertIssuePermission(
    issueId,
    user,
    actor.organizationId,
    "view",
  );
  if (!canTrashIssue(issue.creatorId, actor.id, permissions)) {
    throw new ProjectAccessError(
      permissions.canEdit
        ? "Only the reporter or a project administrator can delete this work item"
        : "You don't have permission to delete work in this project",
      403,
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { parentId: issue.id, deletedAt: null, AND: [subtaskKindWhere()] },
      data: { deletedAt: now, deletedById: actor.id },
    }),
    prisma.issue.updateMany({
      where: { parentId: issue.id, deletedAt: null, NOT: subtaskKindWhere() },
      data: { parentId: null },
    }),
    prisma.issue.update({
      where: { id: issue.id },
      data: { deletedAt: now, deletedById: actor.id },
    }),
  ]);

  await recordAudit({
    organizationId: actor.organizationId,
    actor: auditActor(actor),
    action: "issue.trashed",
    targetType: "issue",
    targetId: issue.id,
  });
  dispatchWebhook(actor.organizationId, "issue_deleted", { issueId: issue.id });
  return true;
}

/** Trashes many work items; each result says whether it worked. */
export async function trashIssues(
  issueIds: string[],
  actor: WorkspaceActor,
  user: AccessUser,
) {
  const results: { id: string; ok: boolean; deleted?: boolean; error?: string }[] = [];
  for (const id of issueIds) {
    try {
      await trashIssue(id, actor, user);
      results.push({ id, ok: true, deleted: true });
    } catch (error) {
      if (error instanceof ProjectAccessError) {
        results.push({ id, ok: false, error: error.message });
      } else {
        console.error(`Bulk delete failed for ${id}`, error);
        results.push({ id, ok: false, error: "Work item could not be deleted" });
      }
    }
  }
  return results;
}

export type TrashedIssue = {
  id: string;
  title: string;
  kind: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  expiresAt: string;
  subtaskCount: number;
};

/**
 * Trashed work items, newest first. Subtasks trashed together with their
 * parent are listed under it, not on their own.
 */
export async function listTrashedIssues(
  organizationId: string,
  options: { projectId?: string } = {},
): Promise<TrashedIssue[]> {
  const rows = await prisma.issue.findMany({
    where: {
      organizationId,
      deletedAt: { not: null },
      project: { deletedAt: null },
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
    select: {
      id: true,
      title: true,
      kind: true,
      parentId: true,
      deletedAt: true,
      deletedById: true,
      project: { select: { id: true, key: true, name: true } },
      parent: { select: { deletedAt: true } },
    },
    orderBy: { deletedAt: "desc" },
  });

  const trashedWithParent = (row: (typeof rows)[number]) =>
    row.parent?.deletedAt &&
    row.deletedAt &&
    row.parent.deletedAt.getTime() === row.deletedAt.getTime();
  const subtaskCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.parentId && trashedWithParent(row)) {
      subtaskCounts.set(row.parentId, (subtaskCounts.get(row.parentId) ?? 0) + 1);
    }
  }

  const userIds = [
    ...new Set(rows.map((row) => row.deletedById).filter(Boolean) as string[]),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  return rows
    .filter((row) => !trashedWithParent(row))
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      projectId: row.project.id,
      projectKey: row.project.key,
      projectName: row.project.name,
      deletedAt: row.deletedAt!.toISOString(),
      deletedBy: row.deletedById ? (usersById.get(row.deletedById) ?? null) : null,
      expiresAt: trashExpiresAt(row.deletedAt!).toISOString(),
      subtaskCount: subtaskCounts.get(row.id) ?? 0,
    }));
}

async function trashedIssue(issueId: string, organizationId: string) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId, deletedAt: { not: null } },
    select: {
      id: true,
      kind: true,
      projectId: true,
      deletedAt: true,
      parentId: true,
      parent: { select: { id: true, deletedAt: true } },
    },
  });
  if (!issue) throw new TrashError("This work item is not in the trash", 404);
  return issue;
}

/**
 * Restores a work item and the subtasks trashed with it. A subtask whose
 * parent is still in the trash (or was purged) cannot come back on its own.
 */
export async function restoreIssue(
  issueId: string,
  actor: WorkspaceActor,
  user: AccessUser,
) {
  const issue = await trashedIssue(issueId, actor.organizationId);
  await assertProjectPermission(issue.projectId, user, actor.organizationId, "admin");

  if (issue.parent?.deletedAt) {
    throw new TrashError(
      `Restore the parent work item ${issue.parent.id} first`,
      409,
    );
  }
  if (!issue.parentId && isSubtaskLevel(issue.kind)) {
    throw new TrashError(
      "This subtask's parent was permanently deleted, so it can't be restored",
      409,
    );
  }

  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { parentId: issue.id, deletedAt: issue.deletedAt },
      data: { deletedAt: null, deletedById: null },
    }),
    prisma.issue.update({
      where: { id: issue.id },
      data: { deletedAt: null, deletedById: null },
    }),
  ]);
  await recordAudit({
    organizationId: actor.organizationId,
    actor: auditActor(actor),
    action: "issue.restored",
    targetType: "issue",
    targetId: issue.id,
  });
  return true;
}

/** Permanently deletes a trashed work item and the subtasks trashed with it. */
export async function purgeIssue(
  issueId: string,
  actor: WorkspaceActor,
  user: AccessUser,
) {
  const issue = await trashedIssue(issueId, actor.organizationId);
  await assertProjectPermission(issue.projectId, user, actor.organizationId, "admin");
  await hardDeleteIssues([issue.id]);
  await recordAudit({
    organizationId: actor.organizationId,
    actor: auditActor(actor),
    action: "issue.purged",
    targetType: "issue",
    targetId: issue.id,
  });
  return true;
}

/** Hard-deletes trashed issues plus any trashed children of them. */
async function hardDeleteIssues(ids: string[]) {
  if (ids.length === 0) return 0;
  const children = await prisma.issue.findMany({
    where: { parentId: { in: ids }, deletedAt: { not: null } },
    select: { id: true },
  });
  const all = [...new Set([...ids, ...children.map((child) => child.id)])];
  await prisma.$transaction([
    prisma.issueView.deleteMany({ where: { issueId: { in: all } } }),
    prisma.issue.deleteMany({ where: { id: { in: all } } }),
  ]);
  return all.length;
}

/* ------------------------------------------------------------------ */
/* Archive                                                             */
/* ------------------------------------------------------------------ */

/** Archives or unarchives a work item and its subtasks (project admins). */
export async function setIssueArchived(
  issueId: string,
  archived: boolean,
  actor: WorkspaceActor,
  user: AccessUser,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: actor.organizationId, deletedAt: null },
    select: { id: true, projectId: true, archivedAt: true, title: true },
  });
  if (!issue) throw new ProjectAccessError("Issue not found", 404);
  const permissions = await assertProjectPermission(
    issue.projectId,
    user,
    actor.organizationId,
    "view",
    "Issue not found",
  );
  if (!permissions.canAdmin) {
    throw new ProjectAccessError(
      "Only project administrators can archive work items",
      403,
    );
  }
  const archivedAt = archived ? new Date() : null;
  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { parentId: issue.id, deletedAt: null, AND: [subtaskKindWhere()] },
      data: { archivedAt },
    }),
    prisma.issue.update({ where: { id: issue.id }, data: { archivedAt } }),
    prisma.activity.create({
      data: {
        issueId: issue.id,
        type: "ARCHIVE_CHANGED",
        description: archived ? "archived the work item" : "unarchived the work item",
        actor: actor.name,
        actorId: actor.id,
      },
    }),
  ]);
  await recordAudit({
    organizationId: actor.organizationId,
    actor: auditActor(actor),
    action: archived ? "issue.archived" : "issue.unarchived",
    targetType: "issue",
    targetId: issue.id,
  });
  dispatchWebhook(actor.organizationId, "issue_updated", {
    issue: { id: issue.id, title: issue.title, archived },
    changes: ["archived"],
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export type TrashedProject = {
  id: string;
  key: string;
  name: string;
  issueCount: number;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  expiresAt: string;
};

export async function listTrashedProjects(
  organizationId: string,
): Promise<TrashedProject[]> {
  const projects = await prisma.project.findMany({
    where: { organizationId, deletedAt: { not: null } },
    select: {
      id: true,
      key: true,
      name: true,
      deletedAt: true,
      _count: { select: { issues: true } },
    },
    orderBy: { deletedAt: "desc" },
  });
  // Projects have no deletedById column; the audit log knows who did it.
  const audits = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: "project.trashed",
      targetId: { in: projects.map((project) => project.id) },
    },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, actorId: true, actorName: true },
  });
  const deletedBy = new Map<string, { id: string; name: string }>();
  for (const entry of audits) {
    if (entry.targetId && !deletedBy.has(entry.targetId)) {
      deletedBy.set(entry.targetId, {
        id: entry.actorId ?? "",
        name: entry.actorName,
      });
    }
  }
  return projects.map((project) => ({
    id: project.id,
    key: project.key,
    name: project.name,
    issueCount: project._count.issues,
    deletedAt: project.deletedAt!.toISOString(),
    deletedBy: deletedBy.get(project.id) ?? null,
    expiresAt: trashExpiresAt(project.deletedAt!).toISOString(),
  }));
}

export async function restoreProject(projectId: string, actor: WorkspaceActor) {
  const result = await prisma.project.updateMany({
    where: {
      id: projectId,
      organizationId: actor.organizationId,
      deletedAt: { not: null },
    },
    data: { deletedAt: null },
  });
  if (result.count === 0) {
    throw new TrashError("This project is not in the trash", 404);
  }
  await recordAudit({
    organizationId: actor.organizationId,
    actor: auditActor(actor),
    action: "project.restored",
    targetType: "project",
    targetId: projectId,
  });
  return true;
}

export async function purgeProject(projectId: string, actor: WorkspaceActor) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: actor.organizationId,
      deletedAt: { not: null },
    },
    select: { id: true, key: true, name: true },
  });
  if (!project) throw new TrashError("This project is not in the trash", 404);
  await hardDeleteProject(project.id);
  await recordAudit({
    organizationId: actor.organizationId,
    actor: auditActor(actor),
    action: "project.purged",
    targetType: "project",
    targetId: project.id,
    details: { key: project.key, name: project.name },
  });
  return true;
}

async function hardDeleteProject(projectId: string) {
  const issues = await prisma.issue.findMany({
    where: { projectId },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.issueView.deleteMany({
      where: { issueId: { in: issues.map((issue) => issue.id) } },
    }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);
}

/** Cron: permanently deletes trashed items older than the retention window. */
export async function purgeExpiredTrash(now = new Date()) {
  const cutoff = purgeCutoff(now);
  const projects = await prisma.project.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, key: true, name: true, organizationId: true },
  });
  for (const project of projects) {
    await hardDeleteProject(project.id);
    await recordAudit({
      organizationId: project.organizationId,
      actor: null,
      action: "project.purged",
      targetType: "project",
      targetId: project.id,
      details: { key: project.key, name: project.name, automatic: true },
    });
  }

  const issues = await prisma.issue.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, organizationId: true },
  });
  const purgedIssues = await hardDeleteIssues(issues.map((issue) => issue.id));
  const byOrg = new Map<string, string[]>();
  for (const issue of issues) {
    byOrg.set(issue.organizationId, [...(byOrg.get(issue.organizationId) ?? []), issue.id]);
  }
  for (const [organizationId, ids] of byOrg) {
    await recordAudit({
      organizationId,
      actor: null,
      action: "issue.purged",
      targetType: "issue",
      details: { issueIds: ids.slice(0, 200), count: ids.length, automatic: true },
    });
  }
  return { projects: projects.length, issues: purgedIssues, cutoff: cutoff.toISOString() };
}
