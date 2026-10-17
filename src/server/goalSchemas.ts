import { z } from "zod";
import { GOAL_STATUSES } from "../app/components/goals/goalModel";
import { sanitizeDescriptionHtml } from "./richText";

export const goalStatusSchema = z.enum(GOAL_STATUSES);

const idSchema = z.string().trim().min(1).max(120);

const targetDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Target date must be a valid calendar date");

const descriptionSchema = z
  .string()
  .trim()
  .max(20000)
  .transform((value) => sanitizeDescriptionHtml(value));

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the goal a name")
  .max(255, "Keep the name under 255 characters");

export const createGoalSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.default(""),
    ownerId: idSchema.nullable().default(null),
    targetDate: targetDateSchema.nullable().default(null),
    parentId: idSchema.nullable().default(null),
    status: goalStatusSchema.default("PENDING"),
  })
  .strict();

export const updateGoalSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    ownerId: idSchema.nullable().optional(),
    targetDate: targetDateSchema.nullable().optional(),
    parentId: idSchema.nullable().optional(),
    status: goalStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const createGoalUpdateSchema = z
  .object({
    status: goalStatusSchema,
    body: z
      .string()
      .trim()
      .min(1, "Describe the progress since the last update")
      .max(5000, "Keep the update under 5000 characters"),
  })
  .strict();

export const linkGoalIssuesSchema = z
  .object({
    issueIds: z
      .array(idSchema)
      .min(1, "Pick at least one work item")
      .max(50)
      .transform((ids) => [...new Set(ids)]),
  })
  .strict();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateGoalUpdateInput = z.infer<typeof createGoalUpdateSchema>;
