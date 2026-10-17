"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ListFilter } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { KindIcon, StatusBadge } from "../IssueVisuals";
import type { Cycle, Issue } from "../../data/issues";
import type { Project } from "../../data/projects";
import type { BurndownSeries, SprintReport } from "../../data/reports";
import { selectedIssueHref } from "../issue/selectedIssue";

/** Report rows open the issue modal over the report instead of navigating. */
export function useIssueHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (issueId: string) => selectedIssueHref(pathname, searchParams, issueId);
}

export type ReportProps = {
  project: Project;
  issues: Issue[];
  cycles: Cycle[];
};

export function ReportSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="select-button report-select">
      <ListFilter size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="filter-tabs report-segments" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Started or closed sprints, newest first; the active sprint is the default. */
export function useReportableSprints(cycles: Cycle[], projectId: string) {
  const sprints = useMemo(
    () =>
      cycles
        .filter(
          (cycle) =>
            cycle.projectId === projectId &&
            (cycle.state ? cycle.state !== "FUTURE" : true),
        )
        .sort(
          (left, right) =>
            new Date(right.startDate).getTime() -
            new Date(left.startDate).getTime(),
        ),
    [cycles, projectId],
  );
  const fallback =
    sprints.find((cycle) => cycle.state === "ACTIVE")?.id ?? sprints[0]?.id ?? "";
  const [selected, setSelected] = useState("");
  const cycleId = sprints.some((cycle) => cycle.id === selected)
    ? selected
    : fallback;
  return { sprints, cycleId, setCycleId: setSelected };
}

export function SprintPicker({
  sprints,
  value,
  onChange,
}: {
  sprints: Cycle[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ReportSelect label="Sprint" value={value} onChange={onChange}>
      {sprints.map((cycle) => (
        <option key={cycle.id} value={cycle.id}>
          {cycle.name}
          {cycle.state === "ACTIVE" ? " (active)" : ""}
        </option>
      ))}
    </ReportSelect>
  );
}

export type SprintReportPayload = {
  cycle: Cycle;
  burndown: BurndownSeries;
  report: SprintReport;
};

export function useSprintReport(cycleId: string) {
  const [state, setState] = useState<{
    cycleId: string;
    data: SprintReportPayload | null;
    error: string | null;
  }>({ cycleId: "", data: null, error: null });

  useEffect(() => {
    if (!cycleId) return;
    const controller = new AbortController();
    apiRequest<SprintReportPayload>(
      `/api/reports/burndown?cycleId=${encodeURIComponent(cycleId)}`,
      { signal: controller.signal },
    )
      .then((data) => setState({ cycleId, data, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          cycleId,
          data: null,
          error: error instanceof Error ? error.message : "Report could not be loaded",
        });
      });
    return () => controller.abort();
  }, [cycleId]);

  const isCurrent = state.cycleId === cycleId;
  return {
    data: isCurrent ? state.data : null,
    error: isCurrent ? state.error : null,
    isLoading: Boolean(cycleId) && !isCurrent,
  };
}

export function ReportIssueTable({
  rows,
  emptyLabel,
  extraHeading,
  extra,
}: {
  rows: { issue: Issue; points?: number | null }[];
  emptyLabel: string;
  extraHeading?: string;
  extra?: (issue: Issue) => React.ReactNode;
}) {
  const issueHref = useIssueHref();
  if (rows.length === 0) {
    return <p className="report-table-empty">{emptyLabel}</p>;
  }
  return (
    <div className="report-table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Summary</th>
            <th>Status</th>
            <th className="numeric">Points</th>
            {extraHeading && <th>{extraHeading}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ issue, points }) => (
            <tr key={issue.id}>
              <td className="report-key">
                <KindIcon kind={issue.kind} projectId={issue.projectId} />
                <Link href={issueHref(issue.id)} scroll={false}>
                  {issue.id}
                </Link>
              </td>
              <td className="report-summary">
                <Link href={issueHref(issue.id)} scroll={false}>
                  {issue.title}
                </Link>
              </td>
              <td>
                <StatusBadge status={issue.status} projectId={issue.projectId} />
              </td>
              <td className="numeric">{points ?? issue.estimate ?? "–"}</td>
              {extra && <td>{extra(issue)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function sumPoints(items: { points?: number | null; issue: Issue }[]) {
  return items.reduce(
    (total, item) => total + (item.points ?? item.issue.estimate ?? 0),
    0,
  );
}
