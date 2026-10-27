import prisma from "../../prisma/client";
import {
  assertIssuePermission,
  visibleIssueWhere,
  type AccessUser,
} from "./projectAccess";
import { notifyRecipients } from "./notifications";
import { getIssue, type WorkspaceActor, actorAccessUser } from "./issues";
import { IssueActionError } from "./issueRelations";
import type { AttachmentSummary } from "../app/components/issue/types";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_UPLOAD = 10;

/** Raster image types that are safe to render inline. SVG is excluded. */
const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

export function normalizeMimeType(value: string | null | undefined) {
  const type = (value ?? "").trim().toLowerCase().split(";")[0];
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)
    ? type
    : "application/octet-stream";
}

export function isInlineImage(mimeType: string) {
  return INLINE_IMAGE_TYPES.has(normalizeMimeType(mimeType));
}

export function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return cleaned.slice(0, 200) || "attachment";
}

export function contentDisposition(name: string, mimeType: string) {
  const fileName = sanitizeFileName(name);
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/[\\%]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const disposition = isInlineImage(mimeType) ? "inline" : "attachment";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function validateUploads(files: { name: string; size: number }[]) {
  if (files.length === 0) return "Choose at least one file to attach";
  if (files.length > MAX_ATTACHMENTS_PER_UPLOAD) {
    return `Attach up to ${MAX_ATTACHMENTS_PER_UPLOAD} files at a time`;
  }
  const tooLarge = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
  if (tooLarge) return `${tooLarge.name} is larger than 10 MB`;
  const empty = files.find((file) => file.size === 0);
  if (empty) return `${empty.name} is empty`;
  return null;
}

export function canDeleteAttachment(
  uploaderId: string | null,
  actorId: string,
  role: string,
) {
  return role === "owner" || (uploaderId !== null && uploaderId === actorId);
}

const attachmentSummarySelect = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  userId: true,
  createdAt: true,
  user: { select: { name: true } },
} as const;

function serializeAttachment(attachment: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  userId: string | null;
  createdAt: Date;
  user: { name: string } | null;
}): AttachmentSummary {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    userId: attachment.userId,
    author: attachment.user?.name ?? null,
    createdAt: attachment.createdAt.toISOString(),
    url: `/api/attachments/${encodeURIComponent(attachment.id)}`,
  };
}

export async function listAttachments(issueId: string, organizationId: string) {
  const exists = await prisma.issue.count({
    where: { id: issueId, organizationId },
  });
  if (!exists) return null;

  const attachments = await prisma.attachment.findMany({
    where: { issueId },
    select: attachmentSummarySelect,
    orderBy: { createdAt: "desc" },
  });
  return attachments.map(serializeAttachment);
}

/** Every file on the project's live work items, newest first (no contents). */
export async function listProjectAttachments(projectId: string, organizationId: string) {
  const exists = await prisma.project.count({
    where: { id: projectId, organizationId, deletedAt: null },
  });
  if (!exists) return null;

  const attachments = await prisma.attachment.findMany({
    where: { issue: { projectId, organizationId, deletedAt: null } },
    select: { ...attachmentSummarySelect, issue: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return attachments.map((attachment) => ({
    ...serializeAttachment(attachment),
    issueId: attachment.issue.id,
    issueTitle: attachment.issue.title,
  }));
}

export async function createAttachments(
  issueId: string,
  files: File[],
  actor: WorkspaceActor,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: actor.organizationId },
    select: {
      id: true,
      title: true,
      projectId: true,
      creatorId: true,
      assignee: { select: { userId: true } },
      watchers: { select: { userId: true } },
    },
  });
  if (!issue) return null;

  const error = validateUploads(files);
  if (error) throw new IssueActionError(error);

  const payloads = await Promise.all(
    files.map(async (file) => ({
      name: sanitizeFileName(file.name),
      mimeType: normalizeMimeType(file.type),
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    })),
  );

  await prisma.$transaction([
    ...payloads.map((payload) =>
      prisma.attachment.create({
        data: { ...payload, issueId, userId: actor.id },
        select: { id: true },
      }),
    ),
    prisma.activity.createMany({
      data: payloads.map((payload) => ({
        issueId,
        type: "ATTACHMENT_ADDED",
        description: `attached ${payload.name}`,
        actor: actor.name,
        actorId: actor.id,
      })),
    }),
  ]);

  const recipients = [
    issue.creatorId,
    issue.assignee?.userId,
    ...issue.watchers.map((watcher) => watcher.userId),
  ];
  await notifyRecipients(recipients, {
    type: "ISSUE_ATTACHMENT_ADDED",
    title: `New attachment on ${issue.id}`,
    body: `${actor.name} attached ${
      payloads.length === 1 ? payloads[0].name : `${payloads.length} files`
    } to ${issue.id}`,
    organizationId: actor.organizationId,
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: actor.id,
  });

  return {
    attachments: (await listAttachments(issueId, actor.organizationId)) ?? [],
    issue: await getIssue(issueId, actor.organizationId, actorAccessUser(actor)),
  };
}

export async function getAttachmentContent(
  attachmentId: string,
  organizationId: string,
  user: AccessUser,
) {
  return prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      issue: visibleIssueWhere(user, organizationId, {
        includeArchived: true,
        includeArchivedProjects: true,
      }),
    },
    select: { name: true, mimeType: true, size: true, data: true },
  });
}

export async function deleteAttachment(
  attachmentId: string,
  actor: WorkspaceActor,
  role: string,
) {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      issue: { organizationId: actor.organizationId },
    },
    select: { id: true, name: true, issueId: true, userId: true },
  });
  const accessUser = actorAccessUser(actor);
  if (attachment && accessUser) {
    await assertIssuePermission(
      attachment.issueId,
      accessUser,
      actor.organizationId,
      "edit",
    );
  }
  if (!attachment) return null;
  if (!canDeleteAttachment(attachment.userId, actor.id, role)) {
    throw new IssueActionError(
      "Only the uploader or a workspace owner can delete this attachment",
      403,
    );
  }

  await prisma.$transaction([
    prisma.attachment.delete({ where: { id: attachment.id } }),
    prisma.activity.create({
      data: {
        issueId: attachment.issueId,
        type: "ATTACHMENT_REMOVED",
        description: `removed the attachment ${attachment.name}`,
        actor: actor.name,
        actorId: actor.id,
      },
    }),
  ]);

  return getIssue(attachment.issueId, actor.organizationId, actorAccessUser(actor));
}
