"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Issue } from "../../data/issues";
import { groupIssues, type GroupField } from "../../data/reports";
import { ChartTooltip, ReportEmpty } from "./ChartParts";
import { seriesColor, statusColor, useChartTheme } from "./useChartTheme";
import { useWorkflows } from "../../WorkflowProvider";

const MAX_SLICES = 7;

export function IssuePieChart({
  issues,
  field,
  height = 240,
  projectId,
}: {
  issues: Issue[];
  field: GroupField;
  height?: number;
  /** Scopes status/type names and order to one project's workflow. */
  projectId?: string | null;
}) {
  const theme = useChartTheme();
  const { getWorkflow, allStatuses, allTypes } = useWorkflows();
  const config = useMemo(
    () =>
      projectId
        ? getWorkflow(projectId)
        : { statuses: allStatuses, types: allTypes },
    [projectId, getWorkflow, allStatuses, allTypes],
  );
  const slices = useMemo(() => {
    const groups = groupIssues(issues, field, config);
    if (groups.length <= MAX_SLICES + 1) return groups;
    const head = groups.slice(0, MAX_SLICES);
    const rest = groups.slice(MAX_SLICES);
    return [
      ...head,
      {
        key: "OTHER",
        label: "Other",
        count: rest.reduce((total, group) => total + group.count, 0),
        points: rest.reduce((total, group) => total + group.points, 0),
      },
    ];
  }, [issues, field, config]);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  if (total === 0) return <ReportEmpty>No issues to chart.</ReportEmpty>;

  const colorFor = (index: number, key: string) =>
    key === "OTHER" || key === "NONE"
      ? theme.series[theme.series.length - 1]
      : field === "status"
        ? statusColor(
            theme,
            key,
            config.statuses.find((status) => status.key === key)?.color,
          )
        : seriesColor(theme, index);

  return (
    <div className="pie-report">
      <div className="pie-report-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius="55%"
              outerRadius="90%"
              paddingAngle={1}
              stroke={theme.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.key} fill={colorFor(index, slice.key)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <table className="report-table pie-report-table">
        <tbody>
          {slices.map((slice, index) => (
            <tr key={slice.key}>
              <td>
                <i
                  className="legend-swatch"
                  style={{ background: colorFor(index, slice.key) }}
                  aria-hidden="true"
                />
                {slice.label}
              </td>
              <td className="numeric">{slice.count}</td>
              <td className="numeric muted">
                {Math.round((slice.count / total) * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
