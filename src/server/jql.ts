import prisma from "../../prisma/client";
import type { Cycle, SprintState } from "../app/data/issues";
import {
  projectsByKeyFrom,
  searchIssuesWithJql,
  type JqlContext,
  type JqlError,
} from "../app/data/jql";
import { listOrganizationMembers } from "./members";
import { issueInclude, serializeIssue } from "./issues";
import { listOrganizationWorkflows } from "./workflows";
import { listAllCustomFields } from "./customFields";
import {
  jqlMentionsArchived,
  visibleIssueWhere,
  visibleProjectWhere,
  type AccessUser,
} from "./projectAccess";

export class JqlQueryError extends Error {
  constructor(public detail: JqlError) {
    super(detail.message);
    this.name = "JqlQueryError";
  }
}

export const MAX_SEARCH_LIMIT = 500;

/** Builds the evaluation context for an org: projects, sprints, members, current member. */
export async function loadJqlContext(
  organizationId: string,
  userId: string,
  now = new Date(),
  viewer?: AccessUser,
): Promise<JqlContext> {
  const [projects, cycles, members, membership, workflows, customFields] = await Promise.all([
    prisma.project.findMany({
      // Hidden projects resolve like unknown ones, so their keys don't leak.
      where: viewer
        ? visibleProjectWhere(viewer, organizationId, { includeArchived: true })
        : { organizationId, deletedAt: null },
      select: { id: true, key: true, name: true },
    }),
    prisma.cycle.findMany({ where: { organizationId } }),
    listOrganizationMembers(organizationId),
    prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true },
    }),
    listOrganizationWorkflows(organizationId),
    listAllCustomFields(organizationId),
  ]);

  return {
    now,
    currentUserId: userId,
    currentMemberId: membership?.id ?? null,
    projectsByKey: projectsByKeyFrom(projects),
    workflows,
    members,
    customFields,
    cycles: cycles.map(
      (cycle): Cycle => ({
        id: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate.toISOString(),
        endDate: cycle.endDate.toISOString(),
        capacity: cycle.capacity,
        projectId: cycle.projectId,
        goal: cycle.goal,
        state: cycle.state as SprintState,
      }),
    ),
  };
}

/**
 * Runs JQL over the issues the user can see. Archived work items (and
 * archived projects) are only searched when the query mentions `archived`.
 */
export async function searchOrganizationIssues(
  organizationId: string,
  user: AccessUser,
  options: { jql: string; limit?: number; cursor?: string | null },
) {
  const archived = jqlMentionsArchived(options.jql);
  const [context, stored] = await Promise.all([
    loadJqlContext(organizationId, user.id, new Date(), user),
    prisma.issue.findMany({
      where: visibleIssueWhere(user, organizationId, {
        includeArchived: archived,
        includeArchivedProjects: archived,
      }),
      include: issueInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const result = searchIssuesWithJql(stored.map(serializeIssue), options.jql, context);
  if (!result.ok) throw new JqlQueryError(result.error);

  const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_SEARCH_LIMIT);
  const offset = Math.max(Number.parseInt(options.cursor ?? "0", 10) || 0, 0);
  const page = result.issues.slice(offset, offset + limit);
  const nextOffset = offset + page.length;

  return {
    issues: page,
    total: result.issues.length,
    nextCursor: nextOffset < result.issues.length ? String(nextOffset) : null,
  };
}
