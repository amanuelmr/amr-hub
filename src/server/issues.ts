import { Prisma } from "@prisma/client";
import { dispatchWebhook } from "./webhooks";
import prisma from "../../prisma/client";
import { notifyRecipients } from "./notifications";
import { getNotificationSettings } from "./notificationPreferences";
import { runAutomations } from "./automation";
import { summarizeReactions } from "../app/data/reactions";
import {
  extractCommentMentionIds,
  extractMentionedMemberIds,
} from "./richText";
import {
  PRIORITY_LABELS,
  RESOLUTION_LABELS,
  WORKSPACE_LABELS,
  formatDuration,
  type Issue,
  type IssueRef,
  type IssueResolution,
  type IssueActivityType,
  type IssueKind,
  type IssuePriority,
  type IssueStatus,
  type IssueUpdates,
  type NewIssueInput,
  type WorkspaceLabel,
  type WorkspaceMember,
} from "../app/data/issues";
import {
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
  statusName,
  typeName,
  type ProjectWorkflow,
} from "../app/data/workflow";
import {
  defaultCreateStatus,
  loadWorkflow,
  notDoneStatusWhere,
  validateIssueStatus,
  validateIssueType,
} from "./workflows";
import { parseCustomFieldValues } from "../app/data/customFields";
import { resolveCustomFieldValues, type CustomFieldChange } from "./customFields";
import {
  accessibleProjectIds,
  assertActorPermission,
  projectAudienceUserIds,
  projectPermission,
  visibleIssueWhere,
  type AccessUser,
} from "./projectAccess";

/** The access user behind an actor, or null for system actors (automation). */
export function actorAccessUser(actor: WorkspaceActor): AccessUser | null {
  return actor.role ? { id: actor.id, role: actor.role } : null;
}

function assertActorCan(
  actor: WorkspaceActor,
  projectId: string,
  need: "comment" | "edit",
) {
  return assertActorPermission(actor, projectId, need, "Issue not found");
}

export type WorkspaceActor = {
  id: string;
  name: string;
  organizationId: string;
  organizationKey: string;
  /** Workspace role (owner | member | viewer) for project access checks. */
  role?: string;
};

const memberWithUser = {
  include: {
    user: {
      select: { id: true, name: true, email: true },
    },
  },
} as const;

export const issueRefSelect = {
  id: true,
  projectId: true,
  title: true,
  status: true,
  kind: true,
  priority: true,
  estimate: true,
  assignee: memberWithUser,
} satisfies Prisma.IssueSelect;

type StoredIssueRef = Prisma.IssueGetPayload<{ select: typeof issueRefSelect }>;

export function serializeIssueRef(issue: StoredIssueRef): IssueRef {
  return {
    id: issue.id,
    projectId: issue.projectId,
    title: issue.title,
    status: issue.status as IssueStatus,
    kind: issue.kind as IssueKind,
    priority: issue.priority as IssuePriority,
    estimate: issue.estimate as IssueRef["estimate"],
    assignee: issue.assignee
      ? {
          id: issue.assignee.id,
          name: issue.assignee.user.name,
          email: issue.assignee.user.email,
        }
      : null,
  };
}

