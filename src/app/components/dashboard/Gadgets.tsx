"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag } from "lucide-react";
import { useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import { authClient } from "../../../lib/auth-client";
import { findCurrentCycle, formatCycleDateRange } from "../../data/cycles";
import type { Issue } from "../../data/issues";
import {
  GROUP_FIELD_LABELS,
  applySavedView,
  buildCreatedVsResolved,
  buildLabelHeatmap,
  buildSprintHealth,
  buildTwoDimensional,
  groupIssues,
} from "../../data/reports";
import { KindIcon, StatusBadge } from "../IssueVisuals";
import { selectedIssueHref } from "../issue/selectedIssue";
import { WorkspaceActivity } from "../WorkspaceActivity";
import { CreatedResolvedChart } from "../reports/CreatedResolvedChart";
import { IssuePieChart } from "../reports/IssuePieChart";
import { ReportEmpty } from "../reports/ChartParts";
import type { Gadget } from "./gadgetMeta";
import { isDoneStatus } from "../../data/workflow";
import { useWorkflows } from "../../WorkflowProvider";

/** Status/type names and order for a gadget: one project, or every project. */
function useGroupConfig(projectId: string | null | undefined) {
  const { getWorkflow, allStatuses, allTypes } = useWorkflows();
  return useMemo(
    () =>
      projectId
        ? getWorkflow(projectId)
        : { statuses: allStatuses, types: allTypes },
    [projectId, getWorkflow, allStatuses, allTypes],
  );
}

function useScopedIssues(projectId: string | null | undefined) {
  const { issues } = useIssues();
  return useMemo(
    () =>
      projectId ? issues.filter((issue) => issue.projectId === projectId) : issues,
    [issues, projectId],
  );
}

function GadgetIssueList({
  issues,
  limit,
  empty,
}: {
  issues: Issue[];
  limit: number;
  empty: string;
}) {
  const pathname = usePathname();
  if (issues.length === 0) return <ReportEmpty>{empty}</ReportEmpty>;
  return (
    <div className="gadget-issue-list">
      <ul>
        {issues.slice(0, limit).map((issue) => (
          <li key={issue.id}>
            <Link
              href={selectedIssueHref(pathname, "", issue.id)}
              scroll={false}
              className="gadget-issue-row"
            >
              <KindIcon kind={issue.kind} projectId={issue.projectId} />
              <span className="gadget-issue-key">{issue.id}</span>
              <span className="gadget-issue-title">{issue.title}</span>
              {issue.flagged && (
                <Flag size={13} className="gadget-flag" aria-label="Flagged" />
              )}
              <StatusBadge status={issue.status} projectId={issue.projectId} />
            </Link>
          </li>
        ))}
      </ul>
      {issues.length > limit && (
        <p className="gadget-footnote">
          Showing {limit} of {issues.length} issues
        </p>
      )}
    </div>
  );
}

function AssignedToMeGadget({ gadget }: { gadget: Gadget }) {
  const { data: activeMember } = authClient.useActiveMember();
  const memberId = activeMember?.id ?? null;
  const issues = useScopedIssues(gadget.config.projectId);
  const assigned = useMemo(
    () =>
      memberId
        ? issues
            .filter(
              (issue) =>
                !isDoneStatus(issue.status) && issue.assignee?.id === memberId,
            )
            .sort((left, right) => left.rank - right.rank)
        : [],
    [issues, memberId],
  );
  return (
    <GadgetIssueList
      issues={assigned}
      limit={gadget.config.limit ?? 8}
      empty="Nothing assigned to you. Nice."
    />
  );
}

function FilterResultsGadget({ gadget }: { gadget: Gadget }) {
  const { issues, savedViews } = useIssues();
  const view = savedViews.find((candidate) => candidate.id === gadget.config.savedViewId);
  const results = useMemo(
    () => (view ? applySavedView(issues, view) : []),
    [issues, view],
  );
  if (!view) {
    return <ReportEmpty>Choose a saved view in this gadget&apos;s settings.</ReportEmpty>;
  }
  return (
    <>
      <p className="gadget-footnote">
        {view.name} · {results.length} {results.length === 1 ? "issue" : "issues"}
      </p>
      <GadgetIssueList
        issues={results}
        limit={gadget.config.limit ?? 10}
        empty="No issues match this view."
      />
    </>
  );
}

function PieChartGadget({ gadget }: { gadget: Gadget }) {
  const issues = useScopedIssues(gadget.config.projectId);
  return (
    <IssuePieChart
      issues={issues}
      field={gadget.config.groupBy ?? "status"}
      height={200}
      projectId={gadget.config.projectId}
    />
  );
}

function CreatedResolvedGadget({ gadget }: { gadget: Gadget }) {
  const issues = useScopedIssues(gadget.config.projectId);
  const days = gadget.config.days ?? 30;
  const { statuses } = useGroupConfig(gadget.config.projectId);
  const points = useMemo(
    () =>
      buildCreatedVsResolved(issues, {
        days,
        granularity: days > 30 ? "week" : "day",
        statuses,
      }),
    [issues, days, statuses],
  );
  const created = points.reduce((total, point) => total + point.created, 0);
  const resolved = points.reduce((total, point) => total + point.resolved, 0);
  return (
    <>
      <p className="gadget-footnote">
        Last {days} days · {created} created · {resolved} resolved
      </p>
      <CreatedResolvedChart points={points} height={200} />
    </>
  );
}

function SprintHealthGadget({ gadget }: { gadget: Gadget }) {
  const { cycles, issues } = useIssues();
  const { projects } = useProjects();
  const projectId = gadget.config.projectId ?? projects[0]?.id ?? null;
  const projectCycles = cycles.filter((cycle) => cycle.projectId === projectId);
  const cycle =
    projectCycles.find((candidate) => candidate.state === "ACTIVE") ??
    findCurrentCycle(projectCycles);
  const health = useMemo(
    () => (cycle ? buildSprintHealth(cycle, issues) : null),
    [cycle, issues],
  );

  if (!cycle || !health) {
    return <ReportEmpty>No active sprint for this project.</ReportEmpty>;
  }

  const behind = health.workPercent + 10 < health.timePercent;
  return (
    <div className="gadget-sprint">
      <div className="gadget-sprint-head">
        <strong>{cycle.name}</strong>
        <span>
          {formatCycleDateRange(cycle)} · {health.daysLeft}{" "}
          {health.daysLeft === 1 ? "day" : "days"} left
        </span>
      </div>
      {cycle.goal && <p className="gadget-sprint-goal">{cycle.goal}</p>}
      <div className="gadget-meter">
        <span>Time elapsed</span>
        <div className="gadget-meter-track">
          <i className="gadget-meter-time" style={{ width: `${health.timePercent}%` }} />
        </div>
        <b>{health.timePercent}%</b>
      </div>
      <div className="gadget-meter">
        <span>Work complete</span>
        <div className="gadget-meter-track">
          <i className="gadget-meter-work" style={{ width: `${health.workPercent}%` }} />
        </div>
        <b>{health.workPercent}%</b>
      </div>
      <div
        className="gadget-stack"
        aria-label={`${health.donePoints} done, ${health.inProgressPoints} in progress, ${health.todoPoints} to do points`}
      >
        {health.totalPoints > 0 ? (
          <>
            <i className="stack-done" style={{ flexGrow: health.donePoints }} />
            <i className="stack-progress" style={{ flexGrow: health.inProgressPoints }} />
            <i className="stack-todo" style={{ flexGrow: health.todoPoints }} />
          </>
        ) : (
          <i className="stack-todo" style={{ flexGrow: 1 }} />
        )}
      </div>
      <div className="gadget-sprint-stats">
        <span>
          <strong>{health.donePoints}</strong>
          <small>Done pts</small>
        </span>
        <span>
          <strong>{health.inProgressPoints}</strong>
          <small>In progress</small>
        </span>
        <span>
          <strong>{health.todoPoints}</strong>
          <small>To do</small>
        </span>
        <span>
          <strong>
            {health.scopeChange === null
              ? "—"
              : `${health.scopeChange > 0 ? "+" : ""}${health.scopeChange}%`}
          </strong>
          <small>Scope change</small>
        </span>
        <span className={health.blockers > 0 ? "gadget-warn" : undefined}>
          <strong>{health.blockers}</strong>
          <small>Blockers</small>
        </span>
      </div>
      {behind && (
        <p className="gadget-alert" role="status">
          Work is trailing time elapsed by {health.timePercent - health.workPercent} points.
        </p>
      )}
    </div>
  );
}

function ActivityGadget({ gadget }: { gadget: Gadget }) {
  const issues = useScopedIssues(gadget.config.projectId);
  return <WorkspaceActivity issues={issues} limit={gadget.config.limit ?? 8} />;
}

function TwoDimensionalGadget({ gadget }: { gadget: Gadget }) {
  const issues = useScopedIssues(gadget.config.projectId);
  const rowField = gadget.config.rowField ?? "assignee";
  const columnField = gadget.config.columnField ?? "status";
  const config = useGroupConfig(gadget.config.projectId);
  const table = useMemo(
    () => buildTwoDimensional(issues, rowField, columnField, config),
    [issues, rowField, columnField, config],
  );
  if (table.total === 0) return <ReportEmpty>No issues to count.</ReportEmpty>;
  return (
    <div className="gadget-table-scroll">
      <table className="report-table gadget-matrix">
        <thead>
          <tr>
            <th scope="col">
              {GROUP_FIELD_LABELS[rowField]} \ {GROUP_FIELD_LABELS[columnField]}
            </th>
            {table.columns.map((column) => (
              <th scope="col" key={column.key} className="numeric">
                {column.label}
              </th>
            ))}
            <th scope="col" className="numeric">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {table.columns.map((column) => (
                <td key={column.key} className="numeric">
                  {table.cells[row.key]?.[column.key] ?? <span className="muted">0</span>}
                </td>
              ))}
              <td className="numeric">
                <strong>{row.count}</strong>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {table.columns.map((column) => (
              <td key={column.key} className="numeric">
                <strong>{column.count}</strong>
              </td>
            ))}
            <td className="numeric">
              <strong>{table.total}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function IssueStatisticsGadget({ gadget }: { gadget: Gadget }) {
  const issues = useScopedIssues(gadget.config.projectId);
  const field = gadget.config.groupBy ?? "priority";
  const config = useGroupConfig(gadget.config.projectId);
  const groups = useMemo(
    () => groupIssues(issues, field, config),
    [issues, field, config],
  );
  const max = groups.reduce((value, group) => Math.max(value, group.count), 0);
  if (groups.length === 0) return <ReportEmpty>No issues to count.</ReportEmpty>;
  return (
    <table className="report-table gadget-stats">
      <thead>
        <tr>
          <th scope="col">{GROUP_FIELD_LABELS[field]}</th>
          <th scope="col" className="numeric">
            Count
          </th>
          <th scope="col">
            <span className="sr-only">Share</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.key}>
            <td>{group.label}</td>
            <td className="numeric">{group.count}</td>
            <td className="gadget-stat-bar-cell">
              <span className="gadget-stat-bar">
                <i style={{ width: `${max ? (group.count / max) * 100 : 0}%` }} />
              </span>
              <small>{Math.round((group.count / Math.max(issues.length, 1)) * 100)}%</small>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LabelHeatmapGadget({ gadget }: { gadget: Gadget }) {
  const issues = useScopedIssues(gadget.config.projectId);
  const cells = useMemo(() => buildLabelHeatmap(issues), [issues]);
  if (cells.length === 0) return <ReportEmpty>No labelled issues yet.</ReportEmpty>;
  return (
    <ul className="gadget-heatmap">
      {cells.map((cell) => (
        <li
          key={cell.key}
          className="gadget-heat-cell"
          style={{
            background: `color-mix(in srgb, var(--blue-500) ${Math.round(
              12 + cell.intensity * 70,
            )}%, var(--surface))`,
            color: cell.intensity > 0.55 ? "var(--console-ink)" : "var(--ink)",
          }}
          title={`${cell.label}: ${cell.count} issues`}
        >
          <span>{cell.label}</span>
          <strong>{cell.count}</strong>
        </li>
      ))}
    </ul>
  );
}

function WatchedIssuesGadget({ gadget }: { gadget: Gadget }) {
  const { data: session } = authClient.useSession();
  const { issues } = useIssues();
  const userId = session?.user.id;
  const watched = useMemo(
    () =>
      userId
        ? issues
            .filter((issue) => issue.watcherIds?.includes(userId))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        : [],
    [issues, userId],
  );
  return (
    <GadgetIssueList
      issues={watched}
      limit={gadget.config.limit ?? 8}
      empty="You aren't watching any issues."
    />
  );
}

export function GadgetBody({ gadget }: { gadget: Gadget }) {
  switch (gadget.type) {
    case "ASSIGNED_TO_ME":
      return <AssignedToMeGadget gadget={gadget} />;
    case "FILTER_RESULTS":
      return <FilterResultsGadget gadget={gadget} />;
    case "PIE_CHART":
      return <PieChartGadget gadget={gadget} />;
    case "CREATED_VS_RESOLVED":
      return <CreatedResolvedGadget gadget={gadget} />;
    case "SPRINT_HEALTH":
      return <SprintHealthGadget gadget={gadget} />;
    case "ACTIVITY_STREAM":
      return <ActivityGadget gadget={gadget} />;
    case "TWO_DIMENSIONAL":
      return <TwoDimensionalGadget gadget={gadget} />;
    case "ISSUE_STATISTICS":
      return <IssueStatisticsGadget gadget={gadget} />;
    case "LABEL_HEATMAP":
      return <LabelHeatmapGadget gadget={gadget} />;
    case "WATCHED_ISSUES":
      return <WatchedIssuesGadget gadget={gadget} />;
  }
}
