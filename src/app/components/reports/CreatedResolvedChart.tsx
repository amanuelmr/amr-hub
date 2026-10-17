"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CreatedResolvedPoint } from "../../data/reports";
import { ChartLegend, ChartTooltip, axisProps, gridProps } from "./ChartParts";
import { useChartTheme } from "./useChartTheme";

export function CreatedResolvedChart({
  points,
  cumulative = false,
  height = 260,
}: {
  points: CreatedResolvedPoint[];
  cumulative?: boolean;
  height?: number;
}) {
  const theme = useChartTheme();
  const createdKey = cumulative ? "createdTotal" : "created";
  const resolvedKey = cumulative ? "resolvedTotal" : "resolved";
  const createdColor = theme.critical;
  const resolvedColor = theme.good;

  return (
    <div>
      <ChartLegend
        items={[
          { label: "Created", color: createdColor },
          { label: "Resolved", color: resolvedColor },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid {...gridProps(theme)} />
            <XAxis dataKey="label" {...axisProps(theme)} minTickGap={16} />
            <YAxis allowDecimals={false} {...axisProps(theme)} />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
            />
            <Line
              type="monotone"
              dataKey={createdKey}
              name="Created"
              stroke={createdColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey={resolvedKey}
              name="Resolved"
              stroke={resolvedColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
