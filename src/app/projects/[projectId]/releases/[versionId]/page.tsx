"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Copy } from "lucide-react";
import { useIssues } from "../../../../IssueProvider";
import {
  KindIcon,
  PriorityBadge,
  StatusBadge,
} from "../../../../components/IssueVisuals";
import { WorkspaceLoading } from "../../../../components/WorkspaceLoading";
import { selectedIssueHref } from "../../../../components/issue/selectedIssue";
import { isDoneStatus } from "../../../../data/workflow";
import { useWorkflow } from "../../../../WorkflowProvider";
import { formatDay, useProjectResource } from "../../settings/adminUi";
import {
  formatReleaseNotes,
  groupReleaseNotes,
  isVersionOverdue,
  type ProjectVersion,
} from "../releaseNotes";
import { VersionProgressBar, VersionStatusBadge } from "../versionUi";

export default function VersionDetailPage() {
  const params = useParams<{ projectId: string; versionId: string }>();
  const { projectId, versionId } = params;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const issueHref = (issueId: string) =>
    selectedIssueHref(pathname, searchParams, issueId);
  const { issues: allIssues, isLoading: isLoadingIssues } = useIssues();
  const { items: versions, isLoading } = useProjectResource<ProjectVersion>(
    projectId,
    "versions",
  );
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"issues" | "notes">("issues");

  const version = versions.find((candidate) => candidate.id === versionId);
  const issues = useMemo(
    () => allIssues.filter((issue) => issue.fixVersion?.id === versionId),
    [allIssues, versionId],
  );
  const workflow = useWorkflow(projectId);
  const notes = useMemo(
    () =>
      version ? formatReleaseNotes(version.name, issues, workflow.types) : "",
    [version, issues, workflow.types],
  );

  if (isLoading || (isLoadingIssues && issues.length === 0)) {
    return <WorkspaceLoading label="version" />;
  }

  if (!version) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Version not found</h2>
          <p>It may have been deleted.</p>
          <Link
            className="secondary-button"
            href={`/projects/${projectId}/releases`}
          >
            Back to releases
          </Link>
        </div>
      </div>
    );
  }

  const openIssues = issues.filter((issue) => !isDoneStatus(issue.status));
  const overdue = isVersionOverdue(version);
  const groups = groupReleaseNotes(issues, workflow.types);
  // Workflow order, plus any status no longer in the workflow.
  const statusGroups = [
    ...workflow.statuses.map(({ key, name }) => ({ key, name })),
    ...[...new Set(issues.map((issue) => issue.status))]
      .filter((key) => !workflow.statuses.some((status) => status.key === key))
      .map((key) => ({ key, name: key })),
  ];

  const copyNotes = async () => {
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="page">
      <nav className="pa-back" aria-label="Breadcrumb">
        <Link className="text-link" href={`/projects/${projectId}/releases`}>
          <ArrowLeft size={14} aria-hidden="true" /> Releases
        </Link>
      </nav>
      <header className="jira-page-header pa-detail-header">
        <div className="pa-detail-heading">
          <h1 className="jira-page-title pa-title-row">
            {version.name}
            <VersionStatusBadge status={version.status} />
          </h1>
          {version.description && (
            <p className="jira-page-subtitle">{version.description}</p>
          )}
          <div className="pa-meta-row">
            <span className="pa-muted">
              Start: {formatDay(version.startDate)}
            </span>
            <span className={overdue ? "pa-overdue" : "pa-muted"}>
              Release: {formatDay(version.releaseDate)}
            </span>
            {version.releasedAt && (
              <span className="pa-muted">
                Released {formatDay(version.releasedAt)}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="panel pa-version-overview">
        <div className="pa-version-counts">
          <div>
            <strong>{version.issueCount}</strong>
            <span>Issues in version</span>
          </div>
          <div>
            <strong>{version.doneCount}</strong>
            <span>Done</span>
          </div>
          <div>
            <strong>{version.inProgressCount}</strong>
            <span>In progress</span>
          </div>
          <div>
            <strong>
              {version.issueCount - version.doneCount - version.inProgressCount}
            </strong>
            <span>To do</span>
          </div>
        </div>
        <VersionProgressBar version={version} />
        {(overdue ||
          (version.status !== "UNRELEASED" && openIssues.length > 0)) && (
          <ul className="pa-warnings">
            {overdue && (
              <li>
                <AlertTriangle size={14} aria-hidden="true" />
                This version is past its release date.
              </li>
            )}
            {version.status !== "UNRELEASED" && openIssues.length > 0 && (
              <li>
                <AlertTriangle size={14} aria-hidden="true" />
                {openIssues.length} issue
                {openIssues.length === 1 ? " is" : "s are"} still open in a
                released version.
              </li>
            )}
          </ul>
        )}
        {version.status === "UNRELEASED" && openIssues.length > 0 && (
          <p className="pa-muted pa-warning-note">
            <AlertTriangle size={13} aria-hidden="true" /> {openIssues.length}{" "}
            open issue{openIssues.length === 1 ? "" : "s"} must be resolved or
            moved before release.
          </p>
        )}
      </section>

      <div className="filter-tabs pa-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "issues"}
          className={tab === "issues" ? "active" : undefined}
          onClick={() => setTab("issues")}
        >
          Issues
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "notes"}
          className={tab === "notes" ? "active" : undefined}
          onClick={() => setTab("notes")}
        >
          Release notes
        </button>
      </div>

      {tab === "issues" ? (
        issues.length === 0 ? (
          <div className="empty-state">
            <h2>No issues in this version</h2>
            <p>Set an issue&apos;s fix version to add it here.</p>
          </div>
        ) : (
          statusGroups.map(({ key: status, name }) => {
            const group = issues.filter((issue) => issue.status === status);
            if (group.length === 0) return null;
            return (
              <section className="panel pa-status-group" key={status}>
                <h2>
                  {name}{" "}
                  <span className="pa-muted">{group.length}</span>
                </h2>
                <ul className="pa-issue-list">
                  {group.map((issue) => (
                    <li key={issue.id}>
                      <Link href={issueHref(issue.id)} scroll={false}>
                        <KindIcon kind={issue.kind} projectId={issue.projectId} />
                        <span className="pa-key">{issue.id}</span>
                        <span className="pa-issue-title">{issue.title}</span>
                        <PriorityBadge priority={issue.priority} />
                        <StatusBadge status={issue.status} projectId={issue.projectId} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )
      ) : (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Release notes</h2>
              <p>Generated from the issues in this version, grouped by type.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={copyNotes}
            >
              {copied ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="activity-empty">No issues in this version.</p>
          ) : (
            <div className="pa-notes">
              {groups.map((group) => (
                <div key={group.kind}>
                  <h3>
                    <KindIcon kind={group.kind} projectId={projectId} />
                    {group.heading}
                  </h3>
                  <ul>
                    {group.issues.map((issue) => (
                      <li key={issue.id}>
                        <Link
                          className="pa-key"
                          href={issueHref(issue.id)}
                          scroll={false}
                        >
                          {issue.id}
                        </Link>{" "}
                        {issue.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
