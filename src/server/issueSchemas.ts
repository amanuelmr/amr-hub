import { z } from "zod";
import { sanitizeDescriptionHtml, stripHtml } from "./richText";
import { isValidStatusKey, isValidTypeKey } from "../app/data/workflow";
import { customFieldValuesInputSchema } from "./customFieldSchemas";

/**
 * Status keys are built-ins or custom "<CATEGORY>:<slug>" keys. The server
 * then checks the key against the project's configured workflow.
 */
export const issueStatusSchema = z
  .string()
  .trim()
  .max(80)
  .refine(isValidStatusKey, { message: "Unknown status" });

export const issuePrioritySchema = z.enum([
  "NO_PRIORITY",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

/** Work type keys are built-ins or custom "L<level>:<slug>" keys. */
export const issueKindSchema = z
  .string()
  .trim()
  .max(80)
  .refine(isValidTypeKey, { message: "Unknown work type" });
export const issueEstimateSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
  z.literal(13),
  z.literal(21),
]);
export const issueResolutionSchema = z.enum([
  "DONE",
  "WONT_DO",
  "DUPLICATE",
  "CANNOT_REPRODUCE",
]);
export const issueLinkTypeSchema = z.enum([
  "BLOCKS",
  "IS_BLOCKED_BY",
  "RELATES_TO",
  "DUPLICATES",
  "IS_DUPLICATED_BY",
  "CLONES",
  "IS_CLONED_BY",
]);

const cycleIdSchema = z.string().trim().min(1).max(80).nullable();
const assigneeIdSchema = z.string().trim().min(1).max(80).nullable();
const projectIdSchema = z.string().trim().min(1).max(120);
const optionalIdSchema = z.string().trim().min(1).max(120).nullable();
const minutesSchema = z.number().int().min(0).max(1_000_000).nullable();
const componentIdsSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(20)
  .transform((ids) => [...new Set(ids)]);
const environmentSchema = z.string().trim().max(2000).nullable();

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      const parsed = new Date(`${value}T12:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    },
    {
      message: "Due date must be a valid calendar date",
    },
  );

const labelIdsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(10)
  .transform((labelIds) => [...new Set(labelIds)]);

const descriptionSchema = z
  .string()
  .trim()
  .max(20000)
  .transform((value) => sanitizeDescriptionHtml(value))
  .refine(
    (value) => {
      // Jira allows an empty description; a written one must be meaningful.
      const length = stripHtml(value).length;
      return length === 0 || length >= 12;
    },
    {
      message: "Add enough detail for someone else to understand the issue.",
    },
  );

export const createIssueSchema = z
  .object({
    title: z.string().trim().min(4).max(255),
    description: descriptionSchema.default(""),
    priority: issuePrioritySchema,
    kind: issueKindSchema,
    assigneeId: assigneeIdSchema,
    dueDate: dueDateSchema.nullable(),
    estimate: issueEstimateSchema.nullable(),
    projectId: projectIdSchema,
    cycleId: cycleIdSchema,
    labelIds: labelIdsSchema,
    status: issueStatusSchema.optional(),
    parentId: optionalIdSchema.optional(),
    fixVersionId: optionalIdSchema.optional(),
    teamId: optionalIdSchema.optional(),
    goalId: optionalIdSchema.optional(),
    componentIds: componentIdsSchema.optional(),
    startDate: dueDateSchema.nullable().optional(),
    originalEstimateMinutes: minutesSchema.optional(),
    environment: environmentSchema.optional(),
    customFields: customFieldValuesInputSchema.optional(),
  })
  .strict();

export const updateIssueSchema = z
  .object({
    title: z.string().trim().min(4).max(255).optional(),
    description: descriptionSchema.optional(),
    status: issueStatusSchema.optional(),
    priority: issuePrioritySchema.optional(),
    kind: issueKindSchema.optional(),
    assigneeId: assigneeIdSchema.optional(),
    dueDate: dueDateSchema.nullable().optional(),
    estimate: issueEstimateSchema.nullable().optional(),
    cycleId: cycleIdSchema.optional(),
    labelIds: labelIdsSchema.optional(),
    parentId: optionalIdSchema.optional(),
    fixVersionId: optionalIdSchema.optional(),
    teamId: optionalIdSchema.optional(),
    goalId: optionalIdSchema.optional(),
    componentIds: componentIdsSchema.optional(),
    startDate: dueDateSchema.nullable().optional(),
    rank: z.number().finite().optional(),
    flagged: z.boolean().optional(),
    resolution: issueResolutionSchema.nullable().optional(),
    environment: environmentSchema.optional(),
    originalEstimateMinutes: minutesSchema.optional(),
    remainingEstimateMinutes: minutesSchema.optional(),
    customFields: customFieldValuesInputSchema.optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one issue field to update",
  });

export const createCommentSchema = z
  .object({
    body: z.string().trim().min(2).max(1000),
  })
  .strict();

export const listIssuesQuerySchema = z.object({
  status: z
    .union([z.literal("ALL"), z.literal("ACTIVE"), issueStatusSchema])
    .default("ALL"),
  priority: z.union([z.literal("ALL"), issuePrioritySchema]).default("ALL"),
  projectId: z.string().trim().min(1).max(120).optional(),
  cycleId: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().trim().min(1).max(120).optional(),
  kind: issueKindSchema.optional(),
  labelId: z.string().trim().min(1).max(80).optional(),
  assigneeId: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["NEWEST", "OLDEST", "RANK"]).default("NEWEST"),
  cursor: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;
