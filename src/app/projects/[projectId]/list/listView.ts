import type { Issue } from "../../../data/issues";

/** Row highlight colours a format rule can use. */
export const FORMAT_COLORS = [
  { key: "red", label: "Red" },
  { key: "orange", label: "Orange" },
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "teal", label: "Teal" },
  { key: "purple", label: "Purple" },
] as const;

export type FormatColor = (typeof FORMAT_COLORS)[number]["key"];

/** Rows matching `jql` are highlighted in `color`; the first matching rule wins. */
export type FormatRule = { id: string; jql: string; color: FormatColor };

export const CHART_FIELDS = [
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "type", label: "Work type" },
] as const;

export type ChartField = (typeof CHART_FIELDS)[number]["key"];

export type ListPrefs = {
  hideDone: boolean;
  showHierarchy: boolean;
  showChart: boolean;
  chartBy: ChartField;
  rules: FormatRule[];
};

export const DEFAULT_LIST_PREFS: ListPrefs = {
  hideDone: false,
  showHierarchy: true,
  showChart: false,
  chartBy: "status",
  rules: [],
};

const COLOR_KEYS = FORMAT_COLORS.map((color) => color.key) as string[];
const CHART_KEYS = CHART_FIELDS.map((field) => field.key) as string[];

function isRule(value: unknown): value is FormatRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === "string" &&
    typeof rule.jql === "string" &&
    typeof rule.color === "string" &&
    COLOR_KEYS.includes(rule.color)
  );
}

export function parseListPrefs(raw: string | null): ListPrefs {
  if (!raw) return DEFAULT_LIST_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ListPrefs, unknown>>;
    return {
      hideDone: value.hideDone === true,
      showHierarchy: value.showHierarchy !== false,
      showChart: value.showChart === true,
      chartBy:
        typeof value.chartBy === "string" && CHART_KEYS.includes(value.chartBy)
          ? (value.chartBy as ChartField)
          : DEFAULT_LIST_PREFS.chartBy,
      rules: Array.isArray(value.rules) ? value.rules.filter(isRule) : [],
    };
  } catch {
    return DEFAULT_LIST_PREFS;
  }
}

export type ChartBucket = { key: string; label: string; count: number };

/** Counts issues per bucket, largest first; empty buckets are left out. */
export function countBy(
  issues: Issue[],
  bucketOf: (issue: Issue) => [key: string, label: string],
): ChartBucket[] {
  const buckets = new Map<string, ChartBucket>();
  for (const issue of issues) {
    const [key, label] = bucketOf(issue);
    const bucket = buckets.get(key) ?? { key, label, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/** The colour of the first rule whose matcher accepts the issue. */
export function ruleColor(
  issue: Issue,
  rules: { color: FormatColor; matches: (issue: Issue) => boolean }[],
): FormatColor | null {
  return rules.find((rule) => rule.matches(issue))?.color ?? null;
}
