"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { KindIcon } from "../IssueVisuals";
import type { IssueKind } from "../../data/issues";
import { selectedIssueHref } from "../issue/selectedIssue";
import type { WorkItemSummary } from "./types";

export function StatusLozenge({ issue }: { issue: WorkItemSummary }) {
  return (
    <span className={`people-lozenge people-lozenge-${issue.statusCategory.toLowerCase()}`}>
      {issue.statusName}
    </span>
  );
}

/** One work item row; the title opens the issue modal via ?selectedIssue. */
export function WorkItemRow({
  issue,
  meta,
  showAssignee,
}: {
  issue: WorkItemSummary;
  meta?: React.ReactNode;
  showAssignee?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <li className="people-work-row">
      <KindIcon kind={issue.kind as IssueKind} />
      <div className="people-work-main">
        <Link href={selectedIssueHref(pathname, searchParams, issue.id)} scroll={false}>
          {issue.title}
        </Link>
        <span>
          {issue.id} · {issue.projectName}
          {showAssignee && (
            <>
              {" · "}
              {issue.assignee ? (
                <Link className="people-inline-link" href={`/people/${issue.assignee.userId}`}>
                  {issue.assignee.name}
                </Link>
              ) : (
                "Unassigned"
              )}
            </>
          )}
        </span>
      </div>
      {meta && <span className="people-work-meta">{meta}</span>}
      <StatusLozenge issue={issue} />
    </li>
  );
}
