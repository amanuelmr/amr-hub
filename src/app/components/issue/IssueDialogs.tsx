"use client";

import { FormEvent, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CircleAlert,
  Copy,
  Flag,
  FolderInput,
  Link2,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import type { Issue } from "../../data/issues";
import { cloneTitleFor } from "./issueDetailLogic";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";
import { isEpicLevel, isSubtaskLevel } from "../../data/workflow";

export function IssueDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="issue-dialog-overlay" />
        <Dialog.Content className="save-view-dialog issue-dialog">
          <header>
            <div>
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              {description ? (
                <Dialog.Description asChild>
                  <p>{description}</p>
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-submit-error" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {message}
    </p>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type DialogKind = "clone" | "move" | "delete" | null;

export function IssueMoreMenu({
  issue,
  canEdit,
  canDelete,
  controller,
  onNavigate,
  onDeleted,
}: {
  issue: Issue;
  canEdit: boolean;
  canDelete: boolean;
  controller: IssueDetailController;
  onNavigate: (id: string) => void;
  onDeleted: () => void;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="icon-button issue-more-button"
            type="button"
            aria-label="More actions"
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="issue-menu"
            align="end"
            sideOffset={6}
            collisionPadding={12}
          >
            {canEdit && (
              <>
                <DropdownMenu.Item
                  className="issue-menu-item"
                  onSelect={() =>
                    void controller.patch({ flagged: !issue.flagged })
                  }
                >
                  <Flag size={14} aria-hidden="true" />
                  {issue.flagged ? "Remove flag" : "Add flag"}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="issue-menu-item"
                  onSelect={() => setDialog("clone")}
                >
                  <Copy size={14} aria-hidden="true" />
                  Clone
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="issue-menu-item"
                  onSelect={() => setDialog("move")}
                >
                  <FolderInput size={14} aria-hidden="true" />
                  Move to another project
                </DropdownMenu.Item>
              </>
            )}
            <DropdownMenu.Item
              className="issue-menu-item"
              onSelect={() =>
                void navigator.clipboard
                  ?.writeText(
                    `${window.location.origin}/issues/${encodeURIComponent(issue.id)}`,
                  )
                  .catch(() => {})
              }
            >
              <Link2 size={14} aria-hidden="true" />
              Copy link
            </DropdownMenu.Item>
            {canDelete && (
              <>
                <DropdownMenu.Separator className="issue-menu-separator" />
                <DropdownMenu.Item
                  className="issue-menu-item is-danger"
                  onSelect={() => setDialog("delete")}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {dialog === "clone" && (
        <CloneDialog
          issue={issue}
          onClose={() => setDialog(null)}
          onCloned={(clone) => {
            controller.applyIssue(clone);
            onNavigate(clone.id);
          }}
        />
      )}
      {dialog === "move" && (
        <MoveDialog
          issue={issue}
          onClose={() => setDialog(null)}
          onMoved={(moved) => {
            controller.applyIssue(moved);
            onNavigate(moved.id);
          }}
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog
          issue={issue}
          onClose={() => setDialog(null)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

function CloneDialog({
  issue,
  onClose,
  onCloned,
}: {
  issue: Issue;
  onClose: () => void;
  onCloned: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState(cloneTitleFor(issue.title));
  const [includeChildren, setIncludeChildren] = useState(false);
  const [includeLinks, setIncludeLinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim().length < 4) {
      setError("Use at least 4 characters for the title.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const clone = await apiRequest<Issue>(issueUrl(issue.id, "/clone"), {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          includeChildren,
          includeLinks,
        }),
      });
      onClose();
      onCloned(clone);
    } catch (requestError) {
      setError(errorMessage(requestError, "Issue could not be cloned"));
      setIsSaving(false);
    }
  };

  return (
    <IssueDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Clone ${issue.id}`}
      description="Creates a copy linked back to this issue."
    >
      <form className="issue-dialog-form" onSubmit={submit}>
        <label className="form-field">
          <span>Summary</span>
          <input
            value={title}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {issue.childCount > 0 && (
          <label className="issue-checkbox">
            <input
              type="checkbox"
              checked={includeChildren}
              onChange={(event) => setIncludeChildren(event.target.checked)}
            />
            Include {isEpicLevel(issue.kind) ? "child issues" : "subtasks"} (
            {issue.childCount})
          </label>
        )}
        {(issue.links?.length ?? 0) > 0 && (
          <label className="issue-checkbox">
            <input
              type="checkbox"
              checked={includeLinks}
              onChange={(event) => setIncludeLinks(event.target.checked)}
            />
            Include issue links ({issue.links?.length})
          </label>
        )}
        <DialogError message={error} />
        <div className="issue-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Cloning..." : "Clone"}
          </button>
        </div>
      </form>
    </IssueDialog>
  );
}

function MoveDialog({
  issue,
  onClose,
  onMoved,
}: {
  issue: Issue;
  onClose: () => void;
  onMoved: (issue: Issue) => void;
}) {
  const { projects } = useProjects();
  const targets = projects.filter((project) => project.id !== issue.projectId);
  const [projectId, setProjectId] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) return;
    setIsSaving(true);
    setError(null);
    try {
      const moved = await apiRequest<Issue>(issueUrl(issue.id, "/move"), {
        method: "POST",
        body: JSON.stringify({ projectId }),
      });
      onClose();
      onMoved(moved);
    } catch (requestError) {
      setError(errorMessage(requestError, "Issue could not be moved"));
      setIsSaving(false);
    }
  };

  return (
    <IssueDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Move ${issue.id}`}
      description="The issue gets a new key. Sprint, fix version and components are cleared; subtasks move with it."
    >
      <form className="issue-dialog-form" onSubmit={submit}>
        {isSubtaskLevel(issue.kind) ? (
          <p className="field-meta">
            Subtasks move with their parent. Move {issue.parent?.id ?? "the parent"}{" "}
            instead.
          </p>
        ) : targets.length === 0 ? (
          <p className="field-meta">There is no other project to move to.</p>
        ) : (
          <label className="form-field">
            <span>Target project</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              {targets.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.key})
                </option>
              ))}
            </select>
          </label>
        )}
        <DialogError message={error} />
        <div className="issue-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={
              isSaving || !projectId || isSubtaskLevel(issue.kind)
            }
          >
            {isSaving ? "Moving..." : "Move"}
          </button>
        </div>
      </form>
    </IssueDialog>
  );
}

function DeleteDialog({
  issue,
  onClose,
  onDeleted,
}: {
  issue: Issue;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await apiRequest<void>(issueUrl(issue.id), { method: "DELETE" });
      onClose();
      onDeleted();
    } catch (requestError) {
      setError(errorMessage(requestError, "Issue could not be deleted"));
      setIsDeleting(false);
    }
  };

  return (
    <IssueDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${issue.id}?`}
      description="This permanently removes the issue with its comments, work logs and attachments. Child issues are kept without a parent."
    >
      <DialogError message={error} />
      <div className="issue-dialog-actions">
        <button className="secondary-button" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="danger-button"
          type="button"
          disabled={isDeleting}
          onClick={() => void confirm()}
        >
          <Trash2 size={15} aria-hidden="true" />
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </IssueDialog>
  );
}
