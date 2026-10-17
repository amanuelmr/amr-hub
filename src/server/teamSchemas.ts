import { z } from "zod";

const teamName = z
  .string()
  .trim()
  .min(1, "Team name is required")
  .max(80, "Team name must be 80 characters or fewer");

const teamDescription = z
  .string()
  .trim()
  .max(1000, "Description must be 1000 characters or fewer")
  .nullable()
  .transform((value) => (value ? value : null));

const userIds = z
  .array(z.string().trim().min(1).max(128))
  .max(200, "A team can have at most 200 members")
  .transform((ids) => [...new Set(ids)]);

export const createTeamSchema = z
  .object({
    name: teamName,
    description: teamDescription.optional().default(null),
    memberUserIds: userIds.optional().default([]),
  })
  .strict();

export const updateTeamSchema = z
  .object({
    name: teamName.optional(),
    description: teamDescription.optional(),
    memberUserIds: userIds.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const teamMembersSchema = z
  .object({
    userIds: userIds.refine((ids) => ids.length > 0, {
      message: "Select at least one person",
    }),
  })
  .strict();

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