export const issueInclude = {
  parent: { select: issueRefSelect },
  children: { where: { deletedAt: null }, select: { status: true } },
  fixVersion: { select: { id: true, name: true, status: true } },
  team: { select: { id: true, name: true } },
  goal: { select: { id: true, name: true, status: true } },
  components: {
    include: { component: { select: { id: true, name: true } } },
    orderBy: { component: { name: "asc" } },
  },
  watchers: { select: { userId: true } },
  comments: {
    orderBy: { createdAt: "asc" },
    include: {
      reactions: {
        select: {
          emoji: true,
          userId: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
    },
  },
  activity: {
    orderBy: { createdAt: "desc" },
  },
  labels: {
    include: { label: true },
    orderBy: { label: { name: "asc" } },
  },
  assignee: {
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  creator: {
    select: { id: true, name: true, email: true },
  },
  cycle: true,
} satisfies Prisma.IssueInclude;

export type StoredIssue = Prisma.IssueGetPayload<{
  include: typeof issueInclude;
}>;

/** Extra relations loaded only for a single-issue read. */
export const issueDetailInclude = {
  ...issueInclude,
  children: {
    where: { deletedAt: null },
    select: issueRefSelect,
    orderBy: { rank: "asc" },
  },
  outgoingLinks: {
    where: { target: { deletedAt: null } },
    include: { target: { select: issueRefSelect } },
  },
  incomingLinks: {
    where: { source: { deletedAt: null } },
    include: { source: { select: issueRefSelect } },
  },
  votes: { select: { userId: true } },
  webLinks: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.IssueInclude;

type StoredIssueDetail = Prisma.IssueGetPayload<{
  include: typeof issueDetailInclude;
}>;

/** Each stored link reads in both directions; the inverse names the other side. */
const INVERSE_LINK_TYPE: Record<string, string> = {
  BLOCKS: "IS_BLOCKED_BY",
  IS_BLOCKED_BY: "BLOCKS",
  RELATES_TO: "RELATES_TO",
  DUPLICATES: "IS_DUPLICATED_BY",
  IS_DUPLICATED_BY: "DUPLICATES",
  CLONES: "IS_CLONED_BY",
  IS_CLONED_BY: "CLONES",
};

export function inverseLinkType(type: string) {
  return INVERSE_LINK_TYPE[type] ?? "RELATES_TO";
}

export function serializeIssueDetail(issue: StoredIssueDetail): Issue {
  const base = serializeIssue({
    ...issue,
    children: issue.children.map((child) => ({ status: child.status })),
  });

  return {
    ...base,
    children: issue.children.map(serializeIssueRef),
    links: [
      ...issue.outgoingLinks.map((link) => ({
        id: link.id,
        type: link.type as NonNullable<Issue["links"]>[number]["type"],
        issue: serializeIssueRef(link.target),
      })),
      ...issue.incomingLinks.map((link) => ({
        id: link.id,
        type: inverseLinkType(
          link.type,
        ) as NonNullable<Issue["links"]>[number]["type"],
        issue: serializeIssueRef(link.source),
      })),
    ],
    voterIds: issue.votes.map((vote) => vote.userId),
    webLinks: issue.webLinks.map((link) => ({
      id: link.id,
      url: link.url,
      title: link.title,
      createdAt: link.createdAt.toISOString(),
    })),
  };
}

/**
 * One issue by key. Trashed issues read as missing; archived ones stay
 * reachable. With a viewer, issues in projects they cannot see read as
 * missing and links/children into hidden projects are dropped.
 */
export async function getIssue(
  id: string,
  organizationId: string,
  viewer?: AccessUser | null,
) {
  const issue = await prisma.issue.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: issueDetailInclude,
  });
  if (!issue) return null;
  if (!viewer) return serializeIssueDetail(issue);

  const permissions = await projectPermission(issue.projectId, viewer, organizationId);
  if (!permissions.canView) return null;
  const visible = new Set(await accessibleProjectIds(organizationId, viewer));
  return serializeIssueDetail({
    ...issue,
    parent: issue.parent && visible.has(issue.parent.projectId) ? issue.parent : null,
    children: issue.children.filter((child) => visible.has(child.projectId)),
    outgoingLinks: issue.outgoingLinks.filter((link) =>
      visible.has(link.target.projectId),
    ),
    incomingLinks: issue.incomingLinks.filter((link) =>
      visible.has(link.source.projectId),
    ),
  });
}

function serializeAssignee(
  assignee: StoredIssue["assignee"],
): WorkspaceMember | null {
  if (!assignee) return null;

  return {
    id: assignee.id,
    name: assignee.user.name,
    email: assignee.user.email,
    userId: assignee.userId,
  };
}

export function serializeIssue(issue: StoredIssue): Issue {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    status: issue.status as IssueStatus,
    priority: issue.priority as IssuePriority,
    kind: issue.kind as IssueKind,
    assignee: serializeAssignee(issue.assignee),
    creator: issue.creator,
    dueDate: issue.dueDate?.toISOString() ?? null,
    estimate: issue.estimate as Issue["estimate"],
    projectId: issue.projectId,
    cycleId: issue.cycleId,
    labels: issue.labels.map(({ label }) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    })),
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    parentId: issue.parentId,
    parent: issue.parent ? serializeIssueRef(issue.parent) : null,
    fixVersion: issue.fixVersion,
    team: issue.team,
    goal: issue.goal,
    components: issue.components.map(({ component }) => component),
    startDate: issue.startDate?.toISOString() ?? null,
    rank: issue.rank,
    flagged: issue.flagged,
    archivedAt: issue.archivedAt?.toISOString() ?? null,
    resolution: issue.resolution as IssueResolution | null,
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
    statusChangedAt: issue.statusChangedAt.toISOString(),
    environment: issue.environment,
    originalEstimateMinutes: issue.originalEstimateMinutes,
    remainingEstimateMinutes: issue.remainingEstimateMinutes,
    timeSpentMinutes: issue.timeSpentMinutes,
    childCount: issue.children.length,
    doneChildCount: issue.children.filter((child) =>
      isDoneStatus(child.status),
    ).length,
    customFields: parseCustomFieldValues(issue.customFields),
    watcherIds: issue.watchers.map((watcher) => watcher.userId),
    comments: issue.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      author: comment.author,
      authorId: comment.authorId,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      reactions: summarizeReactions(comment.reactions),
    })),
    activity: issue.activity.map((event) => ({
      id: event.id,
      type: event.type as IssueActivityType,
      description: event.description,
      actor: event.actor,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export function watcherUserIds(
  issue: Pick<StoredIssue, "creatorId" | "assignee" | "watchers">,
) {
  return [
    ...new Set([
      issue.creatorId,
      issue.assignee?.userId,
      ...issue.watchers.map((watcher) => watcher.userId),
    ]),
  ];
}

async function resolveMemberUserIds(
  memberIds: string[],
  organizationId: string,
) {
  if (memberIds.length === 0) return [];

  const members = await prisma.member.findMany({
    where: { id: { in: memberIds }, organizationId },
    select: { userId: true },
  });

  return members.map((member) => member.userId);
}

export async function ensureWorkspaceLabels(organizationId: string) {
  await prisma.$transaction(
    WORKSPACE_LABELS.map((label) =>
      prisma.label.upsert({
        where: {
          organizationId_name: {
            organizationId,
            name: label.name,
          },
        },
        create: {
          ...label,
          id: `${organizationId}:${label.id}`,
          organizationId,
        },
        update: {
          color: label.color,
        },
      }),
    ),
  );
}

export async function listLabels(
  organizationId: string,
): Promise<WorkspaceLabel[]> {
  await ensureWorkspaceLabels(organizationId);
  return prisma.label.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      color: true,
    },
    orderBy: { name: "asc" },
  });
}

