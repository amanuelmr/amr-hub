"use client";

import {
  VERSION_STATUS_LABELS,
  versionProgress,
  type ProjectVersion,
  type VersionStatus,
} from "./releaseNotes";

export function VersionProgressBar({ version }: { version: ProjectVersion }) {
  const progress = versionProgress(version);
  const label = `${version.doneCount} done, ${version.inProgressCount} in progress, ${progress.toDo} to do`;
  return (
    <div className="pa-progress" role="img" aria-label={label} title={label}>
      {version.issueCount === 0 ? (
        <span className="pa-progress-empty" />
      ) : (
        <>
          <span
            className="pa-fill-done-bg"
            style={{ width: `${progress.donePercent}%` }}
          />
          <span
            className="pa-fill-progress-bg"
            style={{ width: `${progress.inProgressPercent}%` }}
          />
          <span
            className="pa-fill-todo-bg"
            style={{ width: `${progress.toDoPercent}%` }}
          />
        </>
      )}
    </div>
  );
}

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  return (
    <span className={`pa-lozenge pa-lozenge-${status.toLowerCase()}`}>
      {VERSION_STATUS_LABELS[status]}
    </span>
  );
}
