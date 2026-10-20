"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import type { Project } from "../../../data/projects";
import { errorMessage } from "./adminUi";

export function DangerZone({
  project,
  canAdmin,
}: {
  project: Project;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const { refreshProjects, setActiveProjectId } = useProjects();
  const [confirmKey, setConfirmKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const archived = Boolean(project.archivedAt);

  const handleArchive = async () => {
    if (
      !archived &&
      !window.confirm(
        `Archive ${project.name}? It becomes read-only and is hidden from the sidebar and project lists. Work items stay viewable by key.`,
      )
    ) {
      return;
    }
    setIsArchiving(true);
    setError(null);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived: !archived }),
      });
      await refreshProjects();
    } catch (archiveError) {
      setError(errorMessage(archiveError, "Project could not be archived"));
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE",
      });
      setActiveProjectId(null);
      router.push("/projects");
      await refreshProjects();
    } catch (deleteError) {
      setError(errorMessage(deleteError, "Project could not be deleted"));
      setIsDeleting(false);
    }
  };

  if (!canAdmin) {
    return (
      <p className="pa-muted">
        Only project administrators can archive or delete this project.
      </p>
    );
  }

  return (
    <div className="pa-danger">
      <h3 className="pa-section-title">
        {archived ? "Restore this project" : "Archive this project"}
      </h3>
      <p className="pa-muted">
        {archived
          ? "Restoring makes the project editable again and brings it back to the sidebar and project lists."
          : "Archived projects are read-only and hidden from the sidebar and project lists (use the Archived filter on Projects to find them). Work items stay viewable by key."}
      </p>
      <button
        className="secondary-button"
        type="button"
        disabled={isArchiving}
        onClick={() => void handleArchive()}
      >
        {archived ? (
          <ArchiveRestore size={15} aria-hidden="true" />
        ) : (
          <Archive size={15} aria-hidden="true" />
        )}
        {isArchiving
          ? archived
            ? "Restoring…"
            : "Archiving…"
          : archived
            ? "Restore project"
            : "Archive project"}
      </button>

      <h3 className="pa-section-title pac-danger-title">Move to trash</h3>
      <p className="pa-muted">
        {project.name} and its {project.issueCount} work item
        {project.issueCount === 1 ? "" : "s"} move to the trash. Workspace
        owners can restore the project from Admin → Trash for 60 days; after
        that it&apos;s deleted permanently with its sprints, versions,
        components and automation rules.
      </p>
      <label className="form-field">
        <span>
          Type <strong>{project.key}</strong> to confirm
        </span>
        <input
          value={confirmKey}
          onChange={(event) => setConfirmKey(event.target.value.toUpperCase())}
          autoComplete="off"
          aria-label="Project key confirmation"
        />
      </label>
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="danger-button"
        type="button"
        disabled={confirmKey !== project.key || isDeleting}
        onClick={handleDelete}
      >
        {isDeleting ? "Moving to trash…" : "Move to trash"}
      </button>
    </div>
  );
}
