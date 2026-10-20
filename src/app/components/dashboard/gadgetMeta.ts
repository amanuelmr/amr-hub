import type {
  Gadget,
  GadgetConfig,
  GadgetType,
} from "../../../server/dashboardSchemas";

export type { Gadget, GadgetConfig, GadgetType };

export type { DashboardRecord } from "../../../server/dashboards";

export type GadgetField =
  | "title"
  | "projectId"
  | "savedViewId"
  | "groupBy"
  | "rowField"
  | "columnField"
  | "days"
  | "limit";

export type GadgetMeta = {
  label: string;
  description: string;
  defaults: GadgetConfig;
  fields: GadgetField[];
};

export const GADGET_META: Record<GadgetType, GadgetMeta> = {
  ASSIGNED_TO_ME: {
    label: "Assigned to me",
    description: "Open issues assigned to you",
    defaults: { limit: 8 },
    fields: ["title", "projectId", "limit"],
  },
  FILTER_RESULTS: {
    label: "Filter results",
    description: "Issues matching a saved view",
    defaults: { savedViewId: null, limit: 10 },
    fields: ["title", "savedViewId", "limit"],
  },
  PIE_CHART: {
    label: "Pie chart",
    description: "Issues grouped by a field",
    defaults: { projectId: null, groupBy: "status" },
    fields: ["title", "projectId", "groupBy"],
  },
  CREATED_VS_RESOLVED: {
    label: "Created vs resolved",
    description: "Issues created and resolved over time",
    defaults: { projectId: null, days: 30 },
    fields: ["title", "projectId", "days"],
  },
  SPRINT_HEALTH: {
    label: "Sprint health",
    description: "Time elapsed vs work complete in the active sprint",
    defaults: { projectId: null },
    fields: ["title", "projectId"],
  },
  ACTIVITY_STREAM: {
    label: "Activity stream",
    description: "Recent changes across issues",
    defaults: { projectId: null, limit: 8 },
    fields: ["title", "projectId", "limit"],
  },
  TWO_DIMENSIONAL: {
    label: "Two-dimensional filter statistics",
    description: "Issue counts across two fields",
    defaults: { projectId: null, rowField: "assignee", columnField: "status" },
    fields: ["title", "projectId", "rowField", "columnField"],
  },
  ISSUE_STATISTICS: {
    label: "Issue statistics",
    description: "Issue counts by a field",
    defaults: { projectId: null, groupBy: "priority" },
    fields: ["title", "projectId", "groupBy"],
  },
  LABEL_HEATMAP: {
    label: "Heat map of labels",
    description: "How often each label is used",
    defaults: { projectId: null },
    fields: ["title", "projectId"],
  },
  WATCHED_ISSUES: {
    label: "Watched issues",
    description: "Issues you are watching",
    defaults: { limit: 8 },
    fields: ["title", "limit"],
  },
};

export const GADGET_ORDER = Object.keys(GADGET_META) as GadgetType[];

export function newGadget(type: GadgetType): Gadget {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return { id: `g-${random}`, type, config: { ...GADGET_META[type].defaults } };
}

export function gadgetTitle(gadget: Gadget) {
  return gadget.config.title?.trim() || GADGET_META[gadget.type].label;
}
