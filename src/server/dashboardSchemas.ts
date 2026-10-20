import { z } from "zod";

export const GADGET_TYPES = [
  "ASSIGNED_TO_ME",
  "FILTER_RESULTS",
  "PIE_CHART",
  "CREATED_VS_RESOLVED",
  "SPRINT_HEALTH",
  "ACTIVITY_STREAM",
  "TWO_DIMENSIONAL",
  "ISSUE_STATISTICS",
  "LABEL_HEATMAP",
  "WATCHED_ISSUES",
] as const;

export type GadgetType = (typeof GADGET_TYPES)[number];

const groupFieldSchema = z.enum([
  "assignee",
  "priority",
  "kind",
  "status",
  "label",
  "component",
]);

export const gadgetConfigSchema = z
  .object({
    title: z.string().trim().max(80).optional(),
    projectId: z.string().trim().max(80).nullable().optional(),
    savedViewId: z.string().trim().max(80).nullable().optional(),
    groupBy: groupFieldSchema.optional(),
    rowField: groupFieldSchema.optional(),
    columnField: groupFieldSchema.optional(),
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strip();

export const gadgetSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum(GADGET_TYPES),
  config: gadgetConfigSchema.default({}),
});

export const gadgetsSchema = z.array(gadgetSchema).max(30);

export type Gadget = z.infer<typeof gadgetSchema>;
export type GadgetConfig = z.infer<typeof gadgetConfigSchema>;

const shareSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("WORKSPACE") }).strict(),
  z.object({ type: z.literal("PROJECT"), id: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal("TEAM"), id: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal("USER"), id: z.string().trim().min(1).max(120) }).strict(),
]);
const sharesSchema = z.array(shareSchema).max(50);

export const createDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1000).nullable().optional(),
    gadgets: gadgetsSchema.optional(),
    viewers: sharesSchema.optional(),
    editors: sharesSchema.optional(),
  })
  .strict();

export const updateDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    gadgets: gadgetsSchema.optional(),
    viewers: sharesSchema.optional(),
    editors: sharesSchema.optional(),
  })
  .strict();

export const changeDashboardOwnerSchema = z
  .object({ userId: z.string().trim().min(1).max(120) })
  .strict();

/** Reads the stored JSON column, dropping anything that no longer validates. */
export function parseStoredGadgets(raw: string | null | undefined): Gadget[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const gadgets: Gadget[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed.slice(0, 30)) {
    const result = gadgetSchema.safeParse(candidate);
    if (result.success && !seen.has(result.data.id)) {
      seen.add(result.data.id);
      gadgets.push(result.data);
    }
  }
  return gadgets;
}

export function defaultGadgets(): Gadget[] {
  return [
    { id: "g-assigned", type: "ASSIGNED_TO_ME", config: { limit: 8 } },
    { id: "g-activity", type: "ACTIVITY_STREAM", config: { limit: 8 } },
    { id: "g-pie", type: "PIE_CHART", config: { projectId: null, groupBy: "status" } },
    {
      id: "g-created",
      type: "CREATED_VS_RESOLVED",
      config: { projectId: null, days: 30 },
    },
    { id: "g-sprint", type: "SPRINT_HEALTH", config: { projectId: null } },
    { id: "g-watched", type: "WATCHED_ISSUES", config: { limit: 8 } },
  ];
}
