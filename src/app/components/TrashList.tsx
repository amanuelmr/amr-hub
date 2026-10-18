"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { apiRequest } from "../IssueProvider";

export type TrashedIssueRow = {
  id: string;
  title: string;
  kind: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  expiresAt: string;
  subtaskCount: number;
};

export type TrashedProjectRow = {
  id: string;
  key: string;
  name: string;
  issueCount: number;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  expiresAt: string;
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function daysLeft(expiresAt: string) {
  const days = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000),
  );
  return days === 1 ? "1 day" : `${days} days`;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Loads a trash endpoint and exposes restore / permanent delete actions. */
export function useTrash<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await apiRequest<T>(url));
      setError(null);
    } catch (loadError) {
      setError(messageOf(loadError, "Trash could not be loaded"));
    }
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<T>(url, { signal: controller.signal })
      .then((loaded) => {
        setData(loaded);
        setError(null);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(messageOf(loadError, "Trash could not be loaded"));
        }
      });
    return () => controller.abort();
  }, [url]);

  const act = async (
    id: string,
    target: string,
    method: "POST" | "DELETE",
    success: string,
  ) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(target, { method });
      setNotice(success);
      await reload();
      return true;
    } catch (actionError) {
      setError(messageOf(actionError, "That didn't work"));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return { data, error, notice, busyId, act, reload };
}

export function TrashMessages({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (!error && !notice) return null;
  return (
    <p
      className={error ? "form-submit-error" : "pa-success"}
      role={error ? "alert" : "status"}
    >
      {error ?? notice}
    </p>
  );
}

export function TrashedIssuesTable({
  issues,
  showProject,
  busyId,
  onRestore,
  onPurge,
}: {
  issues: TrashedIssueRow[];
  showProject: boolean;
  busyId: string | null;
  onRestore: (issue: TrashedIssueRow) => void;
  onPurge: (issue: TrashedIssueRow) => void;
}) {
  if (issues.length === 0) {
    return <p className="pa-muted">There are no work items in the trash.</p>;
  }
  return (
    <div className="pa-table-wrap pac-table-wrap">
      <table className="pa-table pac-table">
        <thead>
          <tr>
            <th>Work item</th>
            {showProject && <th>Project</th>}
            <th>Deleted by</th>
            <th>Deleted</th>
            <th>Deletes in</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.id}>
              <td>
                <span className="pa-key">{issue.id}</span>{" "}
                <span className="pac-cell-title">{issue.title}</span>
                {issue.subtaskCount > 0 && (
                  <small className="pa-muted">
                    {" "}
                    + {issue.subtaskCount} subtask{issue.subtaskCount === 1 ? "" : "s"}
                  </small>
                )}
              </td>
              {showProject && <td>{issue.projectName}</td>}
              <td>{issue.deletedBy?.name ?? "Unknown"}</td>
              <td>{formatWhen(issue.deletedAt)}</td>
              <td>{daysLeft(issue.expiresAt)}</td>
              <td>
                <div className="pa-actions-cell">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busyId === issue.id}
                    onClick={() => onRestore(issue)}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Restore
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busyId === issue.id}
                    aria-label={`Delete ${issue.id} permanently`}
                    title="Delete permanently"
                    onClick={() => onPurge(issue)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrashedProjectsTable({
  projects,
  busyId,
  onRestore,
  onPurge,
}: {
  projects: TrashedProjectRow[];
  busyId: string | null;
  onRestore: (project: TrashedProjectRow) => void;
  onPurge: (project: TrashedProjectRow) => void;
}) {
  if (projects.length === 0) {
    return <p className="pa-muted">There are no projects in the trash.</p>;
  }
  return (
    <div className="pa-table-wrap pac-table-wrap">
      <table className="pa-table pac-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Work items</th>
            <th>Deleted by</th>
            <th>Deleted</th>
            <th>Deletes in</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>
                <span className="pa-key">{project.key}</span>{" "}
                <span className="pac-cell-title">{project.name}</span>
              </td>
              <td>{project.issueCount}</td>
              <td>{project.deletedBy?.name ?? "Unknown"}</td>
              <td>{formatWhen(project.deletedAt)}</td>
              <td>{daysLeft(project.expiresAt)}</td>
              <td>
                <div className="pa-actions-cell">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busyId === project.id}
                    onClick={() => onRestore(project)}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Restore
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busyId === project.id}
                    aria-label={`Delete ${project.name} permanently`}
                    title="Delete permanently"
                    onClick={() => onPurge(project)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function issueTrashActions(
  act: ReturnType<typeof useTrash>["act"],
  after?: () => void,
) {
  return {
    onRestore: (issue: TrashedIssueRow) =>
      void act(
        issue.id,
        `/api/trash/issues/${encodeURIComponent(issue.id)}`,
        "POST",
        `${issue.id} was restored`,
      ).then((ok) => ok && after?.()),
    onPurge: (issue: TrashedIssueRow) => {
      if (
        !window.confirm(
          `Delete ${issue.id} permanently? Its comments, attachments and work logs are deleted too. This can't be undone.`,
        )
      ) {
        return;
      }
      void act(
        issue.id,
        `/api/trash/issues/${encodeURIComponent(issue.id)}`,
        "DELETE",
        `${issue.id} was deleted permanently`,
      );
    },
  };
}
