"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileArchive, FileText, Paperclip, Search } from "lucide-react";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { formatBytes } from "../../../components/issue/issueDetailLogic";
import { formatDay, useProjectResource } from "../settings/adminUi";
import {
  FILE_KIND_LABELS,
  fileKind,
  filterAttachments,
  type FileKind,
  type ProjectAttachment,
} from "./attachmentsView";

function FileIcon({ attachment }: { attachment: ProjectAttachment }) {
  const kind = fileKind(attachment.mimeType);
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own API
    return <img className="attachments-thumb" src={attachment.url} alt="" loading="lazy" />;
  }
  const Icon = kind === "document" ? FileText : FileArchive;
  return (
    <span className="attachments-thumb attachments-thumb-icon" aria-hidden="true">
      <Icon size={16} />
    </span>
  );
}

/** Every file attached to the project's work items, in one place. */
export default function ProjectAttachmentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { items, isLoading, error } = useProjectResource<ProjectAttachment>(
    projectId,
    "attachments",
  );
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FileKind | "">("");
  const visible = useMemo(() => filterAttachments(items, query, kind), [items, query, kind]);
  const totalSize = visible.reduce((sum, attachment) => sum + attachment.size, 0);

  return (
    <div className="page attachments-page">
      <h1 className="sr-only">Attachments</h1>
      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search attachments</span>
          <input
            type="search"
            placeholder="Search files or work items"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-tabs" role="group" aria-label="File type">
          {(["", "image", "document", "other"] as const).map((value) => (
            <button
              key={value || "all"}
              type="button"
              className={kind === value ? "active" : undefined}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {value ? FILE_KIND_LABELS[value] : "All files"}
            </button>
          ))}
        </div>
        <div className="jira-toolbar-spacer" />
        {!isLoading && items.length > 0 && (
          <span className="search-result-count">
            {visible.length} {visible.length === 1 ? "file" : "files"} · {formatBytes(totalSize)}
          </span>
        )}
      </div>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <WorkspaceLoading label="attachments" />
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <Paperclip size={24} aria-hidden="true" />
          <h2>{items.length === 0 ? "No attachments yet" : "No matching files"}</h2>
          <p>Files attached to this project&apos;s work items show up here.</p>
        </div>
      ) : (
        <div className="pa-table-wrap panel">
          <table className="pa-table attachments-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Work item</th>
                <th>Size</th>
                <th>Added by</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((attachment) => (
                <tr key={attachment.id}>
                  <td>
                    <a
                      className="attachments-file"
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={attachment.name}
                    >
                      <FileIcon attachment={attachment} />
                      <span>{attachment.name}</span>
                    </a>
                  </td>
                  <td>
                    <Link className="pa-link" href={`/issues/${encodeURIComponent(attachment.issueId)}`}>
                      <span className="pa-key">{attachment.issueId}</span>{" "}
                      <span className="attachments-issue-title">{attachment.issueTitle}</span>
                    </Link>
                  </td>
                  <td className="pa-muted">{formatBytes(attachment.size)}</td>
                  <td>{attachment.author ?? <span className="pa-muted">—</span>}</td>
                  <td className="pa-muted">{formatDay(attachment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
