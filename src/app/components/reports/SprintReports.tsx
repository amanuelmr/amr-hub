"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCycleDateRange } from "../../data/cycles";
import { dayKey, formatDayLabel, type BurndownSeries } from "../../data/reports";
import {
  ChartLegend,
  ChartTooltip,
  ReportEmpty,
  ReportPanel,
  StatTile,
  axisProps,
  gridProps,
} from "./ChartParts";
import {
  ReportIssueTable,
  SprintPicker,
  sumPoints,
  useReportableSprints,
  useIssueHref,
  useSprintReport,
  type ReportProps,
} from "./ReportShared";
import { useChartTheme } from "./useChartTheme";

function SprintFrame({
  title,
  description,
  project,
  cycles,
  children,
}: ReportProps & {
  title: string;
  description: string;
  children: (payload: NonNullable<ReturnType<typeof useSprintReport>["data"]>) => React.ReactNode;
}) {
  const { sprints, cycleId, setCycleId } = useReportableSprints(cycles, project.id);
  const { data, error, isLoading } = useSprintReport(cycleId);

  return (
    <ReportPanel
      title={title}
      description={
        data ? `${data.cycle.name} · ${formatCycleDateRange(data.cycle)}` : description
      }
      controls={
        sprints.length > 0 && (
          <SprintPicker sprints={sprints} value={cycleId} onChange={setCycleId} />
        )
      }
    >
      {sprints.length === 0 ? (
        <ReportEmpty>
          Start a sprint from the{" "}
          <Link className="text-link" href={`/projects/${project.id}/backlog`}>
            backlog
          </Link>{" "}
          to see this report.
        </ReportEmpty>
      ) : error ? (
        <p className="form-submit-error">{error}</p>
      ) : isLoading || !data ? (
        <div className="report-loading" aria-busy="true">
          Loading sprint history…
        </div>
      ) : (
        children(data)
      )}
    </ReportPanel>
  );
}

