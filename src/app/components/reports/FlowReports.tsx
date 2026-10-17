"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildControlChart,
  buildCreatedVsResolved,
  buildCumulativeFlow,
  buildVelocity,
  dayKey,
  formatDayLabel,
  type Granularity,
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
import { CreatedResolvedChart } from "./CreatedResolvedChart";
import {
  SegmentedControl,
  useIssueHref,
  type ReportProps,
} from "./ReportShared";
import { statusColor, useChartTheme } from "./useChartTheme";
import { useWorkflow } from "../../WorkflowProvider";

export function VelocityReport({ project, issues, cycles }: ReportProps) {
  const theme = useChartTheme();
  const { statuses } = useWorkflow(project.id);
  const points = useMemo(
    () =>
      buildVelocity(
        cycles.filter((cycle) => cycle.projectId === project.id),
        issues,
        undefined,
        undefined,
        statuses,
      ),
    [cycles, issues, project.id, statuses],
  );
  const average = points.length
    ? Math.round(
        points.reduce((total, point) => total + point.completed, 0) / points.length,
      )
    : 0;

  return (
    <ReportPanel
      title="Velocity chart"
      description="Committed vs completed story points for the last seven closed sprints"
    >
      {points.length === 0 ? (
        <ReportEmpty>Complete a sprint to start tracking velocity.</ReportEmpty>
      ) : (
        <>
          <div className="report-stats">
            <StatTile label="Average velocity" value={average} note="points per sprint" />
            <StatTile label="Sprints" value={points.length} note="closed" />
          </div>
          <ChartLegend
            items={[
              { label: "Commitment", color: theme.series[7] },
              { label: "Completed", color: theme.good },
            ]}
          />
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2}>
                <CartesianGrid {...gridProps(theme)} />
                <XAxis dataKey="name" {...axisProps(theme)} />
                <YAxis allowDecimals={false} {...axisProps(theme)} />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: theme.grid, fillOpacity: 0.35 }}
                />
                <Bar
                  dataKey="committed"
                  name="Commitment"
                  fill={theme.series[7]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  fill={theme.good}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="report-table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Sprint</th>
                  <th className="numeric">Commitment</th>
                  <th className="numeric">Completed</th>
                  <th className="numeric">Say/do</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.cycleId}>
                    <td>{point.name}</td>
                    <td className="numeric">{point.committed}</td>
                    <td className="numeric">{point.completed}</td>
                    <td className="numeric">
                      {point.committed
                        ? `${Math.round((point.completed / point.committed) * 100)}%`
                        : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportPanel>
  );
}

