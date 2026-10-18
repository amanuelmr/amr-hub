import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import type {
  PersonPlace,
  PersonProfile,
  PersonSummary,
  WorkItemSummary,
} from "../app/components/people/types";
import {
  buildStatusLookup,
  mergeWorkedOn,
  resolveStatus,
  summarizePlaces,
  type WorkEvent,
} from "./peopleLogic";
import { listTeams } from "./teams";
import { visibleIssueWhere, type AccessUser } from "./projectAccess";

const WORKED_ON_LIMIT = 40;
const EVENT_SCAN = 200;

/** Issues that are live (not trashed or archived). */
export const liveIssueWhere = {
  deletedAt: null,
  archivedAt: null,
} satisfies Prisma.IssueWhereInput;

const workItemSelect = {
  id: true,
  title: true,
  kind: true,
  priority: true,
  status: true,
  projectId: true,
  teamId: true,
  updatedAt: true,
  project: { select: { name: true, key: true } },
  assignee: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.IssueSelect;

type StoredWorkItem = Prisma.IssueGetPayload<{ select: typeof workItemSelect }>;

/** Load issues as lightweight rows with their workflow status name/category. */
export async function loadWorkItems(
  where: Prisma.IssueWhereInput,
  options: { take?: number; orderBy?: Prisma.IssueOrderByWithRelationInput } = {},
): Promise<WorkItemSummary[]> {
  const rows = await prisma.issue.findMany({
    where: { ...where, ...liveIssueWhere },
    select: workItemSelect,
    orderBy: options.orderBy ?? { updatedAt: "desc" },
    take: options.take ?? 200,
  });
  return serializeWorkItems(rows);
}

async function serializeWorkItems(rows: StoredWorkItem[]) {
  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  const statuses =
    projectIds.length === 0
      ? []
      : await prisma.workflowStatus.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, key: true, name: true, category: true },
        });
  const lookup = buildStatusLookup(statuses);
  return rows.map((row): WorkItemSummary => {
    const status = resolveStatus(lookup, row.projectId, row.status);
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      priority: row.priority,
      status: row.status,
      statusName: status.name,
      statusCategory: status.category,
      projectId: row.projectId,
      projectName: row.project.name,
      projectKey: row.project.key,
      assignee: row.assignee
        ? { userId: row.assignee.user.id, name: row.assignee.user.name }
        : null,
      teamId: row.teamId,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/**
 * Count open (not Done-category) issues grouped by a key. Done is resolved per
 * project from WorkflowStatus so custom "Closed"-style statuses count as done.
 */
export async function countOpenIssues(
  organizationId: string,
  where: Prisma.IssueWhereInput,
  keyOf: (row: { assigneeId: string | null; teamId: string | null }) => string | null,
  viewer?: AccessUser,
) {
  const visible: Prisma.IssueWhereInput = viewer
    ? visibleIssueWhere(viewer, organizationId)
    : { organizationId, project: { deletedAt: null, archivedAt: null } };
  const [rows, statuses] = await Promise.all([
    prisma.issue.findMany({
      where: { ...visible, ...liveIssueWhere, ...where },
      select: { assigneeId: true, teamId: true, status: true, projectId: true },
    }),
    prisma.workflowStatus.findMany({
      where: { project: { organizationId }, category: "DONE" },
      select: { projectId: true, key: true },
    }),
  ]);
  const done = new Set(statuses.map((row) => `${row.projectId}:${row.key}`));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "DONE" || done.has(`${row.projectId}:${row.status}`)) {
      continue;
    }
    const key = keyOf(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const memberInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      teamMemberships: {
        select: { team: { select: { id: true, name: true, organizationId: true } } },
      },
    },
  },
} satisfies Prisma.MemberInclude;

type StoredMember = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

