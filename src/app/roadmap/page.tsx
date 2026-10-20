"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "../ProjectProvider";
import { TimelineView } from "../components/timeline/TimelineView";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import { ProjectAvatar } from "../components/shell/ProjectAvatar";

const STORAGE_KEY = "amr.roadmap.projects";

function readStoredSelection(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : null;
  } catch {
    return null;
  }
}

/**
 * Cross-project roadmap (from Jira Plans): epics of several projects on one
 * timeline, grouped by project, with dependencies across projects.
 */
export default function RoadmapPage() {
  const { projects, isLoading } = useProjects();
  const [selection, setSelection] = useState<string[] | null>(null);

  useEffect(() => {
    // Restore the viewer's project choice after hydration (per browser).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelection(readStoredSelection());
  }, []);

  // Projects that were deleted or lost since the choice was saved drop out;
  // with no saved choice, every active project is shown.
  const selectedIds = useMemo(() => {
    const available = projects.map((project) => project.id);
    if (!selection) return available;
    const kept = selection.filter((id) => available.includes(id));
    return kept.length > 0 ? kept : available;
  }, [projects, selection]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((candidate) => candidate !== id)
      : projects.map((project) => project.id).filter(
          (candidate) => candidate === id || selectedIds.includes(candidate),
        );
    if (next.length === 0) return;
    setSelection(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  };

  if (isLoading) return <WorkspaceLoading label="roadmap" />;

  return (
    <div className="roadmap-page">
      <div className="page roadmap-header-page">
        <header className="jira-page-header">
          <div>
            <h1 className="jira-page-title">Roadmap</h1>
            <p className="jira-page-subtitle">
              Epics from several projects on one timeline, with the
              dependencies between them.
            </p>
          </div>
        </header>
        {projects.length > 0 ? (
          <div className="roadmap-projects" role="group" aria-label="Projects on the roadmap">
            {projects.map((project) => {
              const active = selectedIds.includes(project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  className={active ? "roadmap-project active" : "roadmap-project"}
                  aria-pressed={active}
                  onClick={() => toggle(project.id)}
                  title={
                    active && selectedIds.length === 1
                      ? "Keep at least one project on the roadmap"
                      : undefined
                  }
                >
                  <ProjectAvatar project={project} size="sm" />
                  {project.name}
                </button>
              );
            })}
          </div>
        ) : (
          <section className="empty-state">
            <h2>No projects yet</h2>
            <p>Create a project and add epics to plan them here.</p>
          </section>
        )}
      </div>
      {selectedIds.length > 0 && (
        <TimelineView projectIds={selectedIds} mode="roadmap" />
      )}
    </div>
  );
}
