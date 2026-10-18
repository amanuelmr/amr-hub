"use client";

import { useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import {
  TrashMessages,
  TrashedIssuesTable,
  TrashedProjectsTable,
  issueTrashActions,
  useTrash,
  type TrashedIssueRow,
  type TrashedProjectRow,
} from "../TrashList";
import { AdminHeader, OwnerOnly } from "./AdminShell";

type WorkspaceTrash = {
  retentionDays: number;
  projects: TrashedProjectRow[];
  issues: TrashedIssueRow[];
};

export function TrashView() {
  return (
    <>
      <AdminHeader
        title="Trash"
        description="Deleted projects and work items stay here for 60 days. Restore them, or delete them permanently before then."
      />
      <OwnerOnly what="manage the trash">
        <WorkspaceTrashTables />
      </OwnerOnly>
    </>
  );
}

function WorkspaceTrashTables() {
  const { refreshProjects } = useProjects();
  const { refreshIssues } = useIssues();
  const { data, error, notice, busyId, act } = useTrash<WorkspaceTrash>("/api/trash");

  if (!data) {
    return error ? (
      <TrashMessages error={error} notice={null} />
    ) : (
      <p className="admin-muted">Loading trash…</p>
    );
  }

  return (
    <div className="pac-trash">
      <TrashMessages error={error} notice={notice} />
      <section aria-labelledby="trash-projects">
        <h2 className="pa-section-title" id="trash-projects">
          Projects
        </h2>
        <TrashedProjectsTable
          projects={data.projects}
          busyId={busyId}
          onRestore={(project) =>
            void act(
              project.id,
              `/api/trash/projects/${encodeURIComponent(project.id)}`,
              "POST",
              `${project.name} was restored`,
            ).then((ok) => {
              if (ok) void Promise.all([refreshProjects(), refreshIssues()]);
            })
          }
          onPurge={(project) => {
            if (
              !window.confirm(
                `Delete ${project.name} permanently? Its ${project.issueCount} work items, sprints, versions and automation rules are deleted too. This can't be undone.`,
              )
            ) {
              return;
            }
            void act(
              project.id,
              `/api/trash/projects/${encodeURIComponent(project.id)}`,
              "DELETE",
              `${project.name} was deleted permanently`,
            );
          }}
        />
      </section>
      <section aria-labelledby="trash-issues">
        <h2 className="pa-section-title" id="trash-issues">
          Work items
        </h2>
        <TrashedIssuesTable
          issues={data.issues}
          showProject
          busyId={busyId}
          {...issueTrashActions(act, () => void refreshIssues())}
        />
      </section>
    </div>
  );
}
