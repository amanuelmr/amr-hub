import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { assertActorPermission } from "./projectAccess";
import type { Issue, IssueStatus } from "../app/data/issues";
import { isDoneStatus, statusName } from "../app/data/workflow";
import { validateIssueStatus } from "./workflows";
import { runAutomations } from "./automation";
import {
  issueInclude,
  serializeIssue,
  watcherUserIds,
  type WorkspaceActor,
} from "./issues";
import { notifyRecipients } from "./notifications";

export const RANK_SPACING = 1000;
export const MIN_RANK_GAP = 1e-6;

export type RankedItem = { id: string; rank: number };

/**
 * Evenly spaced ranks for `count` items strictly between two neighbours.
 * Returns null when the gap is too small and the project must be rebalanced.
 */
export function computeBlockRanks(
  lower: number | null,
  upper: number | null,
  count: number,
): number[] | null {
  if (count <= 0) return [];
  if (lower === null && upper === null) {
    return Array.from({ length: count }, (_, index) => (index + 1) * RANK_SPACING);
  }
  if (lower === null) {
    return Array.from(
      { length: count },
      (_, index) => (upper as number) - (count - index) * RANK_SPACING,
    );
  }
  if (upper === null) {
    return Array.from(
      { length: count },
      (_, index) => lower + (index + 1) * RANK_SPACING,
    );
  }
  const step = (upper - lower) / (count + 1);
  if (!(step >= MIN_RANK_GAP)) return null;
  return Array.from({ length: count }, (_, index) => lower + step * (index + 1));
}

/** Assigns fresh, evenly spaced ranks to an ordered id list. */
export function rebalanceRanks(orderedIds: string[]) {
  return new Map(
    orderedIds.map((id, index) => [id, (index + 1) * RANK_SPACING] as const),
  );
}

export class InvalidRankTargetError extends Error {
  constructor(message = "Issues cannot be ranked relative to themselves") {
    super(message);
    this.name = "InvalidRankTargetError";
  }
}

export type RankMovePlan = {
  /** New rank for every issue whose rank changes. */
  ranks: Map<string, number>;
  rebalanced: boolean;
};

/**
 * Plans moving a block of issues inside the project's global rank order.
 * `afterId` places the block directly after that issue, `beforeId` directly
 * before it (Jira's rankAfterIssue / rankBeforeIssue). With neither, the
 * block goes to the end. `ordered` must be sorted by rank.
 */
export function planRankMove({
  ordered,
  movedIds,
  beforeId,
  afterId,
}: {
  ordered: RankedItem[];
  movedIds: string[];
  beforeId?: string | null;
  afterId?: string | null;
}): RankMovePlan {
  const moved = new Set(movedIds);
  if ((beforeId && moved.has(beforeId)) || (afterId && moved.has(afterId))) {
    throw new InvalidRankTargetError();
  }

  const remaining = ordered.filter((item) => !moved.has(item.id));
  let insertAt: number;

  if (afterId) {
    const index = remaining.findIndex((item) => item.id === afterId);
    if (index === -1) throw new InvalidRankTargetError("Unknown rank target");
    insertAt = index + 1;
  } else if (beforeId) {
    const index = remaining.findIndex((item) => item.id === beforeId);
    if (index === -1) throw new InvalidRankTargetError("Unknown rank target");
    insertAt = index;
  } else {
    insertAt = remaining.length;
  }

  const lower = remaining[insertAt - 1] ?? null;
  let upper = remaining[insertAt] ?? null;
  if (afterId && beforeId) {
    const explicitUpper = remaining.find((item) => item.id === beforeId);
    if (!explicitUpper) throw new InvalidRankTargetError("Unknown rank target");
    if (lower && explicitUpper.rank > lower.rank) upper = explicitUpper;
  }

  const blockRanks = computeBlockRanks(
    lower?.rank ?? null,
    upper?.rank ?? null,
    movedIds.length,
  );

  if (blockRanks) {
    return {
      ranks: new Map(movedIds.map((id, index) => [id, blockRanks[index]])),
      rebalanced: false,
    };
  }

  const nextOrder = [
    ...remaining.slice(0, insertAt).map((item) => item.id),
    ...movedIds,
    ...remaining.slice(insertAt).map((item) => item.id),
  ];
  const current = new Map(ordered.map((item) => [item.id, item.rank]));
  const ranks = new Map<string, number>();
  for (const [id, rank] of rebalanceRanks(nextOrder)) {
    if (current.get(id) !== rank) ranks.set(id, rank);
  }
  return { ranks, rebalanced: true };
}

export class UnknownRankIssueError extends Error {
  constructor() {
    super("One or more issues do not exist in this project");
    this.name = "UnknownRankIssueError";
  }
}

export class UnknownRankSprintError extends Error {
  constructor() {
    super("The selected sprint does not exist in this project");
    this.name = "UnknownRankSprintError";
  }
}

export type RankIssuesInput = {
  issueIds: string[];
  beforeId?: string;
  afterId?: string;
  cycleId?: string | null;
  status?: IssueStatus;
};

export type RankIssuesResult = {
  issues: Issue[];
  /** Ranks of every other issue changed by a rebalance. */
  ranks: Record<string, number>;
  rebalanced: boolean;
};