export type IssueListFilters = {
  status?: "ALL" | "ACTIVE" | IssueStatus;
  priority?: "ALL" | IssuePriority;
  projectId?: string;
  cycleId?: string;
  parentId?: string;
  kind?: IssueKind;
  labelId?: string;
  assigneeId?: string;
  q?: string;
  sort?: "NEWEST" | "OLDEST" | "RANK";
  cursor?: string;
  limit?: number;
  /** Only archived work items (the "Archived work items" list). */
  archived?: boolean;
};

export async function listIssues(
  organizationId: string,
  filters: IssueListFilters = {},
  user: AccessUser,
) {
  // A project's own board/backlog still opens (read-only) once archived.
  const where: Prisma.IssueWhereInput = visibleIssueWhere(user, organizationId, {
    includeArchived: filters.archived === true,
    includeArchivedProjects: Boolean(filters.projectId),
  });
  if (filters.archived) where.archivedAt = { not: null };

  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

  if (filters.cycleId === "NONE") {
    where.cycleId = null;
  } else if (filters.cycleId) {
    where.cycleId = filters.cycleId;
  }

  if (filters.parentId) {
    where.parentId = filters.parentId;
  }

  if (filters.kind) {
    where.kind = filters.kind;
  }

  if (filters.status === "ACTIVE") {
    where.AND = [notDoneStatusWhere()];
  } else if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.priority && filters.priority !== "ALL") {
    where.priority = filters.priority;
  }

  if (filters.labelId) {
    where.labels = { some: { labelId: filters.labelId } };
  }

  if (filters.assigneeId === "UNASSIGNED") {
    where.assigneeId = null;
  } else if (filters.assigneeId) {
    where.assigneeId = filters.assigneeId;
  }

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { id: { contains: filters.q, mode: "insensitive" } },
      {
        assignee: {
          user: { name: { contains: filters.q, mode: "insensitive" } },
        },
      },
      {
        labels: {
          some: { label: { name: { contains: filters.q, mode: "insensitive" } } },
        },
      },
    ];
  }

  const limit = filters.limit;
  const issues = await prisma.issue.findMany({
    where,
    include: issueInclude,
    orderBy:
      filters.sort === "RANK"
        ? [{ rank: "asc" }, { sequence: "asc" }]
        : { sequence: filters.sort === "OLDEST" ? "asc" : "desc" },
    ...(limit ? { take: limit + 1 } : {}),
    ...(filters.cursor
      ? { cursor: { id: filters.cursor }, skip: 1 }
      : {}),
  });

  let nextCursor: string | null = null;
  let page = issues;
  if (limit && issues.length > limit) {
    page = issues.slice(0, limit);
    nextCursor = page[page.length - 1].id;
  }

  return {
    issues: page.map(serializeIssue),
    nextCursor,
  };
}

