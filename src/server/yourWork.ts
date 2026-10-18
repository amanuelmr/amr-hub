import prisma from "../../prisma/client";
import type { Issue } from "../app/data/issues";
import { issueInclude, serializeIssue } from "./issues";
import {
  visibleIssueWhere,
  visibleProjectWhere,
  type AccessUser,
} from "./projectAccess";

const WORKED_ON_DAYS = 30;
const DAY_MS = 86_400_000;

export type WorkedOnReason = "created" | "commented" | "logged work" | "updated";

export type YourWork = {
  recent: { issue: Issue; viewedAt: string }[];
  workedOn: { issue: Issue; lastActivityAt: string; reason: WorkedOnReason }[];
  assigned: Issue[];
  starredProjectIds: string[];
};

async function loadIssues(ids: string[], organizationId: string, user: AccessUser) {
  if (ids.length === 0) return new Map<string, Issue>();
  const issues = await prisma.issue.findMany({
    where: { id: { in: ids }, ...visibleIssueWhere(user, organizationId) },
    include: issueInclude,
  });
  return new Map(issues.map((issue) => [issue.id, serializeIssue(issue)]));
}

/** Jira "For you": recently viewed, worked on (30 days), assigned, starred projects. */
export async function getYourWork(
  user: AccessUser,
  organizationId: string,
): Promise<YourWork> {
  const userId = user.id;
  const since = new Date(Date.now() - WORKED_ON_DAYS * DAY_MS);
  const inOrg = visibleIssueWhere(user, organizationId);

  const [views, activity, comments, worklogs, created, assignedRows, stars] =
    await Promise.all([
      prisma.issueView.findMany({
        where: { userId },
        orderBy: { viewedAt: "desc" },
        take: 60,
      }),
      prisma.activity.findMany({
        where: { actorId: userId, createdAt: { gte: since }, issue: inOrg },
        select: { issueId: true, createdAt: true },
      }),
      prisma.comment.findMany({
        where: { authorId: userId, createdAt: { gte: since }, issue: inOrg },
        select: { issueId: true, createdAt: true },
      }),
      prisma.worklog.findMany({
        where: { userId, createdAt: { gte: since }, issue: inOrg },
        select: { issueId: true, createdAt: true },
      }),
      prisma.issue.findMany({
        where: { creatorId: userId, createdAt: { gte: since }, ...inOrg },
        select: { id: true, createdAt: true },
      }),
      prisma.issue.findMany({
        where: { assignee: { userId }, ...inOrg },
        include: issueInclude,
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.projectStar.findMany({
        where: { userId, project: visibleProjectWhere(user, organizationId) },
        orderBy: { createdAt: "asc" },
        select: { projectId: true },
      }),
    ]);

  const latest = new Map<string, { at: Date; reason: WorkedOnReason }>();
  const record = (issueId: string, at: Date, reason: WorkedOnReason) => {
    const current = latest.get(issueId);
    if (!current || current.at < at) latest.set(issueId, { at, reason });
  };
  activity.forEach((row) => record(row.issueId, row.createdAt, "updated"));
  created.forEach((row) => record(row.id, row.createdAt, "created"));
  comments.forEach((row) => record(row.issueId, row.createdAt, "commented"));
  worklogs.forEach((row) => record(row.issueId, row.createdAt, "logged work"));

  const workedOnIds = [...latest.entries()]
    .sort((left, right) => right[1].at.getTime() - left[1].at.getTime())
    .slice(0, 50)
    .map(([id]) => id);

  const issues = await loadIssues(
    [...new Set([...views.map((view) => view.issueId), ...workedOnIds])],
    organizationId,
    user,
  );

  return {
    recent: views.flatMap((view) => {
      const issue = issues.get(view.issueId);
      return issue ? [{ issue, viewedAt: view.viewedAt.toISOString() }] : [];
    }),
    workedOn: workedOnIds.flatMap((id) => {
      const issue = issues.get(id);
      const entry = latest.get(id);
      return issue && entry
        ? [{ issue, lastActivityAt: entry.at.toISOString(), reason: entry.reason }]
        : [];
    }),
    assigned: assignedRows.map(serializeIssue),
    starredProjectIds: stars.map((star) => star.projectId),
  };
}

/** Lightweight read for the sidebar "Recent" section. */
export async function getRecentlyViewed(
  user: AccessUser,
  organizationId: string,
  limit: number,
) {
  const userId = user.id;
  const views = await prisma.issueView.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: limit * 2,
  });
  const issues = await prisma.issue.findMany({
    where: {
      id: { in: views.map((view) => view.issueId) },
      ...visibleIssueWhere(user, organizationId, {
        includeArchived: true,
        includeArchivedProjects: true,
      }),
    },
    select: { id: true, title: true, kind: true, projectId: true },
  });
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  return views
    .flatMap((view) => {
      const issue = byId.get(view.issueId);
      return issue ? [{ ...issue, viewedAt: view.viewedAt.toISOString() }] : [];
    })
    .slice(0, limit);
}