/**
 * Re-ranks a block of issues and optionally moves them to a sprint and/or
 * status in one transaction. All issues must belong to the same project.
 */
export async function rankIssues(
  input: RankIssuesInput,
  actor: WorkspaceActor,
): Promise<RankIssuesResult> {
  const owner = await prisma.issue.findFirst({
    where: { id: { in: input.issueIds }, organizationId: actor.organizationId },
    select: { projectId: true },
  });
  if (owner) await assertActorPermission(actor, owner.projectId, "edit", "Issue not found");
  const result = await prisma.$transaction(async (transaction) => {
    const targets = await transaction.issue.findMany({
      where: {
        id: { in: input.issueIds },
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        cycleId: true,
        cycle: { select: { name: true } },
      },
    });
    const projectIds = new Set(targets.map((issue) => issue.projectId));
    if (targets.length !== input.issueIds.length || projectIds.size !== 1) {
      throw new UnknownRankIssueError();
    }
    const projectId = targets[0].projectId;
    let workflow: Awaited<ReturnType<typeof validateIssueStatus>> | null = null;
    if (input.status) {
      for (const target of targets) {
        if (target.status === input.status) continue;
        workflow = await validateIssueStatus(
          projectId,
          target.status,
          input.status,
          transaction,
        );
      }
    }

    let nextCycleName: string | null = null;
    if (input.cycleId) {
      const cycle = await transaction.cycle.findFirst({
        where: {
          id: input.cycleId,
          projectId,
          organizationId: actor.organizationId,
        },
        select: { name: true },
      });
      if (!cycle) throw new UnknownRankSprintError();
      nextCycleName = cycle.name;
    }

    const ordered = await transaction.issue.findMany({
      where: { projectId, organizationId: actor.organizationId },
      orderBy: [{ rank: "asc" }, { sequence: "asc" }],
      select: { id: true, rank: true },
    });
    const plan = planRankMove({
      ordered,
      movedIds: input.issueIds,
      beforeId: input.beforeId,
      afterId: input.afterId,
    });

    const statusChanged: { id: string; from: IssueStatus }[] = [];
    const moved = new Set(input.issueIds);

    for (const target of targets) {
      const activity: Prisma.ActivityCreateWithoutIssueInput[] = [];
      const data: Prisma.IssueUpdateInput = {};
      const rank = plan.ranks.get(target.id);
      if (rank !== undefined) data.rank = rank;

      if (input.cycleId !== undefined && input.cycleId !== target.cycleId) {
        data.cycle = input.cycleId
          ? { connect: { id: input.cycleId } }
          : { disconnect: true };
        activity.push({
          type: "CYCLE_CHANGED",
          description: nextCycleName
            ? `moved the issue to ${nextCycleName}`
            : target.cycle
              ? `removed the issue from ${target.cycle.name}`
              : "removed the issue from its cycle",
          actor: actor.name,
          user: { connect: { id: actor.id } },
        });
      }

      if (input.status && input.status !== target.status) {
        const from = target.status as IssueStatus;
        data.status = input.status;
        if (isDoneStatus(input.status) && !isDoneStatus(from)) {
          data.resolution = "DONE";
          data.resolvedAt = new Date();
          data.remainingEstimateMinutes = 0;
        } else if (!isDoneStatus(input.status) && isDoneStatus(from)) {
          data.resolution = null;
          data.resolvedAt = null;
        }
        activity.push({
          type: "STATUS_CHANGED",
          description: `changed status from ${statusName(
            from,
            workflow?.statuses,
          )} to ${statusName(input.status, workflow?.statuses)}`,
          actor: actor.name,
          user: { connect: { id: actor.id } },
        });
        statusChanged.push({ id: target.id, from });
      }

      if (activity.length > 0) data.activity = { create: activity };
      if (Object.keys(data).length > 0) {
        await transaction.issue.update({ where: { id: target.id }, data });
      }
    }

    const ranks: Record<string, number> = {};
    for (const [id, rank] of plan.ranks) {
      if (moved.has(id)) continue;
      await transaction.issue.update({ where: { id }, data: { rank } });
      ranks[id] = rank;
    }

    return { projectId, statusChanged, ranks, rebalanced: plan.rebalanced };
  });

  for (const change of result.statusChanged) {
    const issue = await prisma.issue.findUnique({
      where: { id: change.id },
      include: issueInclude,
    });
    if (!issue) continue;
    await notifyRecipients(watcherUserIds(issue), {
      type: "ISSUE_STATUS_CHANGED",
      title: `${issue.id} status changed`,
      body: `${actor.name} changed ${issue.id} to ${statusName(issue.status)}`,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    });
    await runAutomations({
      trigger: "STATUS_CHANGED",
      issueId: issue.id,
      projectId: issue.projectId,
      actor,
      fromStatus: change.from,
      toStatus: input.status,
    });
  }

  const issues = await prisma.issue.findMany({
    where: { id: { in: input.issueIds }, organizationId: actor.organizationId },
    include: issueInclude,
    orderBy: { rank: "asc" },
  });

  return {
    issues: issues.map(serializeIssue),
    ranks: result.ranks,
    rebalanced: result.rebalanced,
  };
}
