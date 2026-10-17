import { z } from "zod";
import { issuePrioritySchema, issueStatusSchema } from "./issueSchemas";

export const MAX_BULK_ISSUES = 200;

const issueIdsSchema = z
  .array(z.string().trim().min(1).max(120))
  .min(1)
  .max(MAX_BULK_ISSUES)
  .transform((ids) => [...new Set(ids)]);
const optionalIdSchema = z.string().trim().min(1).max(120).nullable();
const labelIdsSchema = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
  .max(10)
  .transform((ids) => [...new Set(ids)]);

export const bulkIssueSchema = z.discriminatedUnion("operation", [
  z.object({ issueIds: issueIdsSchema, operation: z.literal("transition"), value: issueStatusSchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("assign"), value: optionalIdSchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("priority"), value: issuePrioritySchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("addLabels"), value: labelIdsSchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("removeLabels"), value: labelIdsSchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("sprint"), value: optionalIdSchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("fixVersion"), value: optionalIdSchema }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("flag"), value: z.boolean() }).strict(),
  z.object({ issueIds: issueIdsSchema, operation: z.literal("delete") }).strict(),
]);

export type BulkIssueRequest = z.infer<typeof bulkIssueSchema>;
export type BulkOperation = BulkIssueRequest["operation"];

/** Computes the next label set for add/remove; null when nothing changes. */
export function nextLabelIds(
  current: string[],
  operation: "addLabels" | "removeLabels",
  labelIds: string[],
): string[] | null {
  const next =
    operation === "addLabels"
      ? [...new Set([...current, ...labelIds])]
      : current.filter((id) => !labelIds.includes(id));
  const unchanged =
    next.length === current.length && next.every((id) => current.includes(id));
  return unchanged ? null : next;
}
