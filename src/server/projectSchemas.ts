import { isValidStatusKey } from "../app/data/workflow";
import { z } from "zod";

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
    swimlanes: z.enum(["NONE", "ASSIGNEE", "EPIC", "PRIORITY"]),
    showBacklogColumn: z.boolean(),
    estimation: z.enum(["STORY_POINTS", "TIME"]),
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
