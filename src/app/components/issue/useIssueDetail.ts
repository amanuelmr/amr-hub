"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, useIssues } from "../../IssueProvider";
import type { Issue, IssueUpdates } from "../../data/issues";
import type { AttachmentSummary, Worklog } from "./types";

export type IssueDetailState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; issue: Issue };

export function issueUrl(id: string, suffix = "") {
  return `/api/issues/${encodeURIComponent(id)}${suffix}`;
}

async function fetchIssue(id: string): Promise<Issue | null> {
  const response = await fetch(issueUrl(id), { cache: "no-store" });
  if (response.status === 404) return null;
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Your session has expired");
  }
  if (!response.ok) throw new Error("Issue could not be loaded");
  return (await response.json()) as Issue;
}

/** Fetches an optional project-scoped list; a missing endpoint yields null. */
export async function fetchOptionalList<T>(url: string): Promise<T[] | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? (payload as T[]) : null;
  } catch {
    return null;
  }
}

/** Set when someone else changes the open issue (live updates). */
export type RemoteUpdate = { actorName: string | null; at: number };

export function useIssueDetail(id: string) {
  const { replaceIssue, subscribeLive } = useIssues();
  const [remoteUpdate, setRemoteUpdate] = useState<RemoteUpdate | null>(null);
  const [state, setState] = useState<IssueDetailState>({ status: "loading" });
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const applyIssue = useCallback(
    (issue: Issue | null | undefined) => {
      if (!issue) return;
      setState({ status: "ready", issue });
      replaceIssue(issue);
    },
    [replaceIssue],
  );

  const refreshWorklogs = useCallback(async () => {
    setWorklogs(await apiRequest<Worklog[]>(issueUrl(id, "/worklogs")));
  }, [id]);

  const refreshAttachments = useCallback(async () => {
    setAttachments(
      await apiRequest<AttachmentSummary[]>(issueUrl(id, "/attachments")),
    );
  }, [id]);

  const refresh = useCallback(async () => {
    try {
      const issue = await fetchIssue(id);
      if (!issue) {
        setState({ status: "missing" });
        return;
      }
      applyIssue(issue);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Issue failed",
      });
    }
  }, [applyIssue, id]);

  useEffect(() => {
    let cancelled = false;
    fetchIssue(id)
      .then((issue) => {
        if (cancelled) return;
        if (!issue) {
          setState({ status: "missing" });
          return;
        }
        applyIssue(issue);
        void fetch(issueUrl(id, "/view"), { method: "POST" }).catch(() => {});
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Issue could not load",
          });
        }
      });
    apiRequest<Worklog[]>(issueUrl(id, "/worklogs"))
      .then((loaded) => !cancelled && setWorklogs(loaded))
      .catch(() => {});
    apiRequest<AttachmentSummary[]>(issueUrl(id, "/attachments"))
      .then((loaded) => !cancelled && setAttachments(loaded))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyIssue, id]);

  // Live updates: take the provider's fresh copy when this issue changes.
  useEffect(
    () =>
      subscribeLive(id, (event) => {
        if (event.deleted.includes(id)) {
          setState({ status: "missing" });
          return;
        }
        const change = event.changes.find((candidate) => candidate.id === id);
        if (!change) return;
        const fresh = event.issues.get(id);
        if (fresh) setState({ status: "ready", issue: fresh });
        if (change.self) return;
        setRemoteUpdate({ actorName: change.actorName, at: Date.now() });
        apiRequest<Worklog[]>(issueUrl(id, "/worklogs"))
          .then(setWorklogs)
          .catch(() => {});
        apiRequest<AttachmentSummary[]>(issueUrl(id, "/attachments"))
          .then(setAttachments)
          .catch(() => {});
      }),
    [id, subscribeLive],
  );

  const dismissRemoteUpdate = useCallback(() => setRemoteUpdate(null), []);

  /** Runs a mutation, applies the returned issue, and surfaces errors. */
  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      setActionError(null);
      try {
        return await action();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "The change failed",
        );
        return null;
      }
    },
    [],
  );

  const patch = useCallback(
    async (updates: IssueUpdates) => {
      const issue = await run(() =>
        apiRequest<Issue>(issueUrl(id), {
          method: "PATCH",
          body: JSON.stringify(updates),
        }),
      );
      if (issue) await refresh();
      return Boolean(issue);
    },
    [id, refresh, run],
  );

  return {
    state,
    worklogs,
    attachments,
    actionError,
    setActionError,
    applyIssue,
    refresh,
    refreshWorklogs,
    refreshAttachments,
    run,
    patch,
    remoteUpdate,
    dismissRemoteUpdate,
  };
}

export type IssueDetailController = ReturnType<typeof useIssueDetail>;
