import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import prisma from "../../prisma/client";
import {
  PROJECT_ACCESS_LEVELS,
  PROJECT_ROLES,
  type ProjectAccessLevel,
  type ProjectPermissions,
  type ProjectRole,
} from "../app/data/projects";
import { canSeeSecuredIssue, type SecurityViewer } from "../app/data/issueSecurity";

export { PROJECT_ACCESS_LEVELS, PROJECT_ROLES };
export type { ProjectAccessLevel, ProjectPermissions, ProjectRole };

/**
 * Jira team-managed project access.
 *
 * - OPEN: every workspace member can view and edit (workspace viewers view).
 * - LIMITED: everyone can view, only project members can edit.
 * - PRIVATE: only project members (and workspace owners) can see it at all.
 *
 * Project roles: ADMIN manages settings, people, workflow, automation and
 * deletion; MEMBER creates and edits work; VIEWER reads. Workspace owners are
 * implicit admins of every project and the project lead is an implicit
 * ADMIN. A workspace viewer never edits, whatever their project role.
 */

/** The signed-in user as access checks see them: id + workspace role. */
export type AccessUser = { id: string; role: string };

export type PermissionNeed = "view" | "comment" | "edit" | "admin";

export const NO_PERMISSIONS: ProjectPermissions = {
  canView: false,
  canComment: false,
  canEdit: false,
  canAdmin: false,
};

export function isProjectAccessLevel(value: unknown): value is ProjectAccessLevel {
  return (PROJECT_ACCESS_LEVELS as readonly unknown[]).includes(value);
}

export function isProjectRole(value: unknown): value is ProjectRole {
  return (PROJECT_ROLES as readonly unknown[]).includes(value);
}

export type PermissionInput = {
  accessLevel: string;
  workspaceRole: string;
  /** The user's ProjectMember role, or null when they are not a project member. */
  projectRole: string | null;
  isLead: boolean;
  archived?: boolean;
  deleted?: boolean;
};

/** The project role that applies, counting the lead as an implicit admin. */
export function effectiveProjectRole(
  projectRole: string | null,
  isLead: boolean,
): ProjectRole | null {
  if (isLead) return "ADMIN";
  return isProjectRole(projectRole) ? projectRole : null;
}

/** Pure access rules: who can view, edit and administer a project. */
export function resolveProjectPermissions(input: PermissionInput): ProjectPermissions {
  if (input.deleted) return NO_PERMISSIONS;
  const accessLevel = isProjectAccessLevel(input.accessLevel)
    ? input.accessLevel
    : "PRIVATE";

  let permissions: ProjectPermissions;
  if (input.workspaceRole === "owner") {
    permissions = { canView: true, canComment: true, canEdit: true, canAdmin: true };
  } else {
    const role = effectiveProjectRole(input.projectRole, input.isLead);
    const workspaceViewer = input.workspaceRole === "viewer";
    const canView = accessLevel !== "PRIVATE" || role !== null;
    const memberCanEdit = role === "ADMIN" || role === "MEMBER";
    const canEdit =
      canView &&
      !workspaceViewer &&
      (accessLevel === "OPEN" ? role !== "VIEWER" : memberCanEdit);
    const canAdmin = canView && !workspaceViewer && role === "ADMIN";
    const canComment = canView && !workspaceViewer;
    permissions = { canView, canComment, canEdit, canAdmin };
  }

  // An archived project is read-only; its admins can still restore it.
  if (input.archived) {
    permissions = { ...permissions, canComment: false, canEdit: false };
  }
  return permissions;
}

export function hasPermission(permissions: ProjectPermissions, need: PermissionNeed) {
  if (need === "admin") return permissions.canAdmin;
  if (need === "edit") return permissions.canEdit;
  if (need === "comment") return permissions.canComment;
  return permissions.canView;
}

/** Projects the user may see (never deleted ones; archived only when asked). */
export function visibleProjectWhere(
  user: AccessUser,
  organizationId: string,
  options: { includeArchived?: boolean } = {},
): Prisma.ProjectWhereInput {
  return {
    organizationId,
    deletedAt: null,
    ...(options.includeArchived ? {} : { archivedAt: null }),
    ...(user.role === "owner"
      ? {}
      : {
          OR: [
            { accessLevel: { not: "PRIVATE" } },
            { leadUserId: user.id },
            { members: { some: { userId: user.id } } },
          ],
        }),
  };
}

export type IssueVisibilityOptions = {
  /** Include archived work items (default: excluded, like Jira search). */
  includeArchived?: boolean;
  /** Include work items of archived projects (default: excluded). */
  includeArchivedProjects?: boolean;
};

