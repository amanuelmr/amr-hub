"use client";

import { FormEvent, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Flag,
  FlagOff,
  Link2,
  MoreHorizontal,
  MoveRight,
  Plus,
  Scissors,
  Tag,
  Trash2,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { authClient } from "../../../lib/auth-client";
import {
  ISSUE_ESTIMATES,
  type Issue,
  type IssueEstimate,
} from "../../data/issues";
import { isEpicLevel, isSubtaskLevel } from "../../data/workflow";
import { epicColor, initials } from "./boardModel";
import { DialogFooter, FormError, PlanningDialog } from "./SprintDialogs";

export type MoveDestination = { id: string | null; label: string };

export type IssueMenuAction =
  | { type: "top" }
  | { type: "bottom" }
  | { type: "move"; cycleId: string | null }
  | { type: "open" }
  | { type: "flag"; withComment: boolean }
  | { type: "unflag" }
  | { type: "labels"; labelIds: string[] }
  | { type: "parent"; parentId: string | null }
  | { type: "assign"; assigneeId: string | null }
  | { type: "copy-link" }
  | { type: "copy-key" }
  | { type: "split" }
  | { type: "delete" };

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

function SubTrigger({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.SubTrigger className="planning-menu-item">
      {icon}
      {children}
      <ChevronRight size={13} aria-hidden="true" className="planning-menu-end" />
    </DropdownMenu.SubTrigger>
  );
}

function SubContent({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        className="planning-menu planning-filter-menu"
        sideOffset={4}
        onClick={stop}
      >
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  );
}

/** Rendered only while the menu is open, so per-card lists cost nothing. */
function MenuBody({
  issue,
  isViewer,
  canAssignToMe,
  meId,
  scope,
  destinations,
  onAction,
}: {
  issue: Issue;
  isViewer: boolean;
  canAssignToMe: boolean;
  meId: string | null;
  scope: "column" | "list";
  destinations: MoveDestination[];
  onAction: (action: IssueMenuAction) => void;
}) {
  const { issues, labels, members } = useIssues();
  const { data: session } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const canDelete =
    !isViewer &&
    (activeMember?.role === "owner" ||
      (!!issue.creator && issue.creator.id === session?.user.id));
  const epics = issues.filter(
    (candidate) =>
      candidate.projectId === issue.projectId &&
      isEpicLevel(candidate.kind) &&
      candidate.id !== issue.id,
  );
  const labelIds = issue.labels.map((label) => label.id);
  const where = scope === "column" ? " of column" : "";

  return (
    <>
      {!isViewer && (
        <>
          <DropdownMenu.Sub>
            <SubTrigger icon={<MoveRight size={14} aria-hidden="true" />}>
              Move to
            </SubTrigger>
            <SubContent>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction({ type: "top" })}
              >
                <ArrowUpToLine size={14} aria-hidden="true" />
                Top{where}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction({ type: "bottom" })}
              >
                <ArrowDownToLine size={14} aria-hidden="true" />
                Bottom{where}
              </DropdownMenu.Item>
              {destinations.length > 0 && (
                <DropdownMenu.Separator className="planning-menu-separator" />
              )}
              {destinations.map((destination) => (
                <DropdownMenu.Item
                  key={destination.id ?? "backlog"}
                  className="planning-menu-item"
                  onSelect={() =>
                    onAction({ type: "move", cycleId: destination.id })
                  }
                >
                  <MoveRight size={14} aria-hidden="true" />
                  <span className="planning-menu-text">{destination.label}</span>
                </DropdownMenu.Item>
              ))}
            </SubContent>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="planning-menu-separator" />
          {issue.flagged ? (
            <DropdownMenu.Item
              className="planning-menu-item"
              onSelect={() => onAction({ type: "unflag" })}
            >
              <FlagOff size={14} aria-hidden="true" />
              Remove flag
            </DropdownMenu.Item>
          ) : (
            <>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction({ type: "flag", withComment: false })}
              >
                <Flag size={14} aria-hidden="true" />
                Add flag
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction({ type: "flag", withComment: true })}
              >
                <Flag size={14} aria-hidden="true" />
                Add flag and comment
              </DropdownMenu.Item>
            </>
          )}
          <DropdownMenu.Sub>
            <SubTrigger icon={<Tag size={14} aria-hidden="true" />}>
              Add label
            </SubTrigger>
            <SubContent>
              {labels.length === 0 && (
                <p className="planning-menu-empty">No labels in this workspace</p>
              )}
              {labels.map((label) => {
                const checked = labelIds.includes(label.id);
                return (
                  <DropdownMenu.CheckboxItem
                    key={label.id}
                    className="planning-menu-item planning-check-item"
                    checked={checked}
                    disabled={!checked && labelIds.length >= 10}
                    onCheckedChange={() =>
                      onAction({
                        type: "labels",
                        labelIds: checked
                          ? labelIds.filter((id) => id !== label.id)
                          : [...labelIds, label.id],
                      })
                    }
                  >
                    <span className="planning-check-box" aria-hidden="true">
                      <DropdownMenu.ItemIndicator>
                        <Check size={12} />
                      </DropdownMenu.ItemIndicator>
                    </span>
                    <span
                      className="planning-epic-swatch"
                      style={{ background: label.color }}
                      aria-hidden="true"
                    />
                    <span className="planning-menu-text">{label.name}</span>
                  </DropdownMenu.CheckboxItem>
                );
              })}
            </SubContent>
          </DropdownMenu.Sub>
          {!isEpicLevel(issue.kind) && (
            <DropdownMenu.Sub>
              <SubTrigger icon={<Zap size={14} aria-hidden="true" />}>
                {issue.parent ? "Change parent" : "Add parent"}
              </SubTrigger>
              <SubContent>
                {epics.length === 0 && (
                  <p className="planning-menu-empty">No epics in this project</p>
                )}
                <DropdownMenu.RadioGroup
                  value={issue.parentId ?? ""}
                  onValueChange={(value) =>
                    onAction({ type: "parent", parentId: value || null })
                  }
                >
                  {issue.parentId && (
                    <DropdownMenu.RadioItem
                      value=""
                      className="planning-menu-item"
                    >
                      Remove parent
                    </DropdownMenu.RadioItem>
                  )}
                  {epics.map((epic) => (
                    <DropdownMenu.RadioItem
                      key={epic.id}
                      value={epic.id}
                      className="planning-menu-item"
                    >
                      <span
                        className="planning-epic-swatch"
                        style={{ background: epicColor(epic.id) }}
                        aria-hidden="true"
                      />
                      <span className="planning-menu-text">
                        {epic.id} {epic.title}
                      </span>
                      <DropdownMenu.ItemIndicator className="planning-menu-end">
                        <Check size={12} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </SubContent>
            </DropdownMenu.Sub>
          )}
          {canAssignToMe && meId && issue.assignee?.id !== meId && (
            <DropdownMenu.Item
              className="planning-menu-item"
              onSelect={() => onAction({ type: "assign", assigneeId: meId })}
            >
              <UserRound size={14} aria-hidden="true" />
              Assign to me
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Sub>
            <SubTrigger icon={<Users size={14} aria-hidden="true" />}>
              Change assignee
            </SubTrigger>
            <SubContent>
              <DropdownMenu.RadioGroup
                value={issue.assignee?.id ?? ""}
                onValueChange={(value) =>
                  onAction({ type: "assign", assigneeId: value || null })
                }
              >
                <DropdownMenu.RadioItem value="" className="planning-menu-item">
                  <span className="avatar avatar-small" aria-hidden="true">
                    ?
                  </span>
                  Unassigned
                  <DropdownMenu.ItemIndicator className="planning-menu-end">
                    <Check size={12} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
                {members.map((member) => (
                  <DropdownMenu.RadioItem
                    key={member.id}
                    value={member.id}
                    className="planning-menu-item"
                  >
                    <span className="avatar avatar-small" aria-hidden="true">
                      {initials(member.name)}
                    </span>
                    <span className="planning-menu-text">{member.name}</span>
                    <DropdownMenu.ItemIndicator className="planning-menu-end">
                      <Check size={12} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </SubContent>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="planning-menu-separator" />
        </>
      )}
      {!isViewer && !isEpicLevel(issue.kind) && !isSubtaskLevel(issue.kind) && (
        <DropdownMenu.Item
          className="planning-menu-item"
          onSelect={() => onAction({ type: "split" })}
        >
          <Scissors size={14} aria-hidden="true" />
          Split work item
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        className="planning-menu-item"
        onSelect={() => onAction({ type: "open" })}
      >
        <ExternalLink size={14} aria-hidden="true" />
        Open work item
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className="planning-menu-item"
        onSelect={() => onAction({ type: "copy-link" })}
      >
        <Link2 size={14} aria-hidden="true" />
        Copy link
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className="planning-menu-item"
        onSelect={() => onAction({ type: "copy-key" })}
      >
        <Copy size={14} aria-hidden="true" />
        Copy key
      </DropdownMenu.Item>
      {canDelete && (
        <>
          <DropdownMenu.Separator className="planning-menu-separator" />
          <DropdownMenu.Item
            className="planning-menu-item danger"
            onSelect={() => onAction({ type: "delete" })}
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete
          </DropdownMenu.Item>
        </>
      )}
    </>
  );
}

/** Jira's card/row "•••" menu. */
export function IssueActionsMenu(props: {
  issue: Issue;
  isViewer: boolean;
  canAssignToMe: boolean;
  meId: string | null;
  scope: "column" | "list";
  destinations: MoveDestination[];
  onAction: (action: IssueMenuAction) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="board-card-menu-trigger"
          type="button"
          aria-label={`Actions for ${props.issue.id}`}
          onClick={stop}
          onPointerDown={stop}
          onKeyDown={stop}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="planning-menu"
          align="end"
          sideOffset={4}
          onClick={stop}
        >
          <MenuBody {...props} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FlagCommentDialog({
  issue,
  onClose,
  onSubmit,
}: {
  issue: Issue;
  onClose: () => void;
  onSubmit: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(comment.trim());
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The flag could not be added",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add flag"
      description={`Flag ${issue.id} as impeded and tell the team why.`}
    >
      <form onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Comment (optional)</span>
          <textarea
            value={comment}
            rows={4}
            maxLength={900}
            autoFocus
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <FormError error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Add flag"
          isSubmitting={isSubmitting}
        />
      </form>
    </PlanningDialog>
  );
}

function DeleteIssueDialog({
  issue,
  onClose,
  onDelete,
}: {
  issue: Issue;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const subtaskNote =
    issue.childCount > 0
      ? ` Child items that aren't subtasks lose their parent.`
      : "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The work item could not be deleted",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${issue.id}?`}
      description={`${issue.id} moves to the trash with its subtasks. A project admin can restore it for 60 days before it is deleted for good.${subtaskNote}`}
    >
      <form onSubmit={handleSubmit}>
        <FormError error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Delete"
          isSubmitting={isSubmitting}
          danger
        />
      </form>
    </PlanningDialog>
  );
}

type SplitPart = { title: string; estimate: IssueEstimate | null };

function EstimateSelect({
  value,
  onChange,
  label,
}: {
  value: IssueEstimate | null;
  onChange: (value: IssueEstimate | null) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          event.target.value === ""
            ? null
            : (Number(event.target.value) as IssueEstimate),
        )
      }
    >
      <option value="">No estimate</option>
      {ISSUE_ESTIMATES.map((estimate) => (
        <option key={estimate} value={estimate}>
          {estimate} {estimate === 1 ? "point" : "points"}
        </option>
      ))}
    </select>
  );
}

/** Jira's "Split issue": carve new work items out of an oversized one. */
function SplitIssueDialog({
  issue,
  onClose,
  onSplit,
}: {
  issue: Issue;
  onClose: () => void;
  onSplit: (body: {
    originalEstimate: IssueEstimate | null;
    parts: SplitPart[];
    destination: string | null;
  }) => Promise<void>;
}) {
  const { cycles } = useIssues();
  const sprints = cycles.filter(
    (cycle) => cycle.projectId === issue.projectId && cycle.state !== "CLOSED",
  );
  const [originalEstimate, setOriginalEstimate] = useState<IssueEstimate | null>(
    issue.estimate,
  );
  const [parts, setParts] = useState<SplitPart[]>([
    { title: "", estimate: null },
  ]);
  const [destination, setDestination] = useState<string>(
    issue.cycleId ? "SAME" : "BACKLOG",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updatePart = (index: number, change: Partial<SplitPart>) =>
    setParts((current) =>
      current.map((part, position) =>
        position === index ? { ...part, ...change } : part,
      ),
    );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const filled = parts.map((part) => ({ ...part, title: part.title.trim() }));
    if (filled.some((part) => part.title.length < 4)) {
      setError("Give every new work item a summary of at least 4 characters.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSplit({
        originalEstimate,
        parts: filled,
        destination: destination === "BACKLOG" ? null : destination,
      });
      onClose();
    } catch (splitError) {
      setError(
        splitError instanceof Error
          ? splitError.message
          : "The work item could not be split",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Split ${issue.id}`}
      description="New work items copy this one's details and link back to it. Give each its own summary and estimate."
    >
      <form className="split-form" onSubmit={handleSubmit}>
        <div className="split-row split-original">
          <span className="split-key">{issue.id}</span>
          <span className="split-title" title={issue.title}>
            {issue.title}
          </span>
          <EstimateSelect
            label={`Estimate for ${issue.id}`}
            value={originalEstimate}
            onChange={setOriginalEstimate}
          />
        </div>
        {parts.map((part, index) => (
          <div className="split-row" key={index}>
            <span className="split-key">New</span>
            <input
              aria-label={`Summary for new work item ${index + 1}`}
              value={part.title}
              placeholder="What needs to be done?"
              maxLength={255}
              autoFocus={index === parts.length - 1}
              onChange={(event) => updatePart(index, { title: event.target.value })}
            />
            <EstimateSelect
              label={`Estimate for new work item ${index + 1}`}
              value={part.estimate}
              onChange={(estimate) => updatePart(index, { estimate })}
            />
            {parts.length > 1 && (
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove new work item ${index + 1}`}
                onClick={() =>
                  setParts((current) => current.filter((_, position) => position !== index))
                }
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {parts.length < 10 && (
          <button
            className="text-button split-add"
            type="button"
            onClick={() => setParts((current) => [...current, { title: "", estimate: null }])}
          >
            <Plus size={13} aria-hidden="true" />
            Add another work item
          </button>
        )}
        <label className="form-field">
          <span>Put new work items in</span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            {issue.cycleId && <option value="SAME">The same sprint</option>}
            <option value="BACKLOG">The backlog</option>
            {sprints
              .filter((sprint) => sprint.id !== issue.cycleId)
              .map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
          </select>
        </label>
        <FormError error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Split"
          isSubmitting={isSubmitting}
        />
      </form>
    </PlanningDialog>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the menu actions that don't depend on the page layout (flag,
 * labels, parent, assignee, copy, delete). Pages handle moves themselves.
 */
export function useIssueMenuActions({
  onError,
  onNotice,
}: {
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
}) {
  const { updateIssue, addComment, removeIssue, refreshIssues, replaceIssue } =
    useIssues();
  const [dialog, setDialog] = useState<
    { type: "flag" | "delete" | "split"; issue: Issue } | null
  >(null);

  const run = async (issue: Issue, action: IssueMenuAction) => {
    switch (action.type) {
      case "flag":
        if (action.withComment) setDialog({ type: "flag", issue });
        else await updateIssue(issue.id, { flagged: true });
        return true;
      case "unflag":
        await updateIssue(issue.id, { flagged: false });
        return true;
      case "labels":
        await updateIssue(issue.id, { labelIds: action.labelIds });
        return true;
      case "parent":
        await updateIssue(issue.id, { parentId: action.parentId });
        return true;
      case "assign":
        await updateIssue(issue.id, { assigneeId: action.assigneeId });
        return true;
      case "copy-link": {
        const ok = await copyText(
          `${window.location.origin}/issues/${encodeURIComponent(issue.id)}`,
        );
        if (ok) onNotice?.(`Link to ${issue.id} copied`);
        else onError("The link could not be copied");
        return true;
      }
      case "copy-key": {
        const ok = await copyText(issue.id);
        if (ok) onNotice?.(`${issue.id} copied`);
        else onError("The key could not be copied");
        return true;
      }
      case "delete":
        setDialog({ type: "delete", issue });
        return true;
      case "split":
        setDialog({ type: "split", issue });
        return true;
      default:
        return false;
    }
  };

  const dialogs =
    dialog?.type === "flag" ? (
      <FlagCommentDialog
        key={dialog.issue.id}
        issue={dialog.issue}
        onClose={() => setDialog(null)}
        onSubmit={async (comment) => {
          const flagged = await updateIssue(dialog.issue.id, { flagged: true });
          if (!flagged) throw new Error("The flag could not be added");
          if (comment) {
            await addComment(dialog.issue.id, `Flag added\n\n${comment}`);
          }
        }}
      />
    ) : dialog?.type === "split" ? (
      <SplitIssueDialog
        key={dialog.issue.id}
        issue={dialog.issue}
        onClose={() => setDialog(null)}
        onSplit={async (body) => {
          const result = await apiRequest<{ original: Issue | null; created: Issue[] }>(
            `/api/issues/${encodeURIComponent(dialog.issue.id)}/split`,
            { method: "POST", body: JSON.stringify(body) },
          );
          if (result.original) replaceIssue(result.original);
          for (const created of result.created) replaceIssue(created);
          onNotice?.(
            `Split ${dialog.issue.id} into ${result.created.map((issue) => issue.id).join(", ")}`,
          );
        }}
      />
    ) : dialog?.type === "delete" ? (
      <DeleteIssueDialog
        key={dialog.issue.id}
        issue={dialog.issue}
        onClose={() => setDialog(null)}
        onDelete={async () => {
          await apiRequest<unknown>(
            `/api/issues/${encodeURIComponent(dialog.issue.id)}`,
            { method: "DELETE" },
          );
          removeIssue(dialog.issue.id);
          // Children lose their parent server-side; reload their refs.
          if (dialog.issue.childCount > 0) void refreshIssues();
        }}
      />
    ) : null;

  return { run, dialogs };
}
