"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { selectedIssueHref } from "./issue/selectedIssue";
import type { Issue, IssueStatus } from "../data/issues";
import { useWorkflows } from "../WorkflowProvider";
import { IssueLabelChip } from "./IssueLabelChip";
import { KindIcon, PriorityBadge } from "./IssueVisuals";


function initials(name: string | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function IssueBoard({
  issues,
  isViewer,
  onStatusChange,
}: {
  issues: Issue[];
  isViewer: boolean;
  onStatusChange: (issueId: string, status: IssueStatus) => Promise<boolean>;
}) {
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(
    null,
  );
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { allStatuses } = useWorkflows();
  // Every configured status that is in use or built in, in workflow order.
  const columns = allStatuses.filter(
    (status) =>
      !status.key.includes(":") ||
      issues.some((issue) => issue.status === status.key),
  );

  const handleDrop = (status: IssueStatus, issueId: string) => {
    setDragOverColumn(null);
    if (isViewer) return;
    void onStatusChange(issueId, status);
  };

  return (
    <div className="issue-board">
      {columns.map(({ key: status, name }) => {
        const columnIssues = issues.filter((issue) => issue.status === status);

        return (
          <div
            className={`board-column ${
              dragOverColumn === status ? "drag-over" : ""
            }`}
            key={status}
            onDragOver={(event) => {
              if (isViewer) return;
              event.preventDefault();
              setDragOverColumn(status);
            }}
            onDragLeave={() =>
              setDragOverColumn((current) => (current === status ? null : current))
            }
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(status, event.dataTransfer.getData("text/issue-id"));
            }}
          >
            <header className="board-column-header">
              <span>{name}</span>
              <span className="board-column-count">{columnIssues.length}</span>
            </header>

            <div className="board-column-body">
              {columnIssues.map((issue) => (
                <Link
                  href={selectedIssueHref(pathname, searchParams, issue.id)}
                  scroll={false}
                  className="board-card"
                  key={issue.id}
                  draggable={!isViewer}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/issue-id", issue.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className="board-card-top">
                    <KindIcon kind={issue.kind} projectId={issue.projectId} />
                    <span className="board-card-id">{issue.id}</span>
                  </div>
                  <p className="board-card-title">{issue.title}</p>
                  {issue.labels.length > 0 && (
                    <div className="board-card-labels">
                      {issue.labels.slice(0, 3).map((label) => (
                        <IssueLabelChip label={label} compact key={label.id} />
                      ))}
                    </div>
                  )}
                  <div className="board-card-footer">
                    <PriorityBadge priority={issue.priority} />
                    <span className="avatar avatar-small">
                      {initials(issue.assignee?.name)}
                    </span>
                  </div>
                </Link>
              ))}

              {columnIssues.length === 0 && (
                <p className="board-column-empty">No issues</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
