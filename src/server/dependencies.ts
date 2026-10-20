import prisma from "../../prisma/client";
import { visibleIssueWhere, type AccessUser } from "./projectAccess";

export type Dependency = { blockerId: string; blockedId: string };

/**
 * "Blocks" links between work items of the given projects, for the
 * timeline's dependency arrows. Links are stored once in the BLOCKS
 * direction (the source blocks the target); both ends must be visible to
 * the viewer, so asking for a project they can't see returns nothing from it.
 */
export async function listDependencies(
  projectIds: string[],
  user: AccessUser,
  organizationId: string,
): Promise<Dependency[]> {
  if (projectIds.length === 0) return [];
  const visible = visibleIssueWhere(user, organizationId);
  const inProjects = { ...visible, projectId: { in: projectIds } };
  const links = await prisma.issueLink.findMany({
    where: {
      type: "BLOCKS",
      source: inProjects,
      target: inProjects,
    },
    select: { sourceId: true, targetId: true },
  });
  return links.map((link) => ({
    blockerId: link.sourceId,
    blockedId: link.targetId,
  }));
}

export function listProjectDependencies(
  projectId: string,
  user: AccessUser,
  organizationId: string,
) {
  return listDependencies([projectId], user, organizationId);
}