async function createIssueUnhooked(
  input: NewIssueInput,
  actor: WorkspaceActor,
) {
  await ensureWorkspaceLabels(actor.organizationId);
  await validateLabelIds(input.labelIds, actor.organizationId);
  const project = await validateProjectId(input.projectId, actor.organizationId);
  await assertActorPermission(actor, project.id, "edit");
  await validateCycleId(input.cycleId, project.id);
  await validateAssigneeId(input.assigneeId, actor.organizationId, project.id);
  await validateIssueType(project.id, input.kind);
  if (input.status) await validateIssueStatus(project.id, null, input.status);
  const initialStatus = input.status ?? (await defaultCreateStatus(project.id));
  await validateParentId(input.parentId, null, input.kind, actor.organizationId);
  await validateVersionId(input.fixVersionId, project.id);
  await validateComponentIds(input.componentIds, project.id);
  await validateTeamId(input.teamId, actor.organizationId);
  await validateGoalId(input.goalId, actor.organizationId);
  const { autoWatch: creatorWatches } = await getNotificationSettings(actor.id);
  // Custom fields: required ones are enforced when the caller sends values.
  let customFieldsJson = "{}";
  if (input.customFields !== undefined) {
    const resolved = await resolveCustomFieldValues({
      organizationId: actor.organizationId,
      projectId: project.id,
      kind: input.kind,
      current: {},
      input: input.customFields,
      mode: "create",
    });
    if (!resolved.ok) throw new InvalidCustomFieldValueError(resolved.error);
    customFieldsJson = JSON.stringify(resolved.values);
  }

  const issue = await prisma.$transaction(async (transaction) => {
    const latestIssue = await transaction.issue.findFirst({
      where: { projectId: input.projectId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const lastRanked = await transaction.issue.findFirst({
      where: { projectId: input.projectId },
      orderBy: { rank: "desc" },
      select: { rank: true },
    });
    const sequence = (latestIssue?.sequence ?? 0) + 1;
    const {
      dueDate,
      startDate,
      labelIds,
      componentIds,
      status,
      originalEstimateMinutes,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      customFields: _customFields,
      ...fields
    } = input;
    // The creator watches their new item unless they turned auto-watch off.
    const watcherIds = new Set(creatorWatches ? [actor.id] : []);
    if (input.assigneeId) {
      const assignee = await transaction.member.findUnique({
        where: { id: input.assigneeId },
        select: { userId: true },
      });
      if (assignee) watcherIds.add(assignee.userId);
    }

    return transaction.issue.create({
      data: {
        ...fields,
        id: `${project.key}-${sequence}`,
        sequence,
        rank: (lastRanked?.rank ?? 0) + 1000,
        organizationId: actor.organizationId,
        creatorId: actor.id,
        customFields: customFieldsJson,
        status: status ?? initialStatus,
        ...(isDoneStatus(status ?? initialStatus)
          ? { resolution: "DONE", resolvedAt: new Date() }
          : {}),
        originalEstimateMinutes: originalEstimateMinutes ?? null,
        remainingEstimateMinutes: originalEstimateMinutes ?? null,
        dueDate: dueDate ? parseDueDate(dueDate) : null,
        startDate: startDate ? parseDueDate(startDate) : null,
        components: {
          create: (componentIds ?? []).map((componentId) => ({
            component: { connect: { id: componentId } },
          })),
        },
        watchers: {
          create: [...watcherIds].map((userId) => ({
            user: { connect: { id: userId } },
          })),
        },
        activity: {
          create: {
            type: "CREATED",
            description: "created the issue",
            actor: actor.name,
            user: { connect: { id: actor.id } },
          },
        },
        labels: {
          create: labelIds.map((labelId) => ({
            label: { connect: { id: labelId } },
          })),
        },
      },
      include: issueInclude,
    });
  });

  if (issue.assignee) {
    await notifyRecipients([issue.assignee.userId], {
      type: "ISSUE_ASSIGNED",
      title: `Assigned: ${issue.title}`,
      body: `${actor.name} assigned ${issue.id} to you`,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    });
  }

  const mentionedMemberIds = extractMentionedMemberIds(issue.description);
  if (mentionedMemberIds.length > 0) {
    const mentionedUserIds = await resolveMemberUserIds(
      mentionedMemberIds,
      actor.organizationId,
    );
    await notifyRecipients(mentionedUserIds, {
      type: "ISSUE_MENTIONED",
      title: `Mentioned in: ${issue.title}`,
      body: `${actor.name} mentioned you in ${issue.id}`,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    });
  }

  await runAutomations({
    trigger: "ISSUE_CREATED",
    issueId: issue.id,
    projectId: issue.projectId,
    actor,
  });

  return serializeIssue(
    (await prisma.issue.findUnique({
      where: { id: issue.id },
      include: issueInclude,
    })) ?? issue,
  );
}

export class UnknownProjectError extends Error {
  constructor() {
    super("The selected project does not exist");
    this.name = "UnknownProjectError";
  }
}

async function validateProjectId(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, key: true },
  });

  if (!project) {
    throw new UnknownProjectError();
  }

  return project;
}

export class InvalidParentError extends Error {
  constructor(message = "The selected parent issue is not valid") {
    super(message);
    this.name = "InvalidParentError";
  }
}

/**
 * A custom field value failed validation. Extends InvalidParentError so the
 * existing issue routes already answer 400 with the message.
 */
export class InvalidCustomFieldValueError extends InvalidParentError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCustomFieldValueError";
  }
}

export class UnknownVersionError extends Error {
  constructor() {
    super("The selected release does not belong to this project");
    this.name = "UnknownVersionError";
  }
}

export class UnknownComponentError extends Error {
  constructor() {
    super("One or more components do not belong to this project");
    this.name = "UnknownComponentError";
  }
}

/**
 * Jira hierarchy: epics sit at the top, subtasks sit at the bottom, and no
 * issue may become its own ancestor.
 */
async function validateParentId(
  parentId: string | null | undefined,
  issueId: string | null,
  kind: IssueKind | undefined,
  organizationId: string,
) {
  if (!parentId) return null;
  if (parentId === issueId) throw new InvalidParentError();
  if (isEpicLevel(kind)) {
    throw new InvalidParentError("Epics cannot have a parent issue");
  }

  const parent = await prisma.issue.findFirst({
    where: { id: parentId, organizationId, deletedAt: null },
    select: { id: true, kind: true, parentId: true },
  });
  if (!parent) throw new InvalidParentError();
  if (isSubtaskLevel(parent.kind)) {
    throw new InvalidParentError("Subtasks cannot have child issues");
  }
  if (isSubtaskLevel(kind) && isEpicLevel(parent.kind)) {
    throw new InvalidParentError("Subtasks belong to a story, task, or bug");
  }

  let ancestorId = parent.parentId;
  for (let depth = 0; ancestorId && depth < 10; depth += 1) {
    if (ancestorId === issueId) throw new InvalidParentError();
    const ancestor = await prisma.issue.findUnique({
      where: { id: ancestorId },
      select: { parentId: true },
    });
    ancestorId = ancestor?.parentId ?? null;
  }

  return parent.id;
}

export class UnknownTeamError extends Error {
  constructor() {
    super("The selected team does not exist in this workspace");
    this.name = "UnknownTeamError";
  }
}

export class UnknownGoalError extends Error {
  constructor() {
    super("The selected goal does not exist in this workspace");
    this.name = "UnknownGoalError";
  }
}

async function validateTeamId(
  teamId: string | null | undefined,
  organizationId: string,
) {
  if (!teamId) return null;
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId },
    select: { name: true },
  });
  if (!team) throw new UnknownTeamError();
  return team.name;
}

async function validateGoalId(
  goalId: string | null | undefined,
  organizationId: string,
) {
  if (!goalId) return null;
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, organizationId },
    select: { name: true },
  });
  if (!goal) throw new UnknownGoalError();
  return goal.name;
}

