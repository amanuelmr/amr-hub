"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authClient } from "../lib/auth-client";
import {
  type Cycle,
  type Issue,
  type IssueStatus,
  type IssueUpdates,
  type NewCycleInput,
  type NewIssueInput,
  type SavedView,
  type SavedViewInput,
  type WorkspaceLabel,
  type WorkspaceMember,
} from "./data/issues";

/** One issue that changed since the last live poll (GET /api/live). */
export type LiveChange = {
  id: string;
  updatedAt: string;
  actorId: string | null;
  actorName: string | null;
  /** True when the signed-in user made the change (any tab). */
  self: boolean;
};

export type LiveEvent = {
  changes: LiveChange[];
  deleted: string[];
  /** Fresh copies of changed issues (at most LIVE_FETCH_LIMIT). */
  issues: Map<string, Issue>;
};

type LiveListener = (event: LiveEvent) => void;

const LIVE_POLL_MS = 10_000;
const LIVE_FETCH_LIMIT = 25;
const LIVE_MAX_IDS = 300;

export type IssueListResponse = {
  issues: Issue[];
  nextCursor: string | null;
};

type IssueContextValue = {
  issues: Issue[];
  labels: WorkspaceLabel[];
  savedViews: SavedView[];
  cycles: Cycle[];
  members: WorkspaceMember[];
  isLoading: boolean;
  createIssue: (issue: NewIssueInput) => Promise<Issue>;
  updateStatus: (id: string, status: IssueStatus) => Promise<boolean>;
  updateIssue: (id: string, updates: IssueUpdates) => Promise<boolean>;
  addComment: (issueId: string, body: string) => Promise<boolean>;
  createSavedView: (view: SavedViewInput) => Promise<SavedView>;
  deleteSavedView: (id: string) => Promise<boolean>;
  createCycle: (cycle: NewCycleInput) => Promise<Cycle>;
  refreshIssues: () => Promise<void>;
  /** Merge a server-returned issue into local state (insert if new). */
  replaceIssue: (issue: Issue) => void;
  removeIssue: (id: string) => void;
  /** Reload sprints after lifecycle changes (start, complete, reorder). */
  refreshCycles: () => Promise<void>;
  /** Reload saved filters after they are edited elsewhere (e.g. /filters). */
  refreshSavedViews: () => Promise<void>;
  /**
   * Live updates: `listener` runs after each poll that saw changes. Passing
   * `issueId` also asks the server whether that issue was deleted.
   */
  subscribeLive: (issueId: string | null, listener: LiveListener) => () => void;
};

const IssueContext = createContext<IssueContextValue | null>(null);

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => ({}));

  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign("/login");
    throw new Error("Your session has expired");
  }

  if (
    response.status === 409 &&
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    payload.code === "ORGANIZATION_REQUIRED" &&
    typeof window !== "undefined"
  ) {
    window.location.assign("/onboarding");
    throw new Error("Organization setup is required");
  }

  if (!response.ok) {
    const responseError =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : null;

    throw new Error(
      responseError ?? "The workspace request failed",
    );
  }

  return payload as T;
}