function serializePerson(
  member: StoredMember,
  organizationId: string,
  openAssignedCount: number,
): PersonSummary {
  return {
    userId: member.user.id,
    memberId: member.id,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    teams: member.user.teamMemberships
      .map((entry) => entry.team)
      .filter((team) => team.organizationId === organizationId)
      .map((team) => ({ id: team.id, name: team.name }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    openAssignedCount,
  };
}

export async function listPeople(
  organizationId: string,
  viewer?: AccessUser,
): Promise<PersonSummary[]> {
  const [members, counts] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId },
      include: memberInclude,
      orderBy: { user: { name: "asc" } },
    }),
    countOpenIssues(
      organizationId,
      { assigneeId: { not: null } },
      (row) => row.assigneeId,
      viewer,
    ),
  ]);
  return members.map((member) =>
    serializePerson(member, organizationId, counts.get(member.id) ?? 0),
  );
}

export async function getPersonProfile(
  userId: string,
  organizationId: string,
  viewer: { userId: string; role: string },
): Promise<PersonProfile | null> {
  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: memberInclude,
  });
  if (!member) return null;

  const inOrg = {
    ...visibleIssueWhere({ id: viewer.userId, role: viewer.role }, organizationId),
    ...liveIssueWhere,
  };
  const [assigned, activity, comments, created, teams] = await Promise.all([
    loadWorkItems({ ...inOrg, assigneeId: member.id }, { take: 300 }),
    prisma.activity.findMany({
      where: { actorId: userId, issue: inOrg },
      select: { issueId: true, createdAt: true, description: true },
      orderBy: { createdAt: "desc" },
      take: EVENT_SCAN,
    }),
    prisma.comment.findMany({
      where: { authorId: userId, issue: inOrg },
      select: { issueId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: EVENT_SCAN,
    }),
    prisma.issue.findMany({
      where: { creatorId: userId, ...inOrg },
      select: { id: true, createdAt: true, projectId: true },
      orderBy: { createdAt: "desc" },
      take: EVENT_SCAN,
    }),
    listTeams(organizationId, viewer, { memberUserId: userId }),
  ]);

  const events: WorkEvent[] = [
    ...activity.map((row) => ({
      issueId: row.issueId,
      at: row.createdAt,
      reason: "updated" as const,
      detail: row.description,
    })),
    ...comments.map((row) => ({
      issueId: row.issueId,
      at: row.createdAt,
      reason: "commented" as const,
      detail: null,
    })),
    ...created.map((row) => ({
      issueId: row.id,
      at: row.createdAt,
      reason: "created" as const,
      detail: null,
    })),
  ];
  const merged = mergeWorkedOn(events, WORKED_ON_LIMIT);
  const touchedIds = [...new Set(events.map((event) => event.issueId))];
  const touched = await loadWorkItems(
    { ...inOrg, id: { in: touchedIds } },
    { take: touchedIds.length || 1 },
  );
  const byId = new Map(touched.map((issue) => [issue.id, issue]));

  const placeRows = summarizePlaces([
    ...events.flatMap((event) => {
      const issue = byId.get(event.issueId);
      return issue
        ? [{ projectId: issue.projectId, issueId: issue.id, at: event.at }]
        : [];
    }),
    ...assigned.map((issue) => ({
      projectId: issue.projectId,
      issueId: issue.id,
      at: new Date(issue.updatedAt),
    })),
  ]);
  const projects = await prisma.project.findMany({
    where: {
      id: { in: placeRows.map((row) => row.projectId) },
      organizationId,
      deletedAt: null,
    },
    select: { id: true, name: true, key: true, color: true },
  });
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const places: PersonPlace[] = placeRows.flatMap((row) => {
    const project = projectById.get(row.projectId);
    return project
      ? [
          {
            projectId: project.id,
            name: project.name,
            key: project.key,
            color: project.color,
            issueCount: row.issueCount,
            lastAt: row.lastAt.toISOString(),
          },
        ]
      : [];
  });

  const openAssigned = assigned.filter((issue) => issue.statusCategory !== "DONE");

  return {
    person: serializePerson(member, organizationId, openAssigned.length),
    assigned: openAssigned,
    workedOn: merged.flatMap((event) => {
      const issue = byId.get(event.issueId);
      return issue
        ? [
            {
              issue,
              reason: event.reason,
              detail: event.detail,
              at: event.at.toISOString(),
            },
          ]
        : [];
    }),
    places,
    teams,
  };
}
