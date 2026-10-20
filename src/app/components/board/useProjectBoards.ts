"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../IssueProvider";
import type { BoardConfig, ProjectBoard } from "../../data/projects";

/** A project's boards: the default board plus any extra ones. */
export function useProjectBoards(projectId: string) {
  const [boards, setBoards] = useState<ProjectBoard[] | null>(null);
  const base = `/api/projects/${encodeURIComponent(projectId)}/boards`;

  const refresh = useCallback(async () => {
    setBoards(await apiRequest<ProjectBoard[]>(base));
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<ProjectBoard[]>(base)
      .then((loaded) => !cancelled && setBoards(loaded))
      .catch(() => !cancelled && setBoards([]));
    return () => {
      cancelled = true;
    };
  }, [base]);

  const create = useCallback(
    async (input: { name: string; filterJql: string | null }) => {
      const result = await apiRequest<{ id: string; boards: ProjectBoard[] }>(base, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setBoards(result.boards);
      return result.id;
    },
    [base],
  );

  const update = useCallback(
    async (
      boardId: string,
      input: { name?: string; filterJql?: string | null; config?: BoardConfig },
    ) => {
      setBoards(
        await apiRequest<ProjectBoard[]>(`${base}/${encodeURIComponent(boardId)}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        }),
      );
    },
    [base],
  );

  const remove = useCallback(
    async (boardId: string) => {
      await apiRequest<unknown>(`${base}/${encodeURIComponent(boardId)}`, {
        method: "DELETE",
      });
      setBoards((current) => current?.filter((board) => board.id !== boardId) ?? null);
    },
    [base],
  );

  return { boards, refresh, create, update, remove };
}
