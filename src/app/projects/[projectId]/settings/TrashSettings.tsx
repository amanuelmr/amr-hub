"use client";

import { useState } from "react";
import { ArchiveRestore } from "lucide-react";
import { apiRequest, useIssues } from "../../../IssueProvider";
import type { Issue } from "../../../data/issues";
import {
  TrashMessages,
  TrashedIssuesTable,
  issueTrashActions,
  useTrash,
  type TrashedIssueRow,
} from "../../../components/TrashList";
import { errorMessage } from "./adminUi";

/** Project trash (Jira "recycle bin"): restore or permanently delete. */
export function TrashSettings({ projectId }: { projectId: string }) {
  const { refreshIssues } = useIssues();
  const { data, error, notice, busyId, act } = useTrash<{
    retentionDays: number;
    issues: TrashedIssueRow[];
  }>(`/api/projects/${encodeURIComponent(projectId)}/trash`);

  return (
    <div className="pa-settings-form">
      <p className="pa-muted">
        Deleted work items stay here for {data?.retentionDays ?? 60} days. Restore
        them to bring them back with their comments, attachments and history.
        After that they&apos;re deleted permanently.
      </p>
      <TrashMessages error={error} notice={notice} />
      {data ? (
        <TrashedIssuesTable
          issues={data.issues}
          showProject={false}
          busyId={busyId}
          {...issueTrashActions(act, () => void refreshIssues())}
        />
      ) : (
        !error && <p className="pa-muted">Loading trash…</p>
      )}
    </div>
  );
}

/** Archived work items: hidden from boards and search, restorable by admins. */
export function ArchivedIssuesSettings({
  projectId,
  canRestore = true,
}: {
  projectId: string;
  /** Only project admins can unarchive; others just see the list. */
  canRestore?: boolean;
}) {
  const { refreshIssues } = useIssues();
  const { data, error, notice, busyId, reload } = useTrash<{ issues: Issue[] }>(
    `/api/issues?projectId=${encodeURIComponent(projectId)}&archived=true&sort=NEWEST&limit=500`,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const unarchive = async (issue: Issue) => {
    setPending(issue.id);
    setActionError(null);
    setActionNotice(null);
    try {
      await apiRequest(`/api/issues/${encodeURIComponent(issue.id)}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived: false }),
      });
      setActionNotice(`${issue.id} was unarchived`);
      await Promise.all([reload(), refreshIssues()]);
    } catch (unarchiveError) {
      setActionError(errorMessage(unarchiveError, "Work item could not be unarchived"));
    } finally {
      setPending(null);
    }
  };

  const issues = data?.issues ?? [];
  return (
    <div className="pa-settings-form">
      <p className="pa-muted">
        Archived work items are hidden from boards, backlogs, lists and search,
        but anyone with access can still open them by key or find them with{" "}
        <code>archived = true</code>.
      </p>
      <TrashMessages error={actionError ?? error} notice={actionNotice ?? notice} />
      {!data ? (
        !error && <p className="pa-muted">Loading archived work items…</p>
      ) : issues.length === 0 ? (
        <p className="pa-muted">No work items are archived in this project.</p>
      ) : (
        <div className="pa-table-wrap pac-table-wrap">
          <table className="pa-table pac-table">
            <thead>
              <tr>
                <th>Work item</th>
                <th>Archived</th>
                {canRestore && (
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <a className="pa-link" href={`/issues/${encodeURIComponent(issue.id)}`}>
                      <span className="pa-key">{issue.id}</span>{" "}
                      <span className="pac-cell-title">{issue.title}</span>
                    </a>
                  </td>
                  <td>
                    {issue.archivedAt
                      ? new Intl.DateTimeFormat("en", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(issue.archivedAt))
                      : "—"}
                  </td>
                  {canRestore && (
                    <td>
                      <div className="pa-actions-cell">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={pending === issue.id || busyId === issue.id}
                          onClick={() => void unarchive(issue)}
                        >
                          <ArchiveRestore size={14} aria-hidden="true" />
                          Unarchive
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
