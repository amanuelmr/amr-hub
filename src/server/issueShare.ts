import { z } from "zod";
import prisma from "../../prisma/client";
import type { WorkspaceActor } from "./issues";
import { IssueActionError } from "./issueRelations";
import { notifyRecipients } from "./notifications";

export const shareIssueSchema = z
  .object({
    /** User ids of workspace members. */
    userIds: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    /** Member ids (what the client's member picker holds); resolved to users. */
    memberIds: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

export type ShareIssueInput = z.infer<typeof shareIssueSchema>;

/**
 * Jira's "Share": notifies teammates in-app about an issue, with an optional
 * note. Only members of the issue's workspace can be recipients.
 */
export async function shareIssue(
  issueId: string,
  input: ShareIssueInput,
  actor: WorkspaceActor,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: actor.organizationId },
    select: { id: true, title: true, projectId: true },
  });
  if (!issue) return null;

  const members = await prisma.member.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: [
        { userId: { in: input.userIds } },
        { id: { in: input.memberIds } },
      ],
    },
    select: { userId: true, user: { select: { name: true } } },
  });
  const recipients = members.filter((member) => member.userId !== actor.id);
  if (recipients.length === 0) {
    throw new IssueActionError(
      "Choose at least one teammate in this workspace to share with",
      400,
    );
  }

  const message = input.message?.trim();
  await notifyRecipients(
    recipients.map((member) => member.userId),
    {
      type: "ISSUE_SHARED",
      title: `${actor.name} shared ${issue.id} with you`,
      body: message ? `${issue.title} — “${message}”` : issue.title,
      organizationId: actor.organizationId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor.id,
    },
  );

  return {
    issueId: issue.id,
    sharedWith: recipients.map((member) => ({
      userId: member.userId,
      name: member.user.name,
    })),
  };
}
