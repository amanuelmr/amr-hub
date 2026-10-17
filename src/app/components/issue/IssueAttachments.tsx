"use client";

import { useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import type { Issue } from "../../data/issues";
import { formatBytes } from "./issueDetailLogic";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";
import type { AttachmentSummary } from "./types";

const MAX_BYTES = 10 * 1024 * 1024;
const INLINE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
];

/** Upload handler shared by the Attach button and drop-anywhere on the view. */
export function useAttachmentUpload(
  issue: Issue,
  controller: IssueDetailController,
) {
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (fileList: FileList | File[]) => {
    const files = [...fileList];
    if (files.length === 0) return;
    const tooLarge = files.find((file) => file.size > MAX_BYTES);
    if (tooLarge) {
      controller.setActionError(`${tooLarge.name} is larger than 10 MB`);
      return;
    }
    if (files.length > 10) {
      controller.setActionError("Attach up to 10 files at a time");
      return;
    }
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    setIsUploading(true);
    await controller.run(async () => {
      const response = await fetch(issueUrl(issue.id, "/attachments"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        issue?: Issue;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Attachments could not be uploaded");
      }
      controller.applyIssue(payload.issue);
      await controller.refreshAttachments();
    });
    setIsUploading(false);
  };

  return { upload, isUploading };
}

/** Jira only shows the Attachments section once something is attached. */
export function IssueAttachments({
  attachments,
  readOnly,
  currentUserId,
  isOwner,
  onAttach,
  controller,
}: {
  attachments: AttachmentSummary[];
  readOnly: boolean;
  currentUserId: string | null;
  isOwner: boolean;
  onAttach: () => void;
  controller: IssueDetailController;
}) {
  const remove = async (attachment: AttachmentSummary) => {
    if (!window.confirm(`Delete ${attachment.name}?`)) return;
    const updated = await controller.run(() =>
      apiRequest<Issue>(attachment.url, { method: "DELETE" }),
    );
    if (updated) {
      controller.applyIssue(updated);
      await controller.refreshAttachments();
    }
  };

  if (attachments.length === 0) return null;

  return (
    <section className="issue-section issue-attachments" id="issue-attachments">
      <div className="issue-section-header">
        <h2>
          Attachments <span className="issue-count">{attachments.length}</span>
        </h2>
        {!readOnly && (
          <button
            className="icon-button"
            type="button"
            aria-label="Add attachment"
            title="Add attachment"
            onClick={onAttach}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="issue-attachment-grid">
        {attachments.map((attachment) => {
          const isImage = INLINE_TYPES.includes(attachment.mimeType);
          const canDelete =
            !readOnly && (isOwner || attachment.userId === currentUserId);
          return (
            <li className="issue-attachment" key={attachment.id}>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="issue-attachment-preview"
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    loading="lazy"
                  />
                ) : (
                  <FileText size={26} aria-hidden="true" />
                )}
              </a>
              <div className="issue-attachment-meta">
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  {attachment.name}
                </a>
                <span>
                  {formatBytes(attachment.size)}
                  {attachment.author ? ` · ${attachment.author}` : ""}
                </span>
              </div>
              {canDelete && (
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label={`Delete ${attachment.name}`}
                  onClick={() => void remove(attachment)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