export function IssueProvider({ children }: { children: React.ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [labels, setLabels] = useState<WorkspaceLabel[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshIssues = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedIssues, loadedLabels, loadedViews, loadedCycles, loadedMembers] =
        await Promise.all([
          apiRequest<IssueListResponse>("/api/issues"),
          apiRequest<WorkspaceLabel[]>("/api/labels"),
          apiRequest<SavedView[]>("/api/views"),
          apiRequest<Cycle[]>("/api/cycles"),
          apiRequest<WorkspaceMember[]>("/api/members"),
        ]);
      setIssues(loadedIssues.issues);
      setLabels(loadedLabels);
      setSavedViews(loadedViews);
      setCycles(loadedCycles);
      setMembers(loadedMembers);
    } catch (requestError) {
      setError(messageFrom(requestError, "Issues could not be loaded"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      apiRequest<IssueListResponse>("/api/issues", {
        signal: controller.signal,
      }),
      apiRequest<WorkspaceLabel[]>("/api/labels", {
        signal: controller.signal,
      }),
      apiRequest<SavedView[]>("/api/views", {
        signal: controller.signal,
      }),
      apiRequest<Cycle[]>("/api/cycles", {
        signal: controller.signal,
      }),
      apiRequest<WorkspaceMember[]>("/api/members", {
        signal: controller.signal,
      }),
    ])
      .then(
        ([loadedIssues, loadedLabels, loadedViews, loadedCycles, loadedMembers]) => {
          setIssues(loadedIssues.issues);
          setLabels(loadedLabels);
          setSavedViews(loadedViews);
          setCycles(loadedCycles);
          setMembers(loadedMembers);
          setError(null);
        },
      )
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(messageFrom(requestError, "Issues could not be loaded"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const replaceIssue = useCallback((nextIssue: Issue) => {
    setIssues((current) =>
      current.some((issue) => issue.id === nextIssue.id)
        ? current.map((issue) =>
            issue.id === nextIssue.id ? { ...issue, ...nextIssue } : issue,
          )
        : [nextIssue, ...current],
    );
  }, []);

  const createIssue = useCallback(async (input: NewIssueInput) => {
    setError(null);

    try {
      const issue = await apiRequest<Issue>("/api/issues", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setIssues((current) => [issue, ...current]);
      return issue;
    } catch (requestError) {
      const message = messageFrom(requestError, "Issue could not be created");
      setError(message);
      throw new Error(message);
    }
  }, []);

  const updateIssue = useCallback(
    async (id: string, updates: IssueUpdates) => {
      setError(null);

      try {
        const issue = await apiRequest<Issue>(
          `/api/issues/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(updates),
          },
        );
        replaceIssue(issue);
        return true;
      } catch (requestError) {
        setError(messageFrom(requestError, "Issue could not be updated"));
        return false;
      }
    },
    [replaceIssue],
  );

  const updateStatus = useCallback(
    (id: string, status: IssueStatus) => updateIssue(id, { status }),
    [updateIssue],
  );

  const addComment = useCallback(
    async (issueId: string, body: string) => {
      setError(null);

      try {
        const issue = await apiRequest<Issue>(
          `/api/issues/${encodeURIComponent(issueId)}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body }),
          },
        );
        replaceIssue(issue);
        return true;
      } catch (requestError) {
        setError(messageFrom(requestError, "Comment could not be added"));
        return false;
      }
    },
    [replaceIssue],
  );

  const createSavedView = useCallback(async (input: SavedViewInput) => {
    setError(null);

    try {
      const view = await apiRequest<SavedView>("/api/views", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setSavedViews((current) =>
        [...current, view].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      return view;
    } catch (requestError) {
      const message = messageFrom(
        requestError,
        "Saved view could not be created",
      );
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deleteSavedView = useCallback(async (id: string) => {
    setError(null);

    try {
      await apiRequest<void>(`/api/views/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setSavedViews((current) => current.filter((view) => view.id !== id));
      return true;
    } catch (requestError) {
      setError(messageFrom(requestError, "Saved view could not be deleted"));
      return false;
    }
  }, []);

  const createCycle = useCallback(async (input: NewCycleInput) => {
    setError(null);

    try {
      const cycle = await apiRequest<Cycle>("/api/cycles", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setCycles((current) => [...current, cycle]);
      return cycle;
    } catch (requestError) {
      const message = messageFrom(requestError, "Cycle could not be created");
      setError(message);
      throw new Error(message);
    }
  }, []);

  const removeIssue = useCallback((id: string) => {
    setIssues((current) =>
      current
        .filter((issue) => issue.id !== id)
        .map((issue) =>
          issue.parentId === id
            ? { ...issue, parentId: null, parent: null }
            : issue,
        ),
    );
  }, []);

  // ---- Live updates: poll /api/live every 10s while the tab is visible ----
  const { data: authSession } = authClient.useSession();
  const currentUserId = authSession?.user.id ?? null;
  const issuesRef = useRef<Issue[]>(issues);
  const userIdRef = useRef<string | null>(currentUserId);
  const listenersRef = useRef(
    new Map<LiveListener, string | null>(),
  );
  useEffect(() => {
    issuesRef.current = issues;
    userIdRef.current = currentUserId;
  });

  const subscribeLive = useCallback(
    (issueId: string | null, listener: LiveListener) => {
      listenersRef.current.set(listener, issueId);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  useEffect(() => {
    let since: string | null = null;
    let inFlight = false;
    let cancelled = false;

    const poll = async () => {
      if (inFlight || cancelled || document.visibilityState !== "visible") {
        return;
      }
      inFlight = true;
      try {
        const watched = [...listenersRef.current.values()].filter(
          (id): id is string => Boolean(id),
        );
        const ids = [
          ...new Set([
            ...watched,
            ...issuesRef.current.map((issue) => issue.id),
          ]),
        ].slice(0, LIVE_MAX_IDS);
        const params = new URLSearchParams();
        if (since) params.set("since", since);
        if (ids.length > 0) params.set("ids", ids.join(","));
        const response = await fetch(`/api/live?${params}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          now: string;
          changes: Omit<LiveChange, "self">[];
          deleted: string[];
        };
        since = payload.now;
        const changes = payload.changes.map((change) => ({
          ...change,
          self: Boolean(change.actorId && change.actorId === userIdRef.current),
        }));
        const deleted = payload.deleted;
        if (changes.length === 0 && deleted.length === 0) return;

        if (deleted.length > 0) {
          setIssues((current) =>
            current.filter((issue) => !deleted.includes(issue.id)),
          );
        }

        const fetched = await Promise.all(
          changes.slice(0, LIVE_FETCH_LIMIT).map(async (change) => {
            try {
              const result = await fetch(
                `/api/issues/${encodeURIComponent(change.id)}`,
                { cache: "no-store" },
              );
              return result.ok ? ((await result.json()) as Issue) : null;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const fresh = new Map<string, Issue>();
        for (const issue of fetched) {
          if (!issue) continue;
          fresh.set(issue.id, issue);
          replaceIssue(issue);
        }
        const event: LiveEvent = { changes, deleted, issues: fresh };
        for (const listener of listenersRef.current.keys()) listener(event);
      } catch {
        // Offline or a transient failure: try again on the next tick.
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), LIVE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [replaceIssue]);

  const refreshCycles = useCallback(async () => {
    setCycles(await apiRequest<Cycle[]>("/api/cycles"));
  }, []);

  const refreshSavedViews = useCallback(async () => {
    setSavedViews(await apiRequest<SavedView[]>("/api/views"));
  }, []);

  const value = useMemo(
    () => ({
      issues,
      labels,
      savedViews,
      cycles,
      members,
      isLoading,
      createIssue,
      updateStatus,
      updateIssue,
      addComment,
      createSavedView,
      deleteSavedView,
      createCycle,
      refreshIssues,
      replaceIssue,
      removeIssue,
      refreshCycles,
      refreshSavedViews,
      subscribeLive,
    }),
    [
      subscribeLive,
      refreshSavedViews,
      replaceIssue,
      removeIssue,
      refreshCycles,
      issues,
      labels,
      savedViews,
      cycles,
      members,
      isLoading,
      createIssue,
      updateStatus,
      updateIssue,
      addComment,
      createSavedView,
      deleteSavedView,
      createCycle,
      refreshIssues,
    ],
  );

  return (
    <IssueContext.Provider value={value}>
      {children}
      {error && (
        <div className="sync-error" role="alert">
          <span>
            <strong>Workspace not synced</strong>
            {error}
          </span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </IssueContext.Provider>
  );
}

export function useIssues() {
  const context = useContext(IssueContext);

  if (!context) {
    throw new Error("useIssues must be used within an IssueProvider");
  }

  return context;
}