function SprintChart({
  series,
  mode,
  height = 300,
}: {
  series: BurndownSeries;
  mode: "burndown" | "burnup";
  height?: number;
}) {
  const theme = useChartTheme();
  const today = dayKey(new Date());
  const hasToday = series.points.some((point) => point.date === today);
  const markerDays = [...new Set(series.scopeChanges.map((change) => change.date))];
  const data = useMemo(
    () =>
      series.points.map((point, index, all) => ({
        ...point,
        burnupGuide:
          Math.round(
            (series.committed * index) / Math.max(1, all.length - 1) * 10,
          ) / 10,
      })),
    [series],
  );
  const primary = mode === "burndown" ? theme.series[0] : theme.good;
  const legend =
    mode === "burndown"
      ? [
          { label: "Remaining", color: primary },
          { label: "Guideline", color: theme.muted, dashed: true },
          { label: "Scope change", color: theme.warning, dashed: true },
        ]
      : [
          { label: "Completed", color: primary },
          { label: "Total scope", color: theme.series[2] },
          { label: "Guideline", color: theme.muted, dashed: true },
        ];

  return (
    <figure className="report-figure">
      <ChartLegend items={legend} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps(theme)} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDayLabel(value)}
              {...axisProps(theme)}
              minTickGap={18}
            />
            <YAxis allowDecimals={false} {...axisProps(theme)} />
            <Tooltip
              content={<ChartTooltip labelKey="label" />}
              cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
            />
            {mode === "burndown" &&
              markerDays.map((date) => (
                <ReferenceLine
                  key={date}
                  x={date}
                  stroke={theme.warning}
                  strokeDasharray="4 3"
                />
              ))}
            {hasToday && (
              <ReferenceLine
                x={today}
                stroke={theme.ink}
                strokeOpacity={0.5}
                label={{ value: "Today", fill: theme.muted, fontSize: 10, position: "insideTopRight" }}
              />
            )}
            <Line
              dataKey={mode === "burndown" ? "guideline" : "burnupGuide"}
              name="Guideline"
              stroke={theme.muted}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {mode === "burnup" && (
              <Line
                type="stepAfter"
                dataKey="scope"
                name="Total scope"
                stroke={theme.series[2]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="stepAfter"
              dataKey={mode === "burndown" ? "remaining" : "completed"}
              name={mode === "burndown" ? "Remaining" : "Completed"}
              stroke={primary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function ScopeChangeTable({ series }: { series: BurndownSeries }) {
  const issueHref = useIssueHref();
  if (series.scopeChanges.length === 0) {
    return <p className="report-table-empty">No scope changes after the sprint started.</p>;
  }
  return (
    <div className="report-table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Issue</th>
            <th>Event</th>
            <th className="numeric">Points</th>
          </tr>
        </thead>
        <tbody>
          {series.scopeChanges.map((change) => (
            <tr key={`${change.issueId}-${change.at}`}>
              <td>{formatDayLabel(change.date)}</td>
              <td className="report-summary">
                <Link href={issueHref(change.issueId)} scroll={false}>
                  {change.issueId} {change.title}
                </Link>
              </td>
              <td>
                {change.reason === "added"
                  ? "Added to sprint"
                  : change.reason === "removed"
                    ? "Removed from sprint"
                    : "Estimate changed"}
              </td>
              <td className={`numeric ${change.delta > 0 ? "report-up" : "report-down"}`}>
                {change.delta > 0 ? `+${change.delta}` : change.delta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BurndownReport(props: ReportProps) {
  return (
    <SprintFrame
      {...props}
      title="Burndown chart"
      description="Story points remaining in the sprint"
    >
      {({ burndown }) => (
        <>
          <div className="report-stats">
            <StatTile label="Committed" value={burndown.committed} note="points at start" />
            <StatTile label="Current scope" value={burndown.currentScope} note="points" />
            <StatTile label="Remaining" value={burndown.currentRemaining} note="points" />
            <StatTile
              label="Scope changes"
              value={burndown.scopeChanges.length}
              note="after start"
            />
          </div>
          <SprintChart series={burndown} mode="burndown" />
          <h3 className="report-subheading">Scope changes</h3>
          <ScopeChangeTable series={burndown} />
        </>
      )}
    </SprintFrame>
  );
}

export function BurnupReport(props: ReportProps) {
  return (
    <SprintFrame
      {...props}
      title="Burnup chart"
      description="Completed work against total scope"
    >
      {({ burndown }) => {
        const completed = burndown.currentScope - burndown.currentRemaining;
        return (
          <>
            <div className="report-stats">
              <StatTile label="Completed" value={completed} note="points" />
              <StatTile label="Total scope" value={burndown.currentScope} note="points" />
              <StatTile
                label="Progress"
                value={`${burndown.currentScope ? Math.round((completed / burndown.currentScope) * 100) : 0}%`}
              />
            </div>
            <SprintChart series={burndown} mode="burnup" />
          </>
        );
      }}
    </SprintFrame>
  );
}

export function SprintReportView(props: ReportProps) {
  return (
    <SprintFrame
      {...props}
      title="Sprint report"
      description="What happened in the sprint"
    >
      {({ burndown, report, cycle }) => (
        <>
          {cycle.goal && (
            <p className="report-goal">
              <strong>Sprint goal</strong> {cycle.goal}
            </p>
          )}
          <div className="report-stats">
            <StatTile label="Completed" value={report.completed.length} note={`${report.completedPoints} points`} />
            <StatTile label="Not completed" value={report.notCompleted.length} note={`${report.notCompletedPoints} points`} />
            <StatTile label="Removed" value={report.removed.length} note={`${sumPoints(report.removed)} points`} />
            <StatTile label="Added after start" value={report.addedAfterStart.length} note={`${sumPoints(report.addedAfterStart)} points`} />
          </div>
          <SprintChart series={burndown} mode="burndown" height={220} />
          <h3 className="report-subheading">Completed issues</h3>
          <ReportIssueTable rows={report.completed} emptyLabel="No issues were completed." />
          <h3 className="report-subheading">Issues not completed</h3>
          <ReportIssueTable rows={report.notCompleted} emptyLabel="Every issue was completed." />
          <h3 className="report-subheading">Issues removed from sprint</h3>
          <ReportIssueTable rows={report.removed} emptyLabel="No issues were removed." />
          <h3 className="report-subheading">Issues added after sprint start</h3>
          <ReportIssueTable
            rows={report.addedAfterStart}
            emptyLabel="Nothing was added after the sprint started."
          />
        </>
      )}
    </SprintFrame>
  );
}