async function validateVersionId(
  versionId: string | null | undefined,
  projectId: string,
) {
  if (!versionId) return null;
  const version = await prisma.version.findFirst({
    where: { id: versionId, projectId },
    select: { name: true },
  });
  if (!version) throw new UnknownVersionError();
  return version.name;
}

async function validateComponentIds(
  componentIds: string[] | undefined,
  projectId: string,
) {
  if (!componentIds || componentIds.length === 0) return;
  const count = await prisma.component.count({
    where: { id: { in: componentIds }, projectId },
  });
  if (count !== componentIds.length) throw new UnknownComponentError();
}

function parseDueDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function dueDateKey(value: Date | string | null) {
  if (!value) return null;
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDueDate(value));
}

async function validateLabelIds(labelIds: string[], organizationId: string) {
  if (labelIds.length === 0) return;

  const count = await prisma.label.count({
    where: {
      id: { in: labelIds },
      organizationId,
    },
  });

  if (count !== labelIds.length) {
    throw new UnknownLabelError();
  }
}

export class UnknownLabelError extends Error {
  constructor() {
    super("One or more labels do not exist");
    this.name = "UnknownLabelError";
  }
}

async function validateCycleId(
  cycleId: string | null | undefined,
  projectId: string,
) {
  if (!cycleId) return null;

  const cycle = await prisma.cycle.findFirst({
    where: {
      id: cycleId,
      projectId,
    },
    select: { name: true },
  });

  if (!cycle) {
    throw new UnknownCycleError();
  }

  return cycle.name;
}

export class UnknownCycleError extends Error {
  constructor() {
    super("The selected cycle does not exist");
    this.name = "UnknownCycleError";
  }
}

async function validateAssigneeId(
  assigneeId: string | null | undefined,
  organizationId: string,
  projectId: string,
) {
  if (!assigneeId) return null;

  const member = await prisma.member.findFirst({
    where: {
      id: assigneeId,
      organizationId,
    },
    include: { user: { select: { name: true } } },
  });

  if (!member) {
    throw new UnknownAssigneeError();
  }
  // Private projects: only people who can see the project can be assigned.
  const audience = await projectAudienceUserIds(projectId, organizationId);
  if (audience && !audience.has(member.userId)) {
    throw new UnknownAssigneeError(
      "The selected assignee does not have access to this private project",
    );
  }

  return member.user.name;
}

export class UnknownAssigneeError extends Error {
  constructor(message = "The selected assignee is not a member of this workspace") {
    super(message);
    this.name = "UnknownAssigneeError";
  }
}

