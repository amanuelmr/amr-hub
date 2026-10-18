import { isValidStatusKey } from "../app/data/workflow";
import { parseJql } from "../app/data/jql";
import {
  CARD_EXTRA_FIELDS,
  DEFAULT_BOARD_CONFIG,
  MAX_CARD_EXTRA_FIELDS,
  type CardField,
} from "../app/data/projects";
import { z } from "zod";

const CARD_FIELDS = [
  "epic",
  "storyPoints",
  "priority",
  "assignee",
  "dueDate",
  "labels",
  "components",
  "fixVersion",
  "subtasks",
] as const satisfies readonly CardField[];

const jqlSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter a JQL query" })
  .max(2000)
  .superRefine((value, context) => {
    const parsed = parseJql(value);
    if (!parsed.ok) {
      context.addIssue({
        code: "custom",
        message: `Invalid JQL: ${parsed.error.message}`,
      });
    }
  });

const boardQuerySchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(60),
    jql: jqlSchema,
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .strict();

const uniqueIds = (queries: { id: string }[]) =>
  new Set(queries.map((query) => query.id)).size === queries.length;

const boardTypeSchema = z.enum(["SCRUM", "KANBAN"]);

export const boardConfigSchema = z
  .object({
    columns: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(60),
            name: z.string().trim().min(1).max(40),
            statuses: z
              .array(
                z.string().trim().max(80).refine(isValidStatusKey, {
                  message: "Unknown status",
                }),
              )
              .max(60),
            wipLimit: z.number().int().min(1).max(999).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    swimlanes: z.enum(["NONE", "ASSIGNEE", "EPIC", "PRIORITY", "QUERY"]),
    showBacklogColumn: z.boolean(),
    estimation: z.enum(["STORY_POINTS", "TIME"]),
    cardFields: z
      .array(z.enum(CARD_FIELDS))
      .max(CARD_FIELDS.length)
      .transform((fields) => [...new Set(fields)])
      .refine(
        (fields) =>
          fields.filter((field) => CARD_EXTRA_FIELDS.includes(field)).length <=
          MAX_CARD_EXTRA_FIELDS,
        { message: `Choose at most ${MAX_CARD_EXTRA_FIELDS} extra card fields` },
      )
      .default(DEFAULT_BOARD_CONFIG.cardFields),
    cardColors: z
      .object({
        strategy: z.enum(["NONE", "ISSUE_TYPE", "PRIORITY", "ASSIGNEE", "QUERY"]),
        queries: z
          .array(boardQuerySchema)
          .max(20)
          .refine(uniqueIds, { message: "Query ids must be unique" })
          .refine((queries) => queries.every((query) => !!query.color), {
            message: "Every card color query needs a color",
          }),
      })
      .strict()
      .default(DEFAULT_BOARD_CONFIG.cardColors),
    quickFilters: z
      .array(boardQuerySchema)
      .max(20)
      .refine(uniqueIds, { message: "Quick filter ids must be unique" })
      .default([]),
    swimlaneQueries: z
      .array(boardQuerySchema)
      .max(20)
      .refine(uniqueIds, { message: "Swimlane ids must be unique" })
      .default([]),
    kanbanDoneDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .nullable()
      .default(DEFAULT_BOARD_CONFIG.kanbanDoneDays),
    parallelSprints: z.boolean().default(false),
  })
  .strict()
  .refine(
    (config) => {
      const statuses = config.columns.flatMap((column) => column.statuses);
      return new Set(statuses).size === statuses.length;
    },
    {
      message: "Each status can be mapped to at most one column",
      path: ["columns"],
    },
  )
  .refine(
    (config) =>
      new Set(config.columns.map((column) => column.id)).size ===
      config.columns.length,
    { message: "Column ids must be unique", path: ["columns"] },
  );

export const projectStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELED",
]);

const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,5}$/, {
    message: "Key must be 2-6 letters/numbers, starting with a letter",
  });

const targetDateSchema = z
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
      message: "Target date must be a valid calendar date",
    },
  );

export const createProjectSchema = z
  .object({
    key: projectKeySchema,
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).nullable().default(null),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .default(null),
    targetDate: targetDateSchema.nullable().default(null),
    boardType: boardTypeSchema.optional(),
    accessLevel: z.enum(["OPEN", "LIMITED", "PRIVATE"]).optional(),
  })
  .strict();

export const projectAccessUpdateSchema = z
  .object({ accessLevel: z.enum(["OPEN", "LIMITED", "PRIVATE"]) })
  .strict();

export const addProjectMembersSchema = z
  .object({
    userIds: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
  })
  .strict();

export const updateProjectMemberSchema = z
  .object({
    userId: z.string().trim().min(1).max(120),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    status: projectStatusSchema.optional(),
    targetDate: targetDateSchema.nullable().optional(),
    boardType: boardTypeSchema.optional(),
    leadUserId: z.string().trim().min(1).max(120).nullable().optional(),
    boardConfig: boardConfigSchema.optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one project field to update",
  });

const cycleNameSchema = z.string().trim().min(2).max(80);
const cycleDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createCycleSchema = z
  .object({
    projectId: z.string().trim().min(1).max(120),
    name: cycleNameSchema,
    startDate: cycleDateSchema,
    endDate: cycleDateSchema,
    capacity: z.coerce.number().int().min(1).max(500),
  })
  .strict()
  .refine((input) => input.startDate < input.endDate, {
    message: "Start date must be before the end date",
    path: ["endDate"],
  });

const sprintGoalSchema = z.string().trim().max(500).nullable();

export const createSprintSchema = z
  .object({
    projectId: z.string().trim().min(1).max(120),
    name: cycleNameSchema.optional(),
    goal: sprintGoalSchema.optional(),
    startDate: cycleDateSchema.optional(),
    endDate: cycleDateSchema.optional(),
    capacity: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict()
  .refine(
    (input) =>
      !input.startDate || !input.endDate || input.startDate < input.endDate,
    { message: "Start date must be before the end date", path: ["endDate"] },
  );

export const updateSprintSchema = z
  .object({
    name: cycleNameSchema.optional(),
    goal: sprintGoalSchema.optional(),
    startDate: cycleDateSchema.optional(),
    endDate: cycleDateSchema.optional(),
    capacity: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one sprint field to update",
  })
  .refine(
    (input) =>
      !input.startDate || !input.endDate || input.startDate < input.endDate,
    { message: "Start date must be before the end date", path: ["endDate"] },
  );

export const startSprintSchema = z
  .object({
    name: cycleNameSchema.optional(),
    goal: sprintGoalSchema.optional(),
    startDate: cycleDateSchema,
    endDate: cycleDateSchema,
  })
  .strict()
  .refine((input) => input.startDate < input.endDate, {
    message: "Start date must be before the end date",
    path: ["endDate"],
  });

export const completeSprintSchema = z
  .object({
    destination: z.enum(["BACKLOG", "SPRINT", "NEW_SPRINT"]),
    sprintId: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((input) => input.destination !== "SPRINT" || !!input.sprintId, {
    message: "Choose the sprint that receives open issues",
    path: ["sprintId"],
  });

export const rankIssuesSchema = z
  .object({
    issueIds: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(200)
      .transform((ids) => [...new Set(ids)]),
    beforeId: z.string().trim().min(1).max(120).optional(),
    afterId: z.string().trim().min(1).max(120).optional(),
    cycleId: z.string().trim().min(1).max(120).nullable().optional(),
    status: z
      .string()
      .trim()
      .max(80)
      .refine(isValidStatusKey, { message: "Unknown status" })
      .optional(),
  })
  .strict();
