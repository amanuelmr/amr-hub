"use client";

import type { ReactNode } from "react";
import type { ChartTheme } from "./useChartTheme";

type TooltipEntry = {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  formatValue?: (value: number, entry: TooltipEntry) => string;
  labelKey?: string;
};

export function ChartTooltip({
  active,
  label,
  payload,
  formatValue,
  labelKey,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const heading =
    labelKey && payload[0]?.payload
      ? String(payload[0].payload[labelKey] ?? label ?? "")
      : label;

  return (
    <div className="chart-tooltip">
      {heading !== undefined && heading !== "" && (
        <strong className="chart-tooltip-label">{heading}</strong>
      )}
      {payload
        .filter((entry) => entry.value !== null && entry.value !== undefined)
        .map((entry) => (
          <span key={String(entry.dataKey ?? entry.name)} className="chart-tooltip-row">
            <i style={{ background: entry.color }} aria-hidden="true" />
            <span>{entry.name}</span>
            <b>
              {typeof entry.value === "number"
                ? formatValue
                  ? formatValue(entry.value, entry)
                  : Number.isInteger(entry.value)
                    ? entry.value
                    : entry.value.toFixed(1)
                : String(entry.value)}
            </b>
          </span>
        ))}
    </div>
  );
}

export function axisProps(theme: ChartTheme) {
  return {
    stroke: theme.grid,
    tick: { fill: theme.muted, fontSize: 11, fontFamily: theme.font },
    tickLine: false,
    axisLine: { stroke: theme.grid },
  } as const;
}

export function gridProps(theme: ChartTheme) {
  return {
    stroke: theme.grid,
    strokeDasharray: "2 4",
    vertical: false,
  } as const;
}

export type LegendItem = { label: string; color: string; dashed?: boolean };

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="chart-legend report-legend" aria-label="Chart legend">
      {items.map((item) => (
        <span key={item.label}>
          <i
            className={item.dashed ? "legend-swatch dashed" : "legend-swatch"}
            style={
              item.dashed
                ? { borderColor: item.color }
                : { background: item.color }
            }
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ReportPanel({
  title,
  description,
  controls,
  children,
  className,
}: {
  title: string;
  description?: string;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // Each report page renders exactly one panel, so its title doubles as the
  // compact Jira page title with the report controls on the right.
  return (
    <>
      <header className="jira-page-header report-page-header">
        <div className="report-page-heading">
          <h1 className="jira-page-title">{title}</h1>
          {description && <p className="jira-page-subtitle">{description}</p>}
        </div>
        {controls && (
          <div className="jira-page-actions report-controls">{controls}</div>
        )}
      </header>
      <section className={`panel report-panel ${className ?? ""}`}>
        {children}
      </section>
    </>
  );
}

export function ReportEmpty({ children }: { children: ReactNode }) {
  return <p className="empty-state report-empty">{children}</p>;
}

export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="report-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