function buildActivity(
  current: StoredIssue,
  updates: IssueUpdates,
  nextCycleName: string | null,
  nextAssigneeName: string | null,
  nextVersionName: string | null,
  actor: WorkspaceActor,
  workflow: ProjectWorkflow | null = null,
): Prisma.ActivityCreateWithoutIssueInput[] {
  const events: Prisma.ActivityCreateWithoutIssueInput[] = [];

  if (updates.status && updates.status !== current.status) {
    events.push({
      type: "STATUS_CHANGED",
      description: `changed status from ${statusName(
        current.status,
        workflow?.statuses,
      )} to ${statusName(updates.status, workflow?.statuses)}`,
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (updates.priority && updates.priority !== current.priority) {
    events.push({
      type: "PRIORITY_CHANGED",
      description: `changed priority from ${
        PRIORITY_LABELS[current.priority as IssuePriority]
      } to ${PRIORITY_LABELS[updates.priority]}`,
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    updates.assigneeId !== undefined &&
    updates.assigneeId !== current.assigneeId
  ) {
    events.push({
      type: "ASSIGNEE_CHANGED",
      description: nextAssigneeName
        ? `assigned the issue to ${nextAssigneeName}`
        : "removed the assignee",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (updates.kind && updates.kind !== current.kind) {
    events.push({
      type: "TYPE_CHANGED",
      description: `changed type from ${typeName(
        current.kind,
        workflow?.types,
      )} to ${typeName(updates.kind, workflow?.types)}`,
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  const changedTitle =
    updates.title !== undefined && updates.title !== current.title;
  const changedDescription =
    updates.description !== undefined &&
    updates.description !== current.description;

  if (changedTitle || changedDescription) {
    events.push({
      type: "CONTENT_UPDATED",
      description: "updated issue details",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    updates.dueDate !== undefined &&
    dueDateKey(updates.dueDate) !== dueDateKey(current.dueDate)
  ) {
    events.push({
      type: "DUE_DATE_CHANGED",
      description: updates.dueDate
        ? `set the due date to ${formatDueDate(updates.dueDate)}`
        : "removed the due date",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (updates.labelIds) {
    const currentLabelIds = current.labels.map(({ labelId }) => labelId).sort();
    const nextLabelIds = [...updates.labelIds].sort();

    if (currentLabelIds.join(",") !== nextLabelIds.join(",")) {
      events.push({
        type: "LABELS_CHANGED",
        description: "updated issue labels",
        actor: actor.name,
        user: { connect: { id: actor.id } },
      });
    }
  }

  if (
    updates.estimate !== undefined &&
    updates.estimate !== current.estimate
  ) {
    events.push({
      type: "ESTIMATE_CHANGED",
      description: updates.estimate
        ? `set the estimate to ${updates.estimate} ${
            updates.estimate === 1 ? "point" : "points"
          }`
        : "removed the estimate",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    updates.cycleId !== undefined &&
    updates.cycleId !== current.cycleId
  ) {
    events.push({
      type: "CYCLE_CHANGED",
      description: nextCycleName
        ? `moved the issue to ${nextCycleName}`
        : current.cycle
          ? `removed the issue from ${current.cycle.name}`
          : "removed the issue from its cycle",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (updates.parentId !== undefined && updates.parentId !== current.parentId) {
    events.push({
      type: "PARENT_CHANGED",
      description: updates.parentId
        ? `set the parent to ${updates.parentId}`
        : "removed the parent issue",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    updates.fixVersionId !== undefined &&
    updates.fixVersionId !== current.fixVersionId
  ) {
    events.push({
      type: "VERSION_CHANGED",
      description: nextVersionName
        ? `set the fix version to ${nextVersionName}`
        : "removed the fix version",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (updates.componentIds) {
    const currentIds = current.components
      .map(({ component }) => component.id)
      .sort();
    if (currentIds.join(",") !== [...updates.componentIds].sort().join(",")) {
      events.push({
        type: "COMPONENTS_CHANGED",
        description: "updated issue components",
        actor: actor.name,
        user: { connect: { id: actor.id } },
      });
    }
  }

  if (updates.flagged !== undefined && updates.flagged !== current.flagged) {
    events.push({
      type: "FLAG_CHANGED",
      description: updates.flagged
        ? "flagged the issue as an impediment"
        : "removed the flag",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    updates.startDate !== undefined &&
    dueDateKey(updates.startDate) !== dueDateKey(current.startDate)
  ) {
    events.push({
      type: "START_DATE_CHANGED",
      description: updates.startDate
        ? `set the start date to ${formatDueDate(updates.startDate)}`
        : "removed the start date",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    (updates.originalEstimateMinutes !== undefined &&
      updates.originalEstimateMinutes !== current.originalEstimateMinutes) ||
    (updates.remainingEstimateMinutes !== undefined &&
      updates.remainingEstimateMinutes !== current.remainingEstimateMinutes)
  ) {
    const original =
      updates.originalEstimateMinutes !== undefined
        ? updates.originalEstimateMinutes
        : current.originalEstimateMinutes;
    events.push({
      type: "TIME_TRACKING_CHANGED",
      description: `updated time tracking (original ${formatDuration(
        original,
      )})`,
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  if (
    updates.resolution !== undefined &&
    updates.resolution !== current.resolution
  ) {
    events.push({
      type: "RESOLUTION_CHANGED",
      description: updates.resolution
        ? `resolved the issue as ${RESOLUTION_LABELS[updates.resolution]}`
        : "cleared the resolution",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  const changedEnvironment =
    updates.environment !== undefined &&
    updates.environment !== current.environment;
  const changedRank =
    updates.rank !== undefined && updates.rank !== current.rank;
  if ((changedEnvironment || changedRank) && events.length === 0) {
    // Rank and environment changes are silent but still need to persist.
    events.push({
      type: "CONTENT_UPDATED",
      description: changedRank ? "ranked the issue" : "updated the environment",
      actor: actor.name,
      user: { connect: { id: actor.id } },
    });
  }

  return events;
}

function dateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

/** Update keys whose value actually differs from the stored issue. */
export function changedIssueFields(
  current: Pick<StoredIssue, "labels" | "components" | "customFields"> &
    Record<string, unknown>,
  updates: IssueUpdates,
) {
  const sameIds = (a: string[], b: string[]) =>
    [...a].sort().join(",") === [...b].sort().join(",");
  return Object.entries(updates)
    .filter(([key, value]) => {
      if (value === undefined) return false;
      switch (key) {
        case "labelIds":
          return !sameIds(
            current.labels.map(({ labelId }) => labelId),
            value as string[],
          );
        case "componentIds":
          return !sameIds(
            current.components.map(({ component }) => component.id),
            value as string[],
          );
        case "dueDate":
        case "startDate":
          return dateKey(current[key] as Date | null) !== dateKey(value as string | null);
        case "customFields": {
          const stored = JSON.parse(current.customFields || "{}") as Record<string, unknown>;
          return Object.entries(value as Record<string, unknown>).some(
            ([fieldId, next]) =>
              JSON.stringify(stored[fieldId] ?? null) !== JSON.stringify(next ?? null),
          );
        }
        default:
          return (current[key] ?? null) !== (value ?? null);
      }
    })
    .map(([key]) => key);
}

async function updateIssueUnhooked(
  id: string,
  updates: IssueUpdates,
  actor: WorkspaceActor,
) {
  const existing = await prisma.issue.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    select: { projectId: true, kind: true, status: true, customFields: true },
  });
  if (!existing) return null;
  await assertActorCan(actor, existing.projectId, "edit");
  // Validated up front; merged onto the row's current values in the transaction.
  let customFieldPatch: Record<string, CustomFieldChange> | null = null;
  if (updates.customFields && Object.keys(updates.customFields).length > 0) {
    const resolved = await resolveCustomFieldValues({
      organizationId: actor.organizationId,
      projectId: existing.projectId,
      kind: updates.kind ?? existing.kind,
      current: parseCustomFieldValues(existing.customFields),
      input: updates.customFields,
      mode: "update",
    });
    if (!resolved.ok) throw new InvalidCustomFieldValueError(resolved.error);
    customFieldPatch = Object.fromEntries(
      resolved.changes.map((change) => [change.field.id, change]),
    );
  }

  const workflow = await loadWorkflow(prisma, existing.projectId);
  if (updates.kind !== undefined && updates.kind !== existing.kind) {
    await validateIssueType(existing.projectId, updates.kind);
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    await validateIssueStatus(
      existing.projectId,
      existing.status,
      updates.status,
    );
  }

  if (updates.parentId !== undefined) {
    await validateParentId(
      updates.parentId,
      id,
      updates.kind ?? (existing.kind as IssueKind),
      actor.organizationId,
    );
  }
  const nextVersionName = await validateVersionId(
    updates.fixVersionId,
    existing.projectId,
  );
  await validateComponentIds(updates.componentIds, existing.projectId);
  const nextTeamName = await validateTeamId(
    updates.teamId,
    actor.organizationId,
  );
  const nextGoalName = await validateGoalId(
    updates.goalId,
    actor.organizationId,
  );

  if (updates.labelIds) {
    await ensureWorkspaceLabels(actor.organizationId);
    await validateLabelIds(updates.labelIds, actor.organizationId);
  }
  const nextCycleName = await validateCycleId(
    updates.cycleId,
    existing.projectId,
  );
  const nextAssigneeName = await validateAssigneeId(
    updates.assigneeId,
    actor.organizationId,
    existing.projectId,
  );

  const result = await prisma.$transaction(async (transaction) => {
    const current = await transaction.issue.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
      },
      include: issueInclude,
    });

    if (!current) return null;

    const activity = buildActivity(
      current,
      updates,
      nextCycleName,
      nextAssigneeName,
      nextVersionName,
      actor,
      workflow,
    );
    if (updates.teamId !== undefined && updates.teamId !== current.teamId) {
      activity.push({
        type: "TEAM_CHANGED",
        description: nextTeamName
          ? `changed the Team to ${nextTeamName}`
          : "removed the Team",
        actor: actor.name,
        user: { connect: { id: actor.id } },
      });
    }
    if (updates.goalId !== undefined && updates.goalId !== current.goalId) {
      activity.push({
        type: "GOAL_CHANGED",
        description: nextGoalName
          ? `linked the goal ${nextGoalName}`
          : "removed the goal",
        actor: actor.name,
        user: { connect: { id: actor.id } },
      });
    }
    let nextCustomFields: string | undefined;
    if (customFieldPatch) {
      const merged = parseCustomFieldValues(current.customFields);
      for (const change of Object.values(customFieldPatch)) {
        if (change.value === null) delete merged[change.field.id];
        else merged[change.field.id] = change.value;
        activity.push({
          type: "CUSTOM_FIELD_CHANGED",
          description: change.description,
          actor: actor.name,
          user: { connect: { id: actor.id } },
        });
      }
      nextCustomFields = JSON.stringify(merged);
    }
    const activityTypes = activity.map((event) => event.type);
    const changed = activity.length > 0;
    const previousStatus = current.status as IssueStatus;
    const changedFields = changedIssueFields(current, updates);
    if (!changed) {
      return { issue: current, activityTypes, previousStatus, changedFields };
    }
    const {
      dueDate,
      startDate,
      labelIds,
      componentIds,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      customFields: _customFields,
      ...fields
    } = updates;
    const isRankOnly =
      activity.length === 1 && activity[0].description === "ranked the issue";
    if (isRankOnly) {
      // Re-ranking happens constantly on boards; keep it out of history.
      activity.length = 0;
      activityTypes.length = 0;
    }

    // Jira semantics: entering a done status resolves the issue, leaving it
    // reopens it.
    const resolutionFields: Prisma.IssueUncheckedUpdateInput = {};
    if (updates.status && updates.status !== current.status) {
      resolutionFields.statusChangedAt = new Date();
      if (isDoneStatus(updates.status) && !isDoneStatus(current.status)) {
        resolutionFields.resolution =
          updates.resolution ?? current.resolution ?? "DONE";
        resolutionFields.resolvedAt = new Date();
        resolutionFields.remainingEstimateMinutes = 0;
      } else if (!isDoneStatus(updates.status) && isDoneStatus(current.status)) {
        resolutionFields.resolution = null;
        resolutionFields.resolvedAt = null;
      }
    }

    const issue = await transaction.issue.update({
      where: { id },
      data: {
        ...fields,
        ...resolutionFields,
        ...(nextCustomFields !== undefined
          ? { customFields: nextCustomFields }
          : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? parseDueDate(dueDate) : null }
          : {}),
        ...(startDate !== undefined
          ? { startDate: startDate ? parseDueDate(startDate) : null }
          : {}),
        ...(componentIds
          ? {
              components: {
                deleteMany: {},
                create: componentIds.map((componentId) => ({
                  component: { connect: { id: componentId } },
                })),
              },
            }
          : {}),
        ...(labelIds
          ? {
              labels: {
                deleteMany: {},
                create: labelIds.map((labelId) => ({
                  label: { connect: { id: labelId } },
                })),
              },
            }
          : {}),
        activity: {
          create: activity,
        },
      },
      include: issueInclude,
    });

    return { issue, activityTypes, previousStatus, changedFields };
  });

  if (!result) return null;
  const { issue, activityTypes } = result;

  if (activityTypes.includes("ASSIGNEE_CHANGED") && issue.assignee) {
    await prisma.issueWatcher.upsert({
      where: {
        issueId_userId: { issueId: issue.id, userId: issue.assignee.userId },
      },
      create: { issueId: issue.id, userId: issue.assignee.userId },
      update: {},
    });
  }

  if (activityTypes.includes("ASSIGNEE_CHANGED") && issue.assignee) {
    await notifyRecipients([issue.assignee.userId], {
      type: "ISSUE_ASSIGNED",
      title: `Assigned: ${issue.title}`,
      body: `${actor.name} assigned ${issue.id} to you`,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    });
  }

  if (activityTypes.includes("STATUS_CHANGED")) {
    await notifyRecipients(watcherUserIds(issue), {
      type: "ISSUE_STATUS_CHANGED",
      title: `${issue.id} status changed`,
      body: `${actor.name} changed ${issue.id} to ${statusName(
        issue.status,
        workflow.statuses,
      )}`,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    });
  }

  if (updates.description !== undefined) {
    const mentionedMemberIds = extractMentionedMemberIds(issue.description);
    if (mentionedMemberIds.length > 0) {
      const mentionedUserIds = await resolveMemberUserIds(
        mentionedMemberIds,
        actor.organizationId,
      );
      await notifyRecipients(mentionedUserIds, {
        type: "ISSUE_MENTIONED",
        title: `Mentioned in: ${issue.title}`,
        body: `${actor.name} mentioned you in ${issue.id}`,
        organizationId: actor.organizationId,
        projectId: issue.projectId,
        issueId: issue.id,
        actorId: actor.id,
      });
    }
  }

  if (activityTypes.length > 0) {
    await runAutomations({
      trigger: activityTypes.includes("STATUS_CHANGED")
        ? "STATUS_CHANGED"
        : "ISSUE_UPDATED",
      issueId: issue.id,
      projectId: issue.projectId,
      actor,
      fromStatus: activityTypes.includes("STATUS_CHANGED")
        ? result.previousStatus
        : undefined,
      toStatus: updates.status,
      changedFields: result.changedFields,
    });
    const refreshed = await prisma.issue.findUnique({
      where: { id: issue.id },
      include: issueInclude,
    });
    if (refreshed) return serializeIssue(refreshed);
  }

  return serializeIssue(issue);
}

async function addCommentUnhooked(
  id: string,
  body: string,
  actor: WorkspaceActor,
) {
  const exists = await prisma.issue.findFirst({
    where: {
      id,
      organizationId: actor.organizationId,
      deletedAt: null,
    },
    select: { projectId: true },
  });
  if (!exists) return null;
  await assertActorCan(actor, exists.projectId, "comment");
  const { autoWatch } = await getNotificationSettings(actor.id);

  const issue = await prisma.issue.update({
    where: { id },
    data: {
      // Commenting starts watching, unless the person turned auto-watch off.
      ...(autoWatch
        ? {
            watchers: {
              upsert: {
                where: { issueId_userId: { issueId: id, userId: actor.id } },
                create: { user: { connect: { id: actor.id } } },
                update: {},
              },
            },
          }
        : {}),
      comments: {
        create: {
          body,
          author: actor.name,
          user: { connect: { id: actor.id } },
        },
      },
      activity: {
        create: {
          type: "COMMENT_ADDED",
          description: "commented on the issue",
          actor: actor.name,
          user: { connect: { id: actor.id } },
        },
      },
    },
    include: issueInclude,
  });

  const mentionedMemberIds = extractCommentMentionIds(body);
  const mentionedUserIds = await resolveMemberUserIds(
    mentionedMemberIds,
    actor.organizationId,
  );

  if (mentionedUserIds.length > 0) {
    await notifyRecipients(mentionedUserIds, {
      type: "ISSUE_MENTIONED",
      title: `Mentioned in: ${issue.title}`,
      body: `${actor.name} mentioned you in a comment on ${issue.id}`,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    });
  }

  const remainingWatchers = watcherUserIds(issue).filter(
    (userId) => !mentionedUserIds.includes(userId ?? ""),
  );
  await notifyRecipients(remainingWatchers, {
    type: "ISSUE_COMMENTED",
    title: `New comment on ${issue.id}`,
    body: `${actor.name} commented on ${issue.id}`,
    organizationId: actor.organizationId,
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: actor.id,
  });

  await runAutomations({
    trigger: "COMMENT_ADDED",
    issueId: issue.id,
    projectId: issue.projectId,
    actor,
  });

  return serializeIssue(issue);
}

export async function createIssue(
  ...args: Parameters<typeof createIssueUnhooked>
) {
  const issue = await createIssueUnhooked(...args);
  dispatchWebhook(args[1].organizationId, "issue_created", { issue });
  return issue;
}

export async function updateIssue(
  ...args: Parameters<typeof updateIssueUnhooked>
) {
  const issue = await updateIssueUnhooked(...args);
  if (issue) {
    dispatchWebhook(args[2].organizationId, "issue_updated", {
      issue,
      changes: Object.keys(args[1]),
    });
  }
  return issue;
}

export async function addComment(
  ...args: Parameters<typeof addCommentUnhooked>
) {
  const issue = await addCommentUnhooked(...args);
  if (issue) {
    dispatchWebhook(args[2].organizationId, "comment_created", {
      issueId: issue.id,
      comment: issue.comments?.at(-1) ?? null,
    });
  }
  return issue;
}