/**
 * The central filter for every issue query: same workspace, not in the
 * trash, in a project the user can see. Spread it into a where clause (it
 * only sets organizationId, deletedAt, archivedAt and project).
 */
export function visibleIssueWhere(
  user: AccessUser,
  organizationId: string,
  options: IssueVisibilityOptions = {},
): Prisma.IssueWhereInput {
  return {
    organizationId,
    deletedAt: null,
    ...(options.includeArchived ? {} : { archivedAt: null }),
    project: visibleProjectWhere(user, organizationId, {
      includeArchived: options.includeArchivedProjects,
    }),
    ...(user.role === "owner" ? {} : { AND: [issueSecurityWhere(user)] }),
  };
}

/**
 * Items whose security level the user passes (mirrors canSeeSecuredIssue):
 * unrestricted items, their own items, and levels their project role meets.
 */
export function issueSecurityWhere(user: AccessUser): Prisma.IssueWhereInput {
  if (user.role === "owner") return {};
  return {
    OR: [
      { securityLevel: null },
      { creatorId: user.id },
      { assignee: { userId: user.id } },
      {
        securityLevel: "MEMBERS",
        project: { OR: [{ leadUserId: user.id }, { members: { some: { userId: user.id } } }] },
      },
      {
        securityLevel: "ADMINS",
        project: {
          OR: [
            { leadUserId: user.id },
            { members: { some: { userId: user.id, role: "ADMIN" } } },
          ],
        },
      },
    ],
  };
}

/** The viewer's standing on a project, for issue security decisions. */
export async function securityViewerFor(
  projectId: string,
  user: AccessUser,
): Promise<SecurityViewer> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leadUserId: true, members: { where: { userId: user.id }, select: { role: true } } },
  });
  return {
    userId: user.id,
    workspaceRole: user.role,
    projectRole: project?.members[0]?.role ?? null,
    isLead: project?.leadUserId === user.id,
  };
}

/** Issue filter for system jobs (automation, digests): live, unarchived issues. */
export function liveIssueWhere(organizationId?: string): Prisma.IssueWhereInput {
  return {
    ...(organizationId ? { organizationId } : {}),
    deletedAt: null,
    archivedAt: null,
    project: { deletedAt: null, archivedAt: null },
  };
}

/** Does a JQL query ask about archived work items (so they should be loaded)? */
export function jqlMentionsArchived(jql: string) {
  return /\barchived\b/i.test(jql);
}

export class ProjectAccessError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404,
  ) {
    super(message);
    this.name = "ProjectAccessError";
  }
}

export function deniedMessage(need: PermissionNeed, archived = false) {
  if (need === "admin") return "Only project administrators can do this";
  if (archived) return "This project is archived and read-only";
  if (need === "comment") return "You don't have permission to comment in this project";
  return "You don't have permission to edit work in this project";
}

/** Maps a ProjectAccessError to its response (404 hides, 403 forbids). */
export function accessErrorResponse(error: unknown) {
  if (!(error instanceof ProjectAccessError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}

type ProjectAccessRow = {
  id: string;
  accessLevel: string;
  leadUserId: string | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  members: { role: string }[];
};

function permissionsFor(project: ProjectAccessRow, user: AccessUser) {
  return resolveProjectPermissions({
    accessLevel: project.accessLevel,
    workspaceRole: user.role,
    projectRole: project.members[0]?.role ?? null,
    isLead: project.leadUserId === user.id,
    archived: project.archivedAt !== null,
    deleted: project.deletedAt !== null,
  });
}

function accessSelect(userId: string) {
  return {
    id: true,
    accessLevel: true,
    leadUserId: true,
    archivedAt: true,
    deletedAt: true,
    members: { where: { userId }, select: { role: true } },
  } satisfies Prisma.ProjectSelect;
}

/** The user's permissions on one project (all false when it is not found). */
export async function projectPermission(
  projectId: string,
  user: AccessUser,
  organizationId: string,
): Promise<ProjectPermissions & { archived: boolean }> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: accessSelect(user.id),
  });
  if (!project) return { ...NO_PERMISSIONS, archived: false };
  return { ...permissionsFor(project, user), archived: project.archivedAt !== null };
}

/** Permissions for every project in the workspace the user can see, keyed by id. */
export async function projectPermissionMap(
  user: AccessUser,
  organizationId: string,
): Promise<Map<string, ProjectPermissions>> {
  const projects = await prisma.project.findMany({
    where: { organizationId, deletedAt: null },
    select: accessSelect(user.id),
  });
  const map = new Map<string, ProjectPermissions>();
  for (const project of projects) {
    const permissions = permissionsFor(project, user);
    if (permissions.canView) map.set(project.id, permissions);
  }
  return map;
}

