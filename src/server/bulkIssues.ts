import prisma from "../../prisma/client";
import type { Issue, IssueUpdates } from "../app/data/issues";
import {
  InvalidParentError,
  UnknownAssigneeError,
  UnknownComponentError,
  UnknownCycleError,
  UnknownLabelError,
  UnknownVersionError,
  updateIssue,
  type WorkspaceActor,
} from "./issues";
import {
  InvalidStatusError,
  InvalidWorkTypeError,
  TransitionNotAllowedError,
} from "./workflows";
import { nextLabelIds, type BulkIssueRequest } from "./bulkIssueSchemas";

export type BulkIssueResult = {
  id: string;
  ok: boolean;
  error?: string;
  issue?: Issue;
  deleted?: boolean;
};

const DOMAIN_ERRORS = [
  UnknownLabelError,
  UnknownCycleError,
  UnknownAssigneeError,
  InvalidParentError,
  UnknownVersionError,
  UnknownComponentError,
  InvalidStatusError,
  TransitionNotAllowedError,
  InvalidWorkTypeError,
];

function updatesFor(request: Exclude<BulkIssueRequest, { operation: "delete" | "addLabels" | "removeLabels" }>): IssueUpdates {
  switch (request.operation) {
    case "transition":
      return { status: request.value };
    case "assign":
      return { assigneeId: request.value };
    case "priority":
      return { priority: request.value };
    case "sprint":
      return { cycleId: request.value };
    case "fixVersion":
      return { fixVersionId: request.value };
    case "flag":
      return { flagged: request.value };
  }
}

/** Deletes issues owned by the organization (callers must enforce owner role). */
export async function bulkDeleteIssues(
  issueIds: string[],
  organizationId: string,
): Promise<BulkIssueResult[]> {
  const existing = await prisma.issue.findMany({
    where: { id: { in: issueIds }, organizationId },
    select: { id: true },
  });
  const existingIds = existing.map((issue) => issue.id);

  if (existingIds.length > 0) {
    await prisma.$transaction([
      prisma.issueView.deleteMany({ where: { issueId: { in: existingIds } } }),
      prisma.issue.deleteMany({
        where: { id: { in: existingIds }, organizationId },
      }),
    ]);
  }

  return issueIds.map((id) =>
    existingIds.includes(id)
      ? { id, ok: true, deleted: true }
      : { id, ok: false, error: "Issue not found" },
  );
}

/**
 * Applies one change to many issues through updateIssue so history,
 * notifications, watchers and automation behave exactly like single edits.
 */
export async function bulkUpdateIssues(
  request: Exclude<BulkIssueRequest, { operation: "delete" }>,
  actor: WorkspaceActor,
): Promise<BulkIssueResult[]> {
  let currentLabels = new Map<string, string[]>();
  if (request.operation === "addLabels" || request.operation === "removeLabels") {
    const rows = await prisma.issueLabel.findMany({
      where: {
        issueId: { in: request.issueIds },
        issue: { organizationId: actor.organizationId },
      },
      select: { issueId: true, labelId: true },
    });
    currentLabels = rows.reduce((map, row) => {
      map.set(row.issueId, [...(map.get(row.issueId) ?? []), row.labelId]);
      return map;
    }, new Map<string, string[]>());
  }

  const results: BulkIssueResult[] = [];
  for (const id of request.issueIds) {
    try {
      let updates: IssueUpdates;
      if (request.operation === "addLabels" || request.operation === "removeLabels") {
        const next = nextLabelIds(currentLabels.get(id) ?? [], request.operation, request.value);
        if (next === null) {
          results.push({ id, ok: true });
          continue;
        }
        if (next.length > 10) {
          results.push({ id, ok: false, error: "Issues can have at most 10 labels" });
          continue;
        }
        updates = { labelIds: next };
      } else {
        updates = updatesFor(request);
      }

      const issue = await updateIssue(id, updates, actor);
      results.push(issue ? { id, ok: true, issue } : { id, ok: false, error: "Issue not found" });
    } catch (error) {
      if (DOMAIN_ERRORS.some((ErrorType) => error instanceof ErrorType)) {
        results.push({ id, ok: false, error: (error as Error).message });
      } else {
        console.error(`Bulk update failed for ${id}`, error);
        results.push({ id, ok: false, error: "Issue could not be updated" });
      }
    }
  }
  return results;
}
