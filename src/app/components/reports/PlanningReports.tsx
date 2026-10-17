"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration, type Issue } from "../../data/issues";
import {
  DAY_MS,
  GROUP_FIELDS,
  GROUP_FIELD_LABELS,
  buildBurnup,
  buildEpicReport,
  buildTimeTracking,
  buildWorkload,
  type GroupField,
} from "../../data/reports";
import {
  ChartLegend,
  ChartTooltip,
  ReportEmpty,
  ReportPanel,
  StatTile,
  axisProps,
  gridProps,
} from "./ChartParts";
import { IssuePieChart } from "./IssuePieChart";
import {
  ReportIssueTable,
  ReportSelect,
  type ReportProps,
} from "./ReportShared";
import { useChartTheme } from "./useChartTheme";
import { isDoneStatus, isEpicLevel } from "../../data/workflow";
import { useWorkflow } from "../../WorkflowProvider";

export function PieReport({ project, issues }: ReportProps) {
  const [field, setField] = useState<GroupField>("assignee");
  const [scope, setScope] = useState<"ALL" | "OPEN">("ALL");
  const scoped = useMemo(
    () => (scope === "OPEN" ? issues.filter((issue) => !isDoneStatus(issue.status)) : issues),
    [issues, scope],
  );

  return (
    <ReportPanel
      title="Pie chart report"
      description={`${scoped.length} issues by ${GROUP_FIELD_LABELS[field].toLowerCase()}`}
      controls={
        <>
          <ReportSelect
            label="Group by"
            value={field}
            onChange={(value) => setField(value as GroupField)}
          >
            {GROUP_FIELDS.map((option) => (
              <option key={option} value={option}>
                {GROUP_FIELD_LABELS[option]}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect
            label="Issues"
            value={scope}
            onChange={(value) => setScope(value as "ALL" | "OPEN")}
          >
            <option value="ALL">All issues</option>
            <option value="OPEN">Unresolved only</option>
          </ReportSelect>
        </>
      }
    >
      <IssuePieChart
        issues={scoped}
        field={field}
        height={280}
        projectId={project.id}
      />
    </ReportPanel>
  );
}

function ProgressChart({ issues, start }: { issues: Issue[]; start: number }) {
  const theme = useChartTheme();
  const [now] = useState(() => new Date());
  const { statuses } = useWorkflow(issues[0]?.projectId);
  const points = useMemo(
    () => buildBurnup(issues, start, now, now, statuses),
    [issues, start, now, statuses],
  );
  return (
    <figure className="report-figure">
      <ChartLegend
        items={[
          { label: "Total issues", color: theme.series[2] },
          { label: "Done", color: theme.good },
        ]}
      />
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps(theme)} />
            <XAxis dataKey="label" {...axisProps(theme)} minTickGap={18} />
            <YAxis allowDecimals={false} {...axisProps(theme)} />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
            />
            <Line
              type="stepAfter"
              dataKey="total"
              name="Total issues"
              stroke={theme.series[2]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="done"
              name="Done"
              stroke={theme.good}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function earliestStart(issues: Issue[]) {
  const earliest = issues.reduce(
    (value, issue) => Math.min(value, new Date(issue.createdAt).getTime()),
    Date.now(),
  );
  return Math.max(earliest, Date.now() - 365 * DAY_MS);
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="report-progress" aria-label={label}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function VersionReport({ issues }: ReportProps) {
  const versions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; status: string }>();
    for (const issue of issues) {
      if (issue.fixVersion) map.set(issue.fixVersion.id, issue.fixVersion);
    }
    return [...map.values()].sort(
      (left, right) =>
        Number(left.status === "RELEASED") - Number(right.status === "RELEASED") ||
        left.name.localeCompare(right.name),
    );
  }, [issues]);
  const [selected, setSelected] = useState("");
  const versionId = versions.some((version) => version.id === selected)
    ? selected
    : versions[0]?.id ?? "";
  const scoped = issues.filter((issue) => issue.fixVersion?.id === versionId);
  const done = scoped.filter((issue) => isDoneStatus(issue.status));
  const percent = scoped.length ? Math.round((done.length / scoped.length) * 100) : 0;
  const points = (items: Issue[]) =>
    items.reduce((total, issue) => total + (issue.estimate ?? 0), 0);

  return (
    <ReportPanel
      title="Version report"
      description="Progress of a release over time"
      controls={
        versions.length > 0 && (
          <ReportSelect label="Version" value={versionId} onChange={setSelected}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
                {version.status === "RELEASED" ? " (released)" : ""}
              </option>
            ))}
          </ReportSelect>
        )
      }
    >
      {versions.length === 0 ? (
        <ReportEmpty>Set a fix version on issues to track a release here.</ReportEmpty>
      ) : (
        <>
          <div className="report-stats">
            <StatTile label="Issues" value={`${done.length}/${scoped.length}`} note="done" />
            <StatTile label="Points" value={`${points(done)}/${points(scoped)}`} note="done" />
            <StatTile label="Progress" value={`${percent}%`} />
          </div>
          <ProgressBar percent={percent} label={`${percent}% of issues done`} />
          <ProgressChart issues={scoped} start={earliestStart(scoped)} />
          <h3 className="report-subheading">Issues in this version</h3>
          <ReportIssueTable
            rows={scoped.map((issue) => ({ issue }))}
            emptyLabel="No issues in this version."
          />
        </>
      )}
    </ReportPanel>
  );
}

