"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  FolderKanban,
  Lock,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { apiRequest } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { authClient } from "../../lib/auth-client";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import {
  PROJECT_ACCESS_LABELS,
  PROJECT_STATUS_LABELS,
  type Project,
} from "../data/projects";

type TypeFilter = "ALL" | "SCRUM" | "KANBAN";
type StateFilter = "ACTIVE" | "ARCHIVED";

function sortProjects(projects: Project[], starred: Record<string, boolean>) {
  return [...projects].sort((left, right) => {
    const leftStar = starred[left.id] ?? left.starred ?? false;
    const rightStar = starred[right.id] ?? right.starred ?? false;
    if (leftStar !== rightStar) return leftStar ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export default function ProjectsPage() {
  const { projects: activeProjects, allProjects, isLoading } = useProjects();
  const [stateFilter, setStateFilter] = useState<StateFilter>("ACTIVE");
  const archivedCount = allProjects.length - activeProjects.length;
  const projects = useMemo(
    () =>
      stateFilter === "ARCHIVED"
        ? allProjects.filter((project) => project.archivedAt)
        : activeProjects,
    [stateFilter, allProjects, activeProjects],
  );
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [starOverrides, setStarOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortProjects(
      projects.filter(
        (project) =>
          (typeFilter === "ALL" || project.boardType === typeFilter) &&
          (!needle ||
          project.name.toLowerCase().includes(needle) ||
          project.key.toLowerCase().includes(needle) ||
          (project.leadName ?? "").toLowerCase().includes(needle)),
      ),
      starOverrides,
    );
  }, [projects, query, typeFilter, starOverrides]);

  const toggleStar = async (project: Project) => {
    const next = !(starOverrides[project.id] ?? project.starred ?? false);
    setStarOverrides((current) => ({ ...current, [project.id]: next }));
    setError(null);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/star`, {
        method: next ? "POST" : "DELETE",
      });
    } catch (starError) {
      setStarOverrides((current) => ({ ...current, [project.id]: !next }));
      setError(
        starError instanceof Error
          ? starError.message
          : "Star could not be saved",
      );
    }
  };

  if (isLoading && allProjects.length === 0) {
    return <WorkspaceLoading label="projects" />;
  }

  return (
    <div className="page projects-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">Projects</h1>
        {!isViewer && (
          <div className="jira-page-actions">
            <Link
              className="primary-button jira-compact-button"
              href="/projects/new"
            >
              <Plus size={16} aria-hidden="true" />
              Create project
            </Link>
          </div>
        )}
      </header>

      {allProjects.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={24} aria-hidden="true" />
          <h2>No projects yet</h2>
          <p>Create a project to start organizing issues and sprints.</p>
          {!isViewer && (
            <Link className="secondary-button" href="/projects/new">
              <Plus size={15} aria-hidden="true" />
              Create project
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="jira-toolbar">
            <label className="jira-toolbar-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search projects"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search projects"
              />
            </label>
            <label className="jira-toolbar-select">
              <span className="sr-only">Project type</span>
              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as TypeFilter)
                }
              >
                <option value="ALL">All project types</option>
                <option value="SCRUM">Scrum</option>
                <option value="KANBAN">Kanban</option>
              </select>
            </label>
            <label className="jira-toolbar-select">
              <span className="sr-only">Project state</span>
              <select
                value={stateFilter}
                onChange={(event) =>
                  setStateFilter(event.target.value as StateFilter)
                }
              >
                <option value="ACTIVE">Active projects</option>
                <option value="ARCHIVED">
                  Archived projects{archivedCount ? ` (${archivedCount})` : ""}
                </option>
              </select>
            </label>
          </div>
          {error && (
            <p className="form-submit-error" role="alert">
              {error}
            </p>
          )}
          <div className="jira-table-wrap">
            <table className="jira-table">
              <thead>
                <tr>
                  <th aria-label="Starred" />
                  <th>Name</th>
                  <th>Key</th>
                  <th>Type</th>
                  <th>Lead</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((project) => {
                  const starred =
                    starOverrides[project.id] ?? project.starred ?? false;
                  const progress =
                    project.issueCount === 0
                      ? 0
                      : Math.round(
                          (project.doneIssueCount / project.issueCount) * 100,
                        );
                  return (
                    <tr key={project.id}>
                      <td>
                        <button
                          type="button"
                          className={starred ? "jira-star active" : "jira-star"}
                          aria-pressed={starred}
                          aria-label={
                            starred
                              ? `Unstar ${project.name}`
                              : `Star ${project.name}`
                          }
                          onClick={() => toggleStar(project)}
                        >
                          <Star size={15} aria-hidden="true" />
                        </button>
                      </td>
                      <td>
                        <Link
                          className="jira-table-name"
                          href={`/projects/${project.id}`}
                        >
                          <span
                            className="project-shell-avatar"
                            style={{
                              background: project.color ?? "var(--gray-300)",
                            }}
                            aria-hidden="true"
                          >
                            {project.key.slice(0, 2)}
                          </span>
                          {project.name}
                          {project.accessLevel === "PRIVATE" && (
                            <Lock
                              size={13}
                              className="pac-lock"
                              aria-label="Private project"
                            >
                              <title>{PROJECT_ACCESS_LABELS.PRIVATE.description}</title>
                            </Lock>
                          )}
                          {project.accessLevel === "LIMITED" && (
                            <LockKeyhole
                              size={13}
                              className="pac-lock"
                              aria-label="Limited project"
                            >
                              <title>{PROJECT_ACCESS_LABELS.LIMITED.description}</title>
                            </LockKeyhole>
                          )}
                          {project.archivedAt && (
                            <span className="pac-tag">
                              <Archive size={11} aria-hidden="true" /> Archived
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="jira-table-key">{project.key}</td>
                      <td>
                        {project.boardType === "KANBAN" ? "Kanban" : "Scrum"}
                      </td>
                      <td>
                        {project.leadName ?? (
                          <span className="jira-table-meta">—</span>
                        )}
                      </td>
                      <td className="jira-progress-cell">
                        <span className="jira-progress-track">
                          <span
                            className="jira-progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                        <span className="jira-table-meta">
                          {project.doneIssueCount}/{project.issueCount}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`project-status-badge project-status-${project.status.toLowerCase()}`}
                        >
                          {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                      </td>
                      <td>
                        <details className="jira-more-menu">
                          <summary
                            className="jira-row-menu-trigger"
                            aria-label={`More actions for ${project.name}`}
                          >
                            <MoreHorizontal size={16} aria-hidden="true" />
                          </summary>
                          <div className="jira-more-menu-list" role="menu">
                            <Link
                              role="menuitem"
                              href={`/projects/${project.id}/board`}
                            >
                              Open board
                            </Link>
                            {project.permissions?.canAdmin && (
                              <Link
                                role="menuitem"
                                href={`/projects/${project.id}/settings`}
                              >
                                Project settings
                              </Link>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <p className="activity-empty">
                {stateFilter === "ARCHIVED" && projects.length === 0
                  ? "No projects are archived."
                  : "No projects match your search."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
