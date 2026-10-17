"use client";

import { useCallback, useState } from "react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import type { Cycle, Issue, IssueStatus } from "../../data/issues";

export type RankRequest = {
  issueIds: string[];
  afterId?: string;
  beforeId?: string;
  cycleId?: string | null;
  status?: IssueStatus;
};

type RankResponse = {
  issues: Issue[];
  ranks: Record<string, number>;
  rebalanced: boolean;
};

type SprintResult = {
  sprint: Cycle;
  createdSprint: Cycle | null;
  issues: Issue[];
};

export type SprintFields = {
  name?: string;
  goal?: string | null;
  startDate?: string;
  endDate?: string;
  capacity?: number;
};

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Board/backlog mutations with optimistic overrides. Pages render
 * `applyOverrides(issues)` so pending moves show instantly and roll back
 * when the request fails.
 */
export function usePlanningActions() {
  const { issues, replaceIssue, refreshCycles } = useIssues();
  const { refreshProjects } = useProjects();
  const [overrides, setOverrides] = useState<Map<string, Partial<Issue>>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  const applyOverrides = useCallback(
    (list: Issue[]) =>
      overrides.size === 0
        ? list
        : list.map((issue) => {
            const override = overrides.get(issue.id);
            return override ? { ...issue, ...override } : issue;
          }),
    [overrides],
  );

  const setPending = useCallback(
    (entries: [string, Partial<Issue>][] | null, ids: string[]) => {
      setOverrides((current) => {
        const next = new Map(current);
        for (const id of ids) next.delete(id);
        for (const [id, value] of entries ?? []) next.set(id, value);
        return next;
      });
    },
    [],
  );

  const rank = useCallback(
    async (request: RankRequest, optimistic: Map<string, Partial<Issue>>) => {
      setError(null);
      const ids = [...optimistic.keys()];
      setPending([...optimistic.entries()], ids);
      try {
        const response = await apiRequest<RankResponse>("/api/issues/rank", {
          method: "POST",
          body: JSON.stringify(request),
        });
        for (const updated of response.issues) replaceIssue(updated);
        for (const [id, value] of Object.entries(response.ranks)) {
          const existing = issues.find((candidate) => candidate.id === id);
          if (existing) replaceIssue({ ...existing, rank: value });
        }
        return true;
      } catch (requestError) {
        setError(message(requestError, "The issues could not be moved"));
        return false;
      } finally {
        setPending(null, ids);
      }
    },
    [issues, replaceIssue, setPending],
  );

  const sprintRequest = useCallback(
    async <T,>(url: string, method: string, body?: unknown) => {
      setError(null);
      const result = await apiRequest<T>(url, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      await Promise.all([refreshCycles(), refreshProjects()]);
      return result;
    },
    [refreshCycles, refreshProjects],
  );

  const createSprint = useCallback(
    (projectId: string, fields: SprintFields = {}) =>
      sprintRequest<Cycle>("/api/sprints", "POST", { projectId, ...fields }),
    [sprintRequest],
  );

  const updateSprint = useCallback(
    (id: string, fields: SprintFields) =>
      sprintRequest<Cycle>(`/api/sprints/${encodeURIComponent(id)}`, "PATCH", fields),
    [sprintRequest],
  );

  const startSprint = useCallback(
    (
      id: string,
      fields: { name?: string; goal?: string | null; startDate: string; endDate: string },
    ) =>
      sprintRequest<Cycle>(
        `/api/sprints/${encodeURIComponent(id)}/start`,
        "POST",
        fields,
      ),
    [sprintRequest],
  );

  const completeSprint = useCallback(
    async (
      id: string,
      destination: { destination: "BACKLOG" | "SPRINT" | "NEW_SPRINT"; sprintId?: string },
    ) => {
      const result = await sprintRequest<SprintResult>(
        `/api/sprints/${encodeURIComponent(id)}/complete`,
        "POST",
        destination,
      );
      for (const issue of result.issues) replaceIssue(issue);
      return result;
    },
    [replaceIssue, sprintRequest],
  );

  const deleteSprint = useCallback(
    async (id: string) => {
      const result = await sprintRequest<{ issues: Issue[] }>(
        `/api/sprints/${encodeURIComponent(id)}`,
        "DELETE",
      );
      for (const issue of result.issues) replaceIssue(issue);
      return result;
    },
    [replaceIssue, sprintRequest],
  );

  return {
    applyOverrides,
    rank,
    error,
    setError,
    createSprint,
    updateSprint,
    startSprint,
    completeSprint,
    deleteSprint,
  };
}