export function EpicReport({ issues }: ReportProps) {
  const epics = useMemo(
    () => issues.filter((issue) => isEpicLevel(issue.kind)),
    [issues],
  );
  const [selected, setSelected] = useState("");
  const epic =
    epics.find((candidate) => candidate.id === selected) ?? epics[0] ?? null;
  const report = useMemo(
    () => (epic ? buildEpicReport(epic, issues) : null),
    [epic, issues],
  );

  return (
    <ReportPanel
      title="Epic report"
      description={epic ? `${epic.id} · ${epic.title}` : "Progress of an epic's child issues"}
      controls={
        epics.length > 0 && (
          <ReportSelect label="Epic" value={epic?.id ?? ""} onChange={setSelected}>
            {epics.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id} {candidate.title}
              </option>
            ))}
          </ReportSelect>
        )
      }
    >
      {!epic || !report ? (
        <ReportEmpty>Create an epic to see its progress here.</ReportEmpty>
      ) : (
        <>
          <div className="report-stats">
            <StatTile label="Children" value={`${report.done}/${report.total}`} note="done" />
            <StatTile
              label="Points"
              value={`${report.donePoints}/${report.totalPoints}`}
              note="done"
            />
            <StatTile label="Unestimated" value={report.unestimated} note="issues" />
            <StatTile label="Progress" value={`${report.percent}%`} />
          </div>
          <ProgressBar percent={report.percent} label={`${report.percent}% of child issues done`} />
          {report.total > 0 && (
            <ProgressChart issues={report.children} start={earliestStart(report.children)} />
          )}
          <h3 className="report-subheading">Incomplete issues</h3>
          <ReportIssueTable
            rows={report.children
              .filter((issue) => !isDoneStatus(issue.status))
              .map((issue) => ({ issue }))}
            emptyLabel="Every child issue is done."
          />
          <h3 className="report-subheading">Completed issues</h3>
          <ReportIssueTable
            rows={report.children
              .filter((issue) => isDoneStatus(issue.status))
              .map((issue) => ({ issue }))}
            emptyLabel="No child issues are done yet."
          />
        </>
      )}
    </ReportPanel>
  );
}

export function TimeTrackingReport({ project, issues, cycles }: ReportProps) {
  const [scope, setScope] = useState("ALL");
  const sprints = cycles.filter((cycle) => cycle.projectId === project.id);
  const scoped = scope === "ALL" ? issues : issues.filter((issue) => issue.cycleId === scope);
  const { rows, totals } = useMemo(() => buildTimeTracking(scoped), [scoped]);
  const largest = rows.reduce(
    (value, row) => Math.max(value, row.original, row.spent + row.remaining),
    1,
  );
  const variance = totals.spent + totals.remaining - totals.original;

  return (
    <ReportPanel
      title="Time tracking report"
      description="Original estimate vs time spent and remaining"
      controls={
        <ReportSelect label="Scope" value={scope} onChange={setScope}>
          <option value="ALL">All issues</option>
          {sprints.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.name}
            </option>
          ))}
        </ReportSelect>
      }
    >
      <div className="report-stats">
        <StatTile label="Original estimate" value={formatDuration(totals.original)} />
        <StatTile label="Time spent" value={formatDuration(totals.spent)} />
        <StatTile label="Remaining" value={formatDuration(totals.remaining)} />
        <StatTile
          label={variance > 0 ? "Over estimate" : "Under estimate"}
          value={formatDuration(Math.abs(variance))}
        />
      </div>
      <div className="chart-legend report-legend">
        <span><i className="legend-swatch time-original" />Original estimate</span>
        <span><i className="legend-swatch time-spent" />Time spent</span>
        <span><i className="legend-swatch time-remaining" />Remaining</span>
      </div>
      {rows.length === 0 ? (
        <ReportEmpty>Log work or set original estimates to track time.</ReportEmpty>
      ) : (
        <ReportIssueTable
          rows={rows.map((row) => ({ issue: row.issue }))}
          emptyLabel=""
          extraHeading="Time"
          extra={(issue) => {
            const row = rows.find((candidate) => candidate.issue.id === issue.id);
            if (!row) return null;
            return (
              <div
                className="time-bars"
                title={`Estimate ${formatDuration(row.original)} · Spent ${formatDuration(row.spent)} · Remaining ${formatDuration(row.remaining)}`}
              >
                <span className="time-bar">
                  <i className="time-original" style={{ width: `${(row.original / largest) * 100}%` }} />
                </span>
                <span className="time-bar">
                  <i className="time-spent" style={{ width: `${(row.spent / largest) * 100}%` }} />
                  <i className="time-remaining" style={{ width: `${(row.remaining / largest) * 100}%` }} />
                </span>
                <small>
                  {formatDuration(row.spent)} / {formatDuration(row.original)}
                </small>
              </div>
            );
          }}
        />
      )}
    </ReportPanel>
  );
}

export function WorkloadReport({ issues }: ReportProps) {
  const rows = useMemo(() => buildWorkload(issues), [issues]);
  const largest = rows.reduce((value, row) => Math.max(value, row.points), 1);

  return (
    <ReportPanel
      title="User workload report"
      description="Unresolved issues, story points and remaining estimate per assignee"
    >
      {rows.length === 0 ? (
        <ReportEmpty>No unresolved issues.</ReportEmpty>
      ) : (
        <div className="report-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Assignee</th>
                <th className="numeric">Issues</th>
                <th className="numeric">Points</th>
                <th className="workload-bar-cell">Share of points</th>
                <th className="numeric">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.name}</td>
                  <td className="numeric">{row.issues}</td>
                  <td className="numeric">{row.points}</td>
                  <td className="workload-bar-cell">
                    <span className="time-bar">
                      <i
                        className="time-spent"
                        style={{ width: `${(row.points / largest) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="numeric">{formatDuration(row.remainingMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportPanel>
  );
}
