"use client";

import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Flag, FlagOff, LoaderCircle, Trash2, X } from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import {
  ISSUE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Issue,
  type IssuePriority,
} from "../../data/issues";

type BulkResult = {
  id: string;
  ok: boolean;
  error?: string;
  issue?: Issue;
  deleted?: boolean;
};

type Version = { id: string; name: string; status: string };

type BulkBarProps = {
  selected: Issue[];
  isOwner: boolean;
  currentMemberId: string | null;
  onClear: () => void;
  onDeleted?: (ids: string[]) => void;
};

function Menu({
  label,
  disabled,
  onOpen,
  children,
}: {
  label: string;
  disabled?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Root onOpenChange={(open) => open && onOpen?.()}>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button className="secondary-button" type="button">
          {label}
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="search-menu" sideOffset={6} align="start">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <DropdownMenu.Item className="search-menu-item" onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}

export function BulkBar({ selected, isOwner, currentMemberId, onClear, onDeleted }: BulkBarProps) {
  const { members, labels, cycles, replaceIssue, removeIssue } = useIssues();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const projectIds = useMemo(
    () => [...new Set(selected.map((issue) => issue.projectId))],
    [selected],
  );
  const sprintOptions = cycles.filter(
    (cycle) => projectIds.includes(cycle.projectId) && cycle.state !== "CLOSED",
  );

  const loadVersions = async () => {
    const lists = await Promise.all(
      projectIds.map((id) =>
        apiRequest<Version[]>(`/api/projects/${encodeURIComponent(id)}/versions`).catch(
          () => [] as Version[],
        ),
      ),
    );
    setVersions(lists.flat().filter((version) => version.status !== "ARCHIVED"));
  };

  const run = async (operation: string, value?: unknown, verb = "Updated") => {
    setIsRunning(true);
    setMessage(null);
    try {
      const response = await apiRequest<{ results: BulkResult[] }>("/api/issues/bulk", {
        method: "POST",
        body: JSON.stringify({
          issueIds: selected.map((issue) => issue.id),
          operation,
          ...(value === undefined ? {} : { value }),
        }),
      });
      const deletedIds: string[] = [];
      for (const result of response.results) {
        if (result.issue) replaceIssue(result.issue);
        if (result.deleted) {
          removeIssue(result.id);
          deletedIds.push(result.id);
        }
      }
      if (deletedIds.length) onDeleted?.(deletedIds);
      const failures = response.results.filter((result) => !result.ok);
      const succeeded = response.results.length - failures.length;
      setMessage(
        failures.length
          ? {
              tone: "error",
              text: `${verb} ${succeeded}, failed ${failures.length}: ${failures
                .slice(0, 3)
                .map((failure) => `${failure.id} (${failure.error ?? "error"})`)
                .join(", ")}${failures.length > 3 ? "…" : ""}`,
            }
          : { tone: "ok", text: `${verb} ${succeeded} issue${succeeded === 1 ? "" : "s"}` },
      );
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Bulk change failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (selected.length === 0 && !message) return null;

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk change">
      <div className="bulk-bar-count">
        <strong>{selected.length}</strong> selected
        <button className="icon-button" type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="bulk-bar-actions">
        <Menu label="Transition" disabled={isRunning || !selected.length}>
          {ISSUE_STATUSES.map((status) => (
            <Item key={status} onSelect={() => void run("transition", status)}>
              {STATUS_LABELS[status]}
            </Item>
          ))}
        </Menu>
        <Menu label="Assign" disabled={isRunning || !selected.length}>
          {currentMemberId && (
            <Item onSelect={() => void run("assign", currentMemberId)}>Assign to me</Item>
          )}
          <Item onSelect={() => void run("assign", null)}>Unassigned</Item>
          <DropdownMenu.Separator className="search-menu-separator" />
          {members.map((member) => (
            <Item key={member.id} onSelect={() => void run("assign", member.id)}>
              {member.name}
            </Item>
          ))}
        </Menu>
        <Menu label="Priority" disabled={isRunning || !selected.length}>
          {(Object.keys(PRIORITY_LABELS) as IssuePriority[]).map((priority) => (
            <Item key={priority} onSelect={() => void run("priority", priority)}>
              {PRIORITY_LABELS[priority]}
            </Item>
          ))}
        </Menu>
        <Menu label="Labels" disabled={isRunning || !selected.length}>
          <DropdownMenu.Label className="search-menu-label">Add</DropdownMenu.Label>
          {labels.map((label) => (
            <Item key={`add-${label.id}`} onSelect={() => void run("addLabels", [label.id])}>
              + {label.name}
            </Item>
          ))}
          <DropdownMenu.Separator className="search-menu-separator" />
          <DropdownMenu.Label className="search-menu-label">Remove</DropdownMenu.Label>
          {labels.map((label) => (
            <Item key={`remove-${label.id}`} onSelect={() => void run("removeLabels", [label.id])}>
              − {label.name}
            </Item>
          ))}
        </Menu>
        <Menu label="Sprint" disabled={isRunning || !selected.length}>
          <Item onSelect={() => void run("sprint", null)}>Move to backlog</Item>
          {sprintOptions.length > 0 && <DropdownMenu.Separator className="search-menu-separator" />}
          {sprintOptions.map((cycle) => (
            <Item key={cycle.id} onSelect={() => void run("sprint", cycle.id)}>
              {cycle.name}
              {cycle.state === "ACTIVE" ? " (active)" : ""}
            </Item>
          ))}
        </Menu>
        <Menu
          label="Fix version"
          disabled={isRunning || !selected.length}
          onOpen={() => void loadVersions()}
        >
          <Item onSelect={() => void run("fixVersion", null)}>None</Item>
          {versions === null ? (
            <DropdownMenu.Label className="search-menu-label">Loading…</DropdownMenu.Label>
          ) : (
            versions.map((version) => (
              <Item key={version.id} onSelect={() => void run("fixVersion", version.id)}>
                {version.name}
              </Item>
            ))
          )}
        </Menu>
        <button className="secondary-button" type="button" disabled={isRunning || !selected.length} onClick={() => void run("flag", true, "Flagged")}>
          <Flag size={14} aria-hidden="true" />
          Flag
        </button>
        <button className="secondary-button" type="button" disabled={isRunning || !selected.length} onClick={() => void run("flag", false, "Unflagged")}>
          <FlagOff size={14} aria-hidden="true" />
          Unflag
        </button>
        {isOwner && (
          <Dialog.Root open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <Dialog.Trigger asChild>
              <button className="danger-button" type="button" disabled={isRunning || !selected.length}>
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-backdrop" />
              <Dialog.Content className="save-view-dialog search-dialog">
                <Dialog.Title asChild>
                  <h2>Delete {selected.length} issue{selected.length === 1 ? "" : "s"}?</h2>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p className="search-muted">
                    This permanently deletes the issues with their comments, history and
                    attachments. Subtasks are kept and lose their parent.
                  </p>
                </Dialog.Description>
                <footer>
                  <Dialog.Close asChild>
                    <button className="secondary-button" type="button">Cancel</button>
                  </Dialog.Close>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => {
                      setIsConfirmOpen(false);
                      void run("delete", undefined, "Deleted");
                    }}
                  >
                    Delete permanently
                  </button>
                </footer>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
        {isRunning && <LoaderCircle className="spinning-icon" size={16} aria-label="Applying" />}
      </div>
      {message && (
        <p className={message.tone === "error" ? "bulk-bar-message form-submit-error" : "bulk-bar-message"} role="status">
          {message.text}
          <button className="text-button" type="button" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
