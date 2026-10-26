"use client";

import { useParams } from "next/navigation";
import { useProjects } from "../../../ProjectProvider";
import { ArchivedIssuesSettings } from "../settings/TrashSettings";

/** Archived work items, readable by anyone in the project. */
export default function ProjectArchivedPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { allProjects } = useProjects();
  const project = allProjects.find((candidate) => candidate.id === projectId);
  const canRestore = Boolean(project?.permissions?.canAdmin);

  return (
    <div className="page archived-page">
      <h1 className="sr-only">Archived work items</h1>
      <section className="panel pa-settings-panel">
        <h2>Archived work items</h2>
        <ArchivedIssuesSettings projectId={projectId} canRestore={canRestore} />
      </section>
    </div>
  );
}
