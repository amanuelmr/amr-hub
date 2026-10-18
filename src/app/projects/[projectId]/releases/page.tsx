"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangle,
  MoreHorizontal,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { apiRequest, useIssues } from "../../../IssueProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import {
  AdminDialog,
  errorMessage,
  formatDay,
  toDateInput,
  useProjectResource,
  useProjectPermissions, useWorkspaceRole,
} from "../settings/adminUi";
import {
  isVersionOverdue,
  VERSION_STATUS_LABELS,
  type ProjectVersion,
  type VersionStatus,
} from "./releaseNotes";
import { VersionProgressBar, VersionStatusBadge } from "./versionUi";

type DialogState =
  | { type: "create" }
  | { type: "edit"; version: ProjectVersion }
  | { type: "release"; version: ProjectVersion }
  | { type: "delete"; version: ProjectVersion }
  | null;

type StatusFilter = "ALL" | VersionStatus;

function VersionForm({
  version,
  onSubmit,
  onCancel,
}: {
  version?: ProjectVersion;
  onSubmit: (values: {
    name: string;
    description: string | null;
    startDate: string | null;
    releaseDate: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(version?.name ?? "");
  const [description, setDescription] = useState(version?.description ?? "");
  const [startDate, setStartDate] = useState(toDateInput(version?.startDate));
  const [releaseDate, setReleaseDate] = useState(
    toDateInput(version?.releaseDate),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the version a name.");
      return;
    }
    if (startDate && releaseDate && startDate > releaseDate) {
      setError("The start date must be before the release date.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        startDate: startDate || null,
        releaseDate: releaseDate || null,
      });
    } catch (submitError) {
      setError(errorMessage(submitError, "Version could not be saved"));
      setIsSaving(false);
    }
  };

  return (
    <form className="pa-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="e.g. v2.4"
          autoFocus
        />
      </label>
      <div className="pa-form-row">
        <label className="form-field">
          <span>Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Release date</span>
          <input
            type="date"
            value={releaseDate}
            onChange={(event) => setReleaseDate(event.target.value)}
          />
        </label>
      </div>
      <label className="form-field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={500}
        />
      </label>
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <div className="pa-dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : version ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}

function MoveIssuesDialogBody({
  version,
  versions,
  mode,
  unresolvedCount,
  onConfirm,
  onCancel,
}: {
  version: ProjectVersion;
  versions: ProjectVersion[];
  mode: "release" | "delete";
  unresolvedCount: number;
  onConfirm: (moveTo: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const targets = versions.filter(
    (candidate) =>
      candidate.id !== version.id && candidate.status === "UNRELEASED",
  );
  const affected = mode === "release" ? unresolvedCount : version.issueCount;
  const [choice, setChoice] = useState<"move" | "ignore">(
    affected > 0 && targets.length > 0 ? "move" : "ignore",
  );
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const confirm = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onConfirm(choice === "move" && target ? target : null);
    } catch (confirmError) {
      setError(errorMessage(confirmError, "The change could not be saved"));
      setIsSaving(false);
    }
  };

  return (
    <div className="pa-form">
      {affected === 0 ? (
        <p className="pa-muted">
          {mode === "release"
            ? "All issues in this version are done."
            : "No issues use this version."}
        </p>
      ) : (
        <fieldset className="pa-choice">
          <legend>
            {mode === "release"
              ? `This version has ${affected} unresolved issue${affected === 1 ? "" : "s"}.`
              : `${affected} issue${affected === 1 ? "" : "s"} use this version.`}
          </legend>
          <label>
            <input
              type="radio"
              name="move-choice"
              checked={choice === "move"}
              disabled={targets.length === 0}
              onChange={() => setChoice("move")}
            />
            Move them to
            <select
              value={target}
              disabled={choice !== "move" || targets.length === 0}
              onChange={(event) => setTarget(event.target.value)}
            >
              {targets.length === 0 && (
                <option value="">No other versions</option>
              )}
              {targets.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="radio"
              name="move-choice"
              checked={choice === "ignore"}
              onChange={() => setChoice("ignore")}
            />
            {mode === "release"
              ? "Ignore and release anyway"
              : "Remove the fix version from these issues"}
          </label>
        </fieldset>
      )}
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <div className="pa-dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={mode === "delete" ? "danger-button" : "primary-button"}
          type="button"
          disabled={isSaving}
          onClick={confirm}
        >
          {mode === "release" ? "Release" : "Delete"}
        </button>
      </div>
    </div>
  );
}

export default function ProjectReleasesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { isViewer: isWorkspaceViewer } = useWorkspaceRole();
  const projectPermissions = useProjectPermissions(projectId);
  const isViewer = isWorkspaceViewer || !projectPermissions.canEdit;
  const { refreshIssues } = useIssues();
  const {
    items: versions,
    setItems,
    isLoading,
    error,
    reload,
  } = useProjectResource<ProjectVersion>(projectId, "versions");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const base = `/api/projects/${encodeURIComponent(projectId)}/versions`;

  const visible = useMemo(
    () =>
      versions.filter(
        (version) =>
          (filter === "ALL"
            ? version.status !== "ARCHIVED"
            : version.status === filter) &&
          version.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [versions, filter, query],
  );

  const upsert = (version: ProjectVersion) =>
    setItems((current) =>
      current.some((existing) => existing.id === version.id)
        ? current.map((existing) =>
            existing.id === version.id ? version : existing,
          )
        : [...current, version],
    );

  const patchStatus = async (
    version: ProjectVersion,
    status: VersionStatus,
  ) => {
    setActionError(null);
    try {
      upsert(
        await apiRequest<ProjectVersion>(`${base}/${version.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      );
    } catch (patchError) {
      setActionError(errorMessage(patchError, "Version could not be updated"));
    }
  };

  const closeDialog = () => setDialog(null);

  return (
    <div className="page releases-page">
      <h1 className="sr-only">Releases</h1>
      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search versions</span>
          <input
            type="search"
            placeholder="Search versions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-tabs" role="group" aria-label="Version status">
          {(
            ["ALL", "UNRELEASED", "RELEASED", "ARCHIVED"] as StatusFilter[]
          ).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : undefined}
              onClick={() => setFilter(value)}
            >
              {value === "ALL" ? "Active" : VERSION_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="jira-toolbar-spacer" />
        {!isViewer && (
          <button
            className="primary-button pa-toolbar-primary"
            type="button"
            onClick={() => setDialog({ type: "create" })}
          >
            <Plus size={16} aria-hidden="true" />
            Create version
          </button>
        )}
      </div>

      {(error || actionError) && (
        <p className="form-submit-error" role="alert">
          {error ?? actionError}
        </p>
      )}

      {isLoading ? (
        <WorkspaceLoading label="versions" />
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <Package size={24} aria-hidden="true" />
          <h2>
            {versions.length === 0 ? "No versions yet" : "No matching versions"}
          </h2>
          <p>Versions group the work you plan to ship together.</p>
        </div>
      ) : (
        <div className="pa-table-wrap panel">
          <table className="pa-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Start date</th>
                <th>Release date</th>
                <th>Description</th>
                {!isViewer && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((version) => {
                const overdue = isVersionOverdue(version);
                return (
                  <tr key={version.id}>
                    <td>
                      <Link
                        className="pa-link"
                        href={`/projects/${projectId}/releases/${version.id}`}
                      >
                        {version.name}
                      </Link>
                    </td>
                    <td>
                      <VersionStatusBadge status={version.status} />
                    </td>
                    <td className="pa-progress-cell">
                      <VersionProgressBar version={version} />
                      <span className="pa-muted">
                        {version.doneCount}/{version.issueCount}
                      </span>
                    </td>
                    <td>{formatDay(version.startDate)}</td>
                    <td>
                      <span className={overdue ? "pa-overdue" : undefined}>
                        {overdue && (
                          <AlertTriangle size={13} aria-label="Overdue" />
                        )}
                        {formatDay(version.releaseDate)}
                      </span>
                    </td>
                    <td className="pa-description-cell">
                      {version.description ?? ""}
                    </td>
                    {!isViewer && (
                      <td className="pa-actions-cell">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger
                            className="icon-button"
                            aria-label={`Actions for ${version.name}`}
                          >
                            <MoreHorizontal size={16} aria-hidden="true" />
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className="pa-menu"
                              align="end"
                              sideOffset={4}
                            >
                              <DropdownMenu.Item
                                className="pa-menu-item"
                                onSelect={() =>
                                  setDialog({ type: "edit", version })
                                }
                              >
                                Edit
                              </DropdownMenu.Item>
                              {version.status === "UNRELEASED" && (
                                <DropdownMenu.Item
                                  className="pa-menu-item"
                                  onSelect={() =>
                                    setDialog({ type: "release", version })
                                  }
                                >
                                  Release
                                </DropdownMenu.Item>
                              )}
                              {version.status === "RELEASED" && (
                                <DropdownMenu.Item
                                  className="pa-menu-item"
                                  onSelect={() =>
                                    patchStatus(version, "UNRELEASED")
                                  }
                                >
                                  Unrelease
                                </DropdownMenu.Item>
                              )}
                              {version.status === "ARCHIVED" ? (
                                <DropdownMenu.Item
                                  className="pa-menu-item"
                                  onSelect={() =>
                                    patchStatus(
                                      version,
                                      version.releasedAt
                                        ? "RELEASED"
                                        : "UNRELEASED",
                                    )
                                  }
                                >
                                  Unarchive
                                </DropdownMenu.Item>
                              ) : (
                                <DropdownMenu.Item
                                  className="pa-menu-item"
                                  onSelect={() =>
                                    patchStatus(version, "ARCHIVED")
                                  }
                                >
                                  Archive
                                </DropdownMenu.Item>
                              )}
                              <DropdownMenu.Separator className="pa-menu-separator" />
                              <DropdownMenu.Item
                                className="pa-menu-item pa-menu-danger"
                                onSelect={() =>
                                  setDialog({ type: "delete", version })
                                }
                              >
                                Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminDialog
        open={dialog?.type === "create" || dialog?.type === "edit"}
        onOpenChange={(open) => !open && closeDialog()}
        title={dialog?.type === "edit" ? "Edit version" : "Create version"}
      >
        {(dialog?.type === "create" || dialog?.type === "edit") && (
          <VersionForm
            key={dialog.type === "edit" ? dialog.version.id : "new"}
            version={dialog.type === "edit" ? dialog.version : undefined}
            onCancel={closeDialog}
            onSubmit={async (values) => {
              const saved = await apiRequest<ProjectVersion>(
                dialog.type === "edit" ? `${base}/${dialog.version.id}` : base,
                {
                  method: dialog.type === "edit" ? "PATCH" : "POST",
                  body: JSON.stringify(values),
                },
              );
              upsert(saved);
              closeDialog();
            }}
          />
        )}
      </AdminDialog>

      <AdminDialog
        open={dialog?.type === "release" || dialog?.type === "delete"}
        onOpenChange={(open) => !open && closeDialog()}
        title={
          dialog?.type === "release"
            ? `Release ${dialog.version.name}`
            : dialog?.type === "delete"
              ? `Delete ${dialog.version.name}`
              : ""
        }
      >
        {(dialog?.type === "release" || dialog?.type === "delete") && (
          <MoveIssuesDialogBody
            key={dialog.version.id}
            version={dialog.version}
            versions={versions}
            mode={dialog.type}
            unresolvedCount={
              dialog.version.issueCount - dialog.version.doneCount
            }
            onCancel={closeDialog}
            onConfirm={async (moveTo) => {
              if (dialog.type === "release") {
                await apiRequest<ProjectVersion>(
                  `${base}/${dialog.version.id}/release`,
                  {
                    method: "POST",
                    body: JSON.stringify({ moveUnresolvedTo: moveTo }),
                  },
                );
              } else {
                await apiRequest(
                  `${base}/${dialog.version.id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ""}`,
                  { method: "DELETE" },
                );
              }
              closeDialog();
              await Promise.all([reload(), refreshIssues()]);
            }}
          />
        )}
      </AdminDialog>
    </div>
  );
}
