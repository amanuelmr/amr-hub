import {
  Activity,
  BarChart3,
  Clock3,
  FileBarChart,
  Layers,
  LineChart,
  Package,
  PieChart,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export type ReportSlug =
  | "burndown"
  | "burnup"
  | "velocity"
  | "sprint"
  | "cumulative-flow"
  | "control-chart"
  | "created-vs-resolved"
  | "pie"
  | "version"
  | "epic"
  | "time-tracking"
  | "workload";

export type ReportDefinition = {
  slug: ReportSlug;
  title: string;
  description: string;
  group: "Agile" | "Issue analysis" | "Forecast & management";
  icon: typeof BarChart3;
  scrumOnly?: boolean;
};

export const REPORTS: ReportDefinition[] = [
  {
    slug: "burndown",
    title: "Burndown chart",
    description: "Track remaining story points in a sprint against the ideal guideline.",
    group: "Agile",
    icon: TrendingDown,
    scrumOnly: true,
  },
  {
    slug: "burnup",
    title: "Burnup chart",
    description: "Compare completed work with total sprint scope, day by day.",
    group: "Agile",
    icon: TrendingUp,
    scrumOnly: true,
  },
  {
    slug: "sprint",
    title: "Sprint report",
    description: "Completed, not completed, removed and added-after-start issues.",
    group: "Agile",
    icon: FileBarChart,
    scrumOnly: true,
  },
  {
    slug: "velocity",
    title: "Velocity chart",
    description: "Committed vs completed points for the last seven closed sprints.",
    group: "Agile",
    icon: BarChart3,
    scrumOnly: true,
  },
  {
    slug: "cumulative-flow",
    title: "Cumulative flow diagram",
    description: "Issues in each status over time, to spot bottlenecks.",
    group: "Agile",
    icon: Layers,
  },
  {
    slug: "control-chart",
    title: "Control chart",
    description: "Cycle time from first In progress to Done, with a rolling average.",
    group: "Agile",
    icon: Activity,
  },
  {
    slug: "created-vs-resolved",
    title: "Created vs resolved",
    description: "Whether the backlog is growing or shrinking over a period.",
    group: "Issue analysis",
    icon: LineChart,
  },
  {
    slug: "pie",
    title: "Pie chart report",
    description: "Issues grouped by assignee, priority, type, status, label or component.",
    group: "Issue analysis",
    icon: PieChart,
  },
  {
    slug: "time-tracking",
    title: "Time tracking report",
    description: "Original estimate vs time spent vs remaining per issue.",
    group: "Issue analysis",
    icon: Clock3,
  },
  {
    slug: "workload",
    title: "User workload report",
    description: "Open issues, points and remaining estimate per assignee.",
    group: "Issue analysis",
    icon: Users,
  },
  {
    slug: "version",
    title: "Version report",
    description: "Progress of a release over time and the issues left in it.",
    group: "Forecast & management",
    icon: Package,
  },
  {
    slug: "epic",
    title: "Epic report",
    description: "Child issues done vs total, points and the remaining work in an epic.",
    group: "Forecast & management",
    icon: Zap,
  },
];

export const REPORT_GROUPS: ReportDefinition["group"][] = [
  "Agile",
  "Issue analysis",
  "Forecast & management",
];

export function findReport(slug: string) {
  return REPORTS.find((report) => report.slug === slug) ?? null;
}
