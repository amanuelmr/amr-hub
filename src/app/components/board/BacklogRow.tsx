"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ListTree } from "lucide-react";
import {
  ISSUE_ESTIMATES,
  type Issue,
  type IssueEstimate,
  type IssueStatus,
} from "../../data/issues";
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
import {
  IssueActionsMenu,
  type IssueMenuAction,
  type MoveDestination,
} from "./IssueActions";

export type { MoveDestination };
export type RowAction = IssueMenuAction;

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

/** Jira's inline story point estimate: click the badge to pick a value. */
export function EstimateMenu({
  estimate,
  onChange,
}: {
  estimate: IssueEstimate | null;
  onChange?: (estimate: IssueEstimate | null) => void;
}) {
  if (!onChange) return <PointsBadge points={estimate} />;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={
            estimate === null
              ? "planning-points empty planning-points-edit"
              : "planning-points planning-points-edit"
          }
          aria-label={`Story points: ${estimate ?? "none"}. Change estimate`}
          onClick={stop}
          onPointerDown={stop}
          onKeyDown={stop}
        >
          {estimate ?? "-"}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="planning-menu planning-estimate-menu"
          align="end"
          sideOffset={4}
          onClick={stop}
        >
          <DropdownMenu.Label className="planning-menu-label">
            Story points
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            className="planning-estimate-grid"
            value={estimate === null ? "" : String(estimate)}
            onValueChange={(value) =>
              onChange(value === "" ? null : (Number(value) as IssueEstimate))
            }
          >
            {ISSUE_ESTIMATES.map((value) => (
              <DropdownMenu.RadioItem
                key={value}
                value={String(value)}
                className="planning-menu-item planning-estimate-item"
              >
                {value}
              </DropdownMenu.RadioItem>
            ))}
            <DropdownMenu.RadioItem
              value=""
              className="planning-menu-item planning-estimate-item none"
            >
              None
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function BacklogRowBody({
  issue,
  selectionCount = 0,
  onStatusChange,
  onEstimateChange,
}: {
  issue: Issue;
  selectionCount?: number;
  onStatusChange?: (status: IssueStatus) => void;
  onEstimateChange?: (estimate: IssueEstimate | null) => void;
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
      <EstimateMenu estimate={issue.estimate} onChange={onEstimateChange} />
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
  meId,
  color = null,
  destinations,
  onSelect,
  onAction,
  onStatusChange,
  onEstimateChange,
}: {
  issue: Issue;
  sectionId: string;
  isSelected: boolean;
  isOpen: boolean;
  isViewer: boolean;
  meId: string | null;
  /** Left color bar from the board's card color strategy. */
  color?: string | null;
  destinations: MoveDestination[];
  onSelect: (issue: Issue, event: React.MouseEvent) => void;
  onAction: (issue: Issue, action: RowAction) => void;
  onStatusChange: (issue: Issue, status: IssueStatus) => void;
  onEstimateChange: (issue: Issue, estimate: IssueEstimate | null) => void;
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
        color ? "colored" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          transform: CSS.Translate.toString(transform),
          transition,
          ...(color ? { "--card-color": color } : {}),
        } as React.CSSProperties
      }
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
        onEstimateChange={
          isViewer ? undefined : (estimate) => onEstimateChange(issue, estimate)
        }
      />
      <IssueActionsMenu
        issue={issue}
        isViewer={isViewer}
        canAssignToMe={!isViewer && !!meId}
        meId={meId}
        scope="list"
        destinations={destinations}
        onAction={(action) => onAction(issue, action)}
      />
    </div>
  );
}