const FLOW_PERIODS = [
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export function CumulativeFlowReport({ project, issues }: ReportProps) {
  const theme = useChartTheme();
  const { statuses } = useWorkflow(project.id);
  const [days, setDays] = useState(30);
  const points = useMemo(
    () => buildCumulativeFlow(issues, days, undefined, statuses),
    [issues, days, statuses],
  );
  const stackOrder = [...statuses].reverse();

  return (
    <ReportPanel
      title="Cumulative flow diagram"
      description="Issues per status at the end of each day"
      controls={
        <SegmentedControl label="Period" value={days} options={FLOW_PERIODS} onChange={setDays} />
      }
    >
      {issues.length === 0 ? (
        <ReportEmpty>No issues in this project yet.</ReportEmpty>
      ) : (
        <>
          <ChartLegend
            items={statuses.map((status) => ({
              label: status.name,
              color: statusColor(theme, status.key, status.color),
            }))}
          />
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid {...gridProps(theme)} />
                <XAxis dataKey="label" {...axisProps(theme)} minTickGap={18} />
                <YAxis allowDecimals={false} {...axisProps(theme)} />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
                />
                {stackOrder.map((status) => (
                  <Area
                    key={status.key}
                    type="monotone"
                    dataKey={status.key}
                    name={status.name}
                    stackId="flow"
                    stroke={theme.surface}
                    strokeWidth={1}
                    fill={statusColor(theme, status.key, status.color)}
                    fillOpacity={0.9}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ReportPanel>
  );
}

const CONTROL_PERIODS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 0, label: "All time" },
];

export function ControlChartReport({ project, issues }: ReportProps) {
  const theme = useChartTheme();
  const issueHref = useIssueHref();
  const { statuses } = useWorkflow(project.id);
  const [days, setDays] = useState(90);
  const chart = useMemo(
    () =>
      buildControlChart(issues, { days: days || undefined, window: 5, statuses }),
    [issues, days, statuses],
  );
  const data = chart.points.map((point) => ({
    ...point,
    x: point.resolvedAt,
    label: `${point.issueId} · ${formatDayLabel(point.date)}`,
  }));

  return (
    <ReportPanel
      title="Control chart"
      description="Cycle time in days from first In progress to Done"
      controls={
        <SegmentedControl label="Period" value={days} options={CONTROL_PERIODS} onChange={setDays} />
      }
    >
      {data.length === 0 ? (
        <ReportEmpty>No issues were resolved in this period.</ReportEmpty>
      ) : (
        <>
          <div className="report-stats">
            <StatTile label="Issues" value={data.length} note="resolved" />
            <StatTile label="Average" value={`${chart.average}d`} note="cycle time" />
            <StatTile label="Median" value={`${Math.round(chart.median * 10) / 10}d`} note="cycle time" />
          </div>
          <ChartLegend
            items={[
              { label: "Issue", color: theme.series[0] },
              { label: "Rolling average (5)", color: theme.series[1] },
            ]}
          />
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid {...gridProps(theme)} />
                <XAxis
                  dataKey="x"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value: number) => formatDayLabel(dayKey(value))}
                  {...axisProps(theme)}
                  minTickGap={24}
                />
                <YAxis
                  dataKey="cycleDays"
                  unit="d"
                  allowDecimals={false}
                  {...axisProps(theme)}
                />
                <Tooltip
                  content={<ChartTooltip labelKey="label" />}
                  cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
                />
                <Scatter
                  dataKey="cycleDays"
                  name="Cycle time (days)"
                  fill={theme.series[0]}
                  stroke={theme.surface}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="rolling"
                  name="Rolling average"
                  stroke={theme.series[1]}
                  strokeWidth={2}
                  dot={false}
                  type="monotone"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <details className="report-details">
            <summary>Show resolved issues</summary>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Resolved</th>
                    <th className="numeric">Cycle time</th>
                  </tr>
                </thead>
                <tbody>
                  {[...chart.points].reverse().map((point) => (
                    <tr key={point.issueId}>
                      <td className="report-summary">
                        <Link href={issueHref(point.issueId)} scroll={false}>
                          {point.issueId} {point.title}
                        </Link>
                      </td>
                      <td>{formatDayLabel(point.date)}</td>
                      <td className="numeric">
                        {point.cycleDays}d{point.fromCreated ? "*" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-meta">* never moved to In progress; measured from creation.</p>
          </details>
        </>
      )}
    </ReportPanel>
  );
}

const CREATED_PERIODS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

export function CreatedVsResolvedReport({ project, issues }: ReportProps) {
  const { statuses } = useWorkflow(project.id);
  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [cumulative, setCumulative] = useState(false);
  const points = useMemo(
    () => buildCreatedVsResolved(issues, { days, granularity, statuses }),
    [issues, days, granularity, statuses],
  );
  const last = points.at(-1);

  return (
    <ReportPanel
      title="Created vs resolved"
      description="Issues created and resolved per period"
      controls={
        <>
          <SegmentedControl label="Period" value={days} options={CREATED_PERIODS} onChange={setDays} />
          <SegmentedControl
            label="Granularity"
            value={granularity}
            options={GRANULARITIES}
            onChange={setGranularity}
          />
          <label className="report-checkbox">
            <input
              type="checkbox"
              checked={cumulative}
              onChange={(event) => setCumulative(event.target.checked)}
            />
            Cumulative
          </label>
        </>
      }
    >
      <div className="report-stats">
        <StatTile label="Created" value={last?.createdTotal ?? 0} note={`last ${days} days`} />
        <StatTile label="Resolved" value={last?.resolvedTotal ?? 0} note={`last ${days} days`} />
        <StatTile
          label="Net"
          value={(last?.createdTotal ?? 0) - (last?.resolvedTotal ?? 0)}
          note="backlog change"
        />
      </div>
      <CreatedResolvedChart points={points} cumulative={cumulative} height={300} />
    </ReportPanel>
  );
}
