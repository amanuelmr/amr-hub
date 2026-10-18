import prisma from "../../prisma/client";
import { visibleIssueWhere, type AccessUser } from "./projectAccess";

export type Dependency = { blockerId: string; blockedId: string };

/**
 * "Blocks" links between work items of one project, for the timeline's
 * dependency arrows. Links are stored once in the BLOCKS direction (the
 * source blocks the target); both ends must be visible to the viewer.
 */
export async function listProjectDependencies(
  projectId: string,
  user: AccessUser,
  organizationId: string,
): Promise<Dependency[]> {
  const visible = visibleIssueWhere(user, organizationId);
  const links = await prisma.issueLink.findMany({
    where: {
      type: "BLOCKS",
      source: { ...visible, projectId },
      target: { ...visible, projectId },
    },
    select: { sourceId: true, targetId: true },
  });
  return links.map((link) => ({
    blockerId: link.sourceId,
    blockedId: link.targetId,
  }));
}