/** Ids of the projects the user can see (archived included). */
export async function accessibleProjectIds(
  organizationId: string,
  user: AccessUser,
  options: { includeArchived?: boolean } = { includeArchived: true },
) {
  const projects = await prisma.project.findMany({
    where: visibleProjectWhere(user, organizationId, options),
    select: { id: true },
  });
  return projects.map((project) => project.id);
}

/** Ids of the projects the user can create and edit work in. */
export async function editableProjectIds(organizationId: string, user: AccessUser) {
  const map = await projectPermissionMap(user, organizationId);
  return [...map].filter(([, value]) => value.canEdit).map(([id]) => id);
}

/**
 * Throws ProjectAccessError: 404 when the user cannot see the project (it is
 * hidden, not forbidden), 403 when they can see it but lack `need`.
 */
export async function assertProjectPermission(
  projectId: string,
  user: AccessUser,
  organizationId: string,
  need: PermissionNeed,
  notFoundMessage = "Project not found",
) {
  const permissions = await projectPermission(projectId, user, organizationId);
  if (!permissions.canView) throw new ProjectAccessError(notFoundMessage, 404);
  if (!hasPermission(permissions, need)) {
    throw new ProjectAccessError(deniedMessage(need, permissions.archived), 403);
  }
  return permissions;
}

/**
 * Checks access to an issue through its project. Trashed issues count as
 * missing. Archived issues stay reachable by key.
 */
export async function assertIssuePermission(
  issueId: string,
  user: AccessUser,
  organizationId: string,
  need: PermissionNeed,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      creatorId: true,
      archivedAt: true,
      securityLevel: true,
      assignee: { select: { userId: true } },
    },
  });
  if (!issue) throw new ProjectAccessError("Issue not found", 404);
  const permissions = await assertProjectPermission(
    issue.projectId,
    user,
    organizationId,
    need,
    "Issue not found",
  );
  // An item above the viewer's security level reads as missing.
  if (
    issue.securityLevel &&
    !canSeeSecuredIssue(
      { ...issue, assigneeUserId: issue.assignee?.userId ?? null },
      await securityViewerFor(issue.projectId, user),
    )
  ) {
    throw new ProjectAccessError("Issue not found", 404);
  }
  return { issue, permissions };
}

/** Route helper: null when allowed, otherwise the 404/403 response. */
export async function projectGuard(
  session: AccessSession,
  projectId: string,
  need: PermissionNeed,
) {
  try {
    await assertProjectPermission(
      projectId,
      accessUserFromSession(session),
      session.workspace.id,
      need,
    );
    return null;
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** Route helper: null when allowed, otherwise the 404/403 response. */
export async function issueGuard(
  session: AccessSession,
  issueId: string,
  need: PermissionNeed,
) {
  try {
    await assertIssuePermission(
      issueId,
      accessUserFromSession(session),
      session.workspace.id,
      need,
    );
    return null;
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** The slice of a workspace session the access helpers need. */
export type AccessSession = {
  user: { id: string };
  workspace: { id: string; role: string };
};

export function accessUserFromSession(session: AccessSession): AccessUser {
  return { id: session.user.id, role: session.workspace.role };
}

/**
 * Can this workspace user be mentioned or assigned on the project? On a
 * private project they must be a project member, the lead or an owner.
 */
export function canBeAssignedOnProject(
  project: { accessLevel: string; leadUserId: string | null; memberUserIds: string[] },
  candidate: { userId: string; workspaceRole: string },
) {
  if (project.accessLevel !== "PRIVATE") return true;
  return (
    candidate.workspaceRole === "owner" ||
    project.leadUserId === candidate.userId ||
    project.memberUserIds.includes(candidate.userId)
  );
}

/** Workspace user ids who can see a project (for assignee/mention checks). */
export async function projectAudienceUserIds(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      accessLevel: true,
      leadUserId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) return null;
  if (project.accessLevel !== "PRIVATE") return null; // everyone
  const owners = await prisma.member.findMany({
    where: { organizationId, role: "owner" },
    select: { userId: true },
  });
  return new Set([
    ...owners.map((owner) => owner.userId),
    ...project.members.map((member) => member.userId),
    ...(project.leadUserId ? [project.leadUserId] : []),
  ]);
}

/**
 * Checks an actor's project permission. System actors (automation, no
 * workspace role) are trusted and skip the check.
 */
export async function assertActorPermission(
  actor: { id: string; role?: string; organizationId: string },
  projectId: string,
  need: PermissionNeed,
  notFoundMessage = "Project not found",
) {
  if (!actor.role) return;
  await assertProjectPermission(
    projectId,
    { id: actor.id, role: actor.role },
    actor.organizationId,
    need,
    notFoundMessage,
  );
}
