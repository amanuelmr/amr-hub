"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest, useIssues } from "../../IssueProvider";
import type { Issue } from "../../data/issues";
import { DialogFooter, FormError, PlanningDialog } from "./SprintDialogs";

export type VersionSummary = {
  id: string;
  name: string;
  description: string | null;
  status: "UNRELEASED" | "RELEASED" | "ARCHIVED";
  startDate: string | null;
  releaseDate: string | null;
  releasedAt: string | null;
  issueCount: number;
  doneCount: number;
  inProgressCount: number;
};

type BulkResult = { id: string; ok: boolean; error?: string };

/** Loads a project's versions; `reload` refetches after changes. */
export function useProjectVersions(projectId: string, enabled = true) {
  const [state, setState] = useState<{
    versions: VersionSummary[];
    error: string | null;
    isLoading: boolean;
  }>({ versions: [], error: null, isLoading: enabled });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiRequest<VersionSummary[]>(
      `/api/projects/${encodeURIComponent(projectId)}/versions`,
      { signal: controller.signal },
    )
      .then((versions) =>
        setState({ versions, error: null, isLoading: false }),
      )
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          versions: [],
          error:
            error instanceof Error ? error.message : "Versions could not be loaded",
          isLoading: false,
        });
      });
    return () => controller.abort();
  }, [projectId, enabled, revision]);

  return { ...state, reload: () => setRevision((value) => value + 1) };
}

export async function createProjectVersion(projectId: string, name: string) {
  return apiRequest<VersionSummary>(
    `/api/projects/${encodeURIComponent(projectId)}/versions`,
    {
      method: "POST",
      body: JSON.stringify({ name, description: null, startDate: null, releaseDate: null }),
    },
  );
}

const NEW = "__new";

/**
 * Jira Kanban "Release": puts every done issue on the board into a version
 * and releases it, which takes the issues off the board.
 */
export function KanbanReleaseDialog({
  projectId,
  issues,
  onOpenChange,
}: {
  projectId: string;
  issues: Issue[];
  onOpenChange: (open: boolean) => void;
}) {
  const { refreshIssues } = useIssues();
  const { versions, isLoading, error: loadError } = useProjectVersions(projectId);
  const unreleased = versions.filter((version) => version.status === "UNRELEASED");
  const [choice, setChoice] = useState(NEW);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (issues.length === 0) {
      setError("There are no done work items to release.");
      return;
    }
    if (choice === NEW && !name.trim()) {
      setError("Give the version a name.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const versionId =
        choice === NEW
          ? (await createProjectVersion(projectId, name.trim())).id
          : choice;
      const { results } = await apiRequest<{ results: BulkResult[] }>(
        "/api/issues/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            issueIds: issues.map((issue) => issue.id),
            operation: "fixVersion",
            value: versionId,
          }),
        },
      );
      const failed = results.filter((result) => !result.ok);
      if (failed.length === results.length) {
        throw new Error(failed[0]?.error ?? "The work items could not be added to the version");
      }
      await apiRequest(
        `/api/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/release`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await refreshIssues();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The version could not be released",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open
      onOpenChange={onOpenChange}
      title="Release"
      description={`${issues.length} done ${issues.length === 1 ? "work item" : "work items"} will be added to the version and leave the board.`}
    >
      <form onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Version</span>
          <select
            value={choice}
            disabled={isLoading}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value={NEW}>Create a new version</option>
            {unreleased.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
        {choice === NEW && (
          <label className="form-field">
            <span>Version name</span>
            <input
              value={name}
              maxLength={80}
              autoFocus
              placeholder="e.g. 1.4.0"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <FormError error={error ?? loadError} />
        <DialogFooter
          onCancel={() => onOpenChange(false)}
          submitLabel="Release"
          isSubmitting={isSubmitting}
        />
      </form>
    </PlanningDialog>
  );
}
