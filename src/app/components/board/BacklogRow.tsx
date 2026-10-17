"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ListTree,
  MoreHorizontal,
  MoveRight,
} from "lucide-react";
import type { Issue, IssueStatus } from "../../data/issues";
import {
  allowedTransitions,
  isDoneStatus,
  statusName,
  statusTone,
  transitionLabel,
} from "../../data/workflow";
import { useWorkflow } from "../../WorkflowProvider";
import { KindIcon, PriorityBadge } from "../IssueVisuals";
import { epicOf } from "./boardModel";
import { EpicChip, FlagMark, MemberAvatar, PointsBadge } from "./PlanningVisuals";

export type MoveDestination = { id: string | null; label: string };

export type RowAction =
  | { type: "top" }
  | { type: "bottom" }
  | { type: "move"; cycleId: string | null };

const categoryClass = (status: IssueStatus) => statusTone(status);

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/** Jira's status lozenge that doubles as an inline transition menu. */
export function StatusLozenge({
  status,
  onChange,
  projectId,
}: {
  status: IssueStatus;
  onChange?: (status: IssueStatus) => void;
  projectId?: string | null;
}) {
  const workflow = useWorkflow(projectId);
  const label = statusName(status, workflow.statuses);
  const className = `planning-status-lozenge ${categoryClass(status)}`;
  if (!onChange) {
    return <span className={className}>{label}</span>;
  }
  const options = allowedTransitions(workflow, status);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={className}
          aria-label={`Status: ${label}. Change status`}
          onClick={stop}
          onPointerDown={stop}
          onKeyDown={stop}
        >
          {label}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="planning-menu"
          align="end"
          sideOffset={4}
          onClick={stop}
        >
          <DropdownMenu.Item className="planning-menu-item" disabled>
            <span className={className}>{label}</span>
            <Check size={13} aria-hidden="true" className="planning-menu-end" />
          </DropdownMenu.Item>
          {options.length === 0 && (
            <DropdownMenu.Item className="planning-menu-item" disabled>
              No transitions available
            </DropdownMenu.Item>
          )}
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.toKey}
              className="planning-menu-item"
              onSelect={() => onChange(option.toKey)}
            >
              {option.name &&
              transitionLabel(option, workflow.statuses) !==
                statusName(option.toKey, workflow.statuses) ? (
                <span className="planning-menu-text">{option.name}</span>
              ) : null}
              <span
                className={`planning-status-lozenge ${categoryClass(option.toKey)}`}
              >
                {statusName(option.toKey, workflow.statuses)}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function BacklogRowBody({
  issue,
  selectionCount = 0,
  onStatusChange,
}: {
  issue: Issue;
  selectionCount?: number;
  onStatusChange?: (status: IssueStatus) => void;
}) {
  const epic = epicOf(issue);
  const isDone = isDoneStatus(issue.status);

  return (
    <>
      <KindIcon kind={issue.kind} projectId={issue.projectId} />
      <Link
        className={isDone ? "backlog-row-key done" : "backlog-row-key"}
        href={`/issues/${issue.id}`}
        onPointerDown={stop}
        onClick={(event) => {
          // Cmd/Ctrl/middle click opens the full page; a plain click selects
          // the row and opens the side panel like the rest of the row.
          if (event.metaKey || event.ctrlKey || event.shiftKey) {
            event.stopPropagation();
            return;
          }
          event.preventDefault();
        }}
      >
        {issue.id}
      </Link>
      <span className="backlog-row-title">
        {issue.flagged && <FlagMark />}
        <span>{issue.title}</span>
      </span>
      <span className="backlog-row-tags">
        {issue.childCount > 0 && (
          <span className="board-card-subtasks" title="Subtasks done">
            <ListTree size={12} aria-hidden="true" />
            {issue.doneChildCount}/{issue.childCount}
          </span>
        )}
        {epic && <EpicChip epic={epic} />}
      </span>
      <StatusLozenge
        status={issue.status}
        onChange={onStatusChange}
        projectId={issue.projectId}
      />
      <span className="board-card-priority">
        <PriorityBadge priority={issue.priority} />
      </span>
      <PointsBadge points={issue.estimate} />
      <MemberAvatar member={issue.assignee} />
      {selectionCount > 1 && (
        <span className="backlog-drag-count">{selectionCount}</span>
      )}
    </>
  );
}

export function SortableBacklogRow({
  issue,
  sectionId,
  isSelected,
  isOpen,
  isViewer,
  destinations,
  onSelect,
  onAction,
  onStatusChange,
}: {
  issue: Issue;
  sectionId: string;
  isSelected: boolean;
  isOpen: boolean;
  isViewer: boolean;
  destinations: MoveDestination[];
  onSelect: (issue: Issue, event: React.MouseEvent) => void;
  onAction: (issue: Issue, action: RowAction) => void;
  onStatusChange: (issue: Issue, status: IssueStatus) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { type: "row", sectionId },
    disabled: isViewer,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "backlog-row",
        isSelected ? "selected" : "",
        isOpen ? "open" : "",
        isDragging ? "dragging" : "",
        issue.flagged ? "flagged" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-selected={isSelected}
      aria-label={`${issue.id} ${issue.title}`}
      onClick={(event) => onSelect(issue, event)}
    >
      <BacklogRowBody
        issue={issue}
        onStatusChange={
          isViewer ? undefined : (status) => onStatusChange(issue, status)
        }
      />
      {isViewer ? (
        <span aria-hidden="true" />
      ) : (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="board-card-menu-trigger"
              type="button"
              aria-label={`Actions for ${issue.id}`}
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
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction(issue, { type: "top" })}
              >
                <ArrowUpToLine size={14} aria-hidden="true" />
                Move to top
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction(issue, { type: "bottom" })}
              >
                <ArrowDownToLine size={14} aria-hidden="true" />
                Move to bottom
              </DropdownMenu.Item>
              {destinations.length > 0 && (
                <DropdownMenu.Separator className="planning-menu-separator" />
              )}
              {destinations.map((destination) => (
                <DropdownMenu.Item
                  key={destination.id ?? "backlog"}
                  className="planning-menu-item"
                  onSelect={() =>
                    onAction(issue, { type: "move", cycleId: destination.id })
                  }
                >
                  <MoveRight size={14} aria-hidden="true" />
                  Move to {destination.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}
