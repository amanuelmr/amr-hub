import prisma from "../../prisma/client";
import { projectPermission, type AccessUser } from "./projectAccess";
import type { Cycle, Issue } from "../app/data/issues";
import {
  buildBurndown,
  buildSprintReport,
  type BurndownSeries,
  type SprintReport,
} from "../app/data/reports";
import { serializeCycle } from "./cycles";
import { issueInclude, serializeIssue } from "./issues";

export type SprintReportPayload = {
  cycle: Cycle;
  burndown: BurndownSeries;
  report: SprintReport;
};

function lean(items: SprintReport["completed"]) {
  return items.map((item) => ({
    ...item,
    issue: { ...item.issue, comments: [], activity: [] } satisfies Issue,
  }));
}

/**
 * Loads every issue that is, or ever was, in the sprint (current membership or
 * a CYCLE_CHANGED row naming it) and rebuilds the sprint series from history.
 */
export async function getSprintReport(
  cycleId: string,
  organizationId: string,
  viewer: AccessUser,
  now = new Date(),
): Promise<SprintReportPayload | null> {
  const stored = await prisma.cycle.findFirst({
    where: { id: cycleId, organizationId },
  });
  if (!stored) return null;
  const permissions = await projectPermission(stored.projectId, viewer, organizationId);
  if (!permissions.canView) return null;

  const [projectCycles, storedIssues] = await Promise.all([
    prisma.cycle.findMany({
      where: { organizationId, projectId: stored.projectId },
      orderBy: { startDate: "asc" },
    }),
    prisma.issue.findMany({
      where: {
        organizationId,
        projectId: stored.projectId,
        deletedAt: null,
        OR: [
          { cycleId: stored.id },
          {
            activity: {
              some: {
                type: "CYCLE_CHANGED",
                description: { contains: stored.name },
              },
            },
          },
        ],
      },
      include: issueInclude,
      orderBy: { sequence: "asc" },
    }),
  ]);

  const cycle = serializeCycle(stored);
  const cycles = projectCycles.map(serializeCycle);
  const issues = storedIssues.map(serializeIssue);
  const report = buildSprintReport(cycle, issues, cycles, now);

  return {
    cycle,
    burndown: buildBurndown(cycle, issues, cycles, now),
    report: {
      ...report,
      completed: lean(report.completed),
      notCompleted: lean(report.notCompleted),
      removed: lean(report.removed),
      addedAfterStart: lean(report.addedAfterStart),
    },
  };
}
