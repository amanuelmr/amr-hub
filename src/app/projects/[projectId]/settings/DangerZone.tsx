"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import type { Project } from "../../../data/projects";
import { errorMessage } from "./adminUi";

export function DangerZone({
  project,
  isOwner,
}: {
  project: Project;
  isOwner: boolean;
}) {
  const router = useRouter();
  const { refreshProjects, setActiveProjectId } = useProjects();
  const [confirmKey, setConfirmKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  return (
    <div className="pa-danger">
      <h3 className="pa-section-title">Delete this project</h3>
      <p className="pa-muted">
        Deleting {project.name} permanently removes its {project.issueCount}{" "}
        issue{project.issueCount === 1 ? "" : "s"}, sprints, versions,
        components and automation rules. This can&apos;t be undone.
      </p>
      {!isOwner ? (
        <p className="pa-muted">Only workspace owners can delete projects.</p>
      ) : (
        <>
          <label className="form-field">
            <span>
              Type <strong>{project.key}</strong> to confirm
            </span>
            <input
              value={confirmKey}
              onChange={(event) =>
                setConfirmKey(event.target.value.toUpperCase())
              }
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
            {isDeleting ? "Deleting..." : "Delete project"}
          </button>
        </>
      )}
    </div>
  );
}
