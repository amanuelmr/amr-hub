import { z } from "zod";
import { parseJql } from "../app/data/jql";
import { issuePrioritySchema, issueStatusSchema } from "./issueSchemas";

const jqlSchema = z
  .string()
  .trim()
  .max(2000)
  .superRefine((value, context) => {
    const parsed = parseJql(value, undefined, { customFields: "any" });
    if (!parsed.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${parsed.error.message} (at character ${parsed.error.position + 1})`,
      });
    }
  });

export const savedViewSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    query: z.string().trim().max(100),
    status: z.union([
      z.literal("ALL"),
      z.literal("ACTIVE"),
      issueStatusSchema,
    ]),
    priority: z.union([z.literal("ALL"), issuePrioritySchema]),
    assignee: z.string().trim().min(1).max(80),
    sort: z.enum(["NEWEST", "OLDEST"]),
    labelId: z.string().trim().min(1).max(80).nullable(),
    jql: jqlSchema.nullable().optional(),
  })
  .strict();

/** Jira-style filter: just a name and a JQL query; basic fields take defaults. */
export const jqlFilterSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    jql: jqlSchema,
  })
  .strict();

export const createSavedViewSchema = z.union([savedViewSchema, jqlFilterSchema]);

export const updateSavedViewSchema = z
  .object({
    name: z.string().trim().min(2).max(50).optional(),
    jql: jqlSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.jql !== undefined, {
    message: "Provide a name or JQL to update",
  });
