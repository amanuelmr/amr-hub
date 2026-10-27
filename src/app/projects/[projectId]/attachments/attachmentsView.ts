export type FileKind = "image" | "document" | "other";

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  image: "Images",
  document: "Documents",
  other: "Other files",
};

const DOCUMENT_TYPES = [
  "application/pdf",
  "text/",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-",
  "application/vnd.oasis.opendocument",
  "application/rtf",
  "application/json",
];

/** Groups a file by MIME type for the attachments filter. */
export function fileKind(mimeType: string): FileKind {
  const type = mimeType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (DOCUMENT_TYPES.some((prefix) => type.startsWith(prefix))) return "document";
  return "other";
}

export type ProjectAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  author: string | null;
  createdAt: string;
  url: string;
  issueId: string;
  issueTitle: string;
};

/** Files matching a search (file name, work item key or summary) and kind. */
export function filterAttachments(
  attachments: ProjectAttachment[],
  query: string,
  kind: FileKind | "",
) {
  const needle = query.trim().toLowerCase();
  return attachments.filter(
    (attachment) =>
      (!kind || fileKind(attachment.mimeType) === kind) &&
      (!needle ||
        `${attachment.name} ${attachment.issueId} ${attachment.issueTitle}`
          .toLowerCase()
          .includes(needle)),
  );
}
