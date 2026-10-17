"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CalendarClock,
  ExternalLink,
  Flag,
  FlagOff,
  ListTree,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import type { Issue } from "../../data/issues";
import { isDoneStatus } from "../../data/workflow";
import { IssueLabelChip } from "../IssueLabelChip";
import { KindIcon, PriorityBadge } from "../IssueVisuals";
import { selectedIssueHref } from "../issue/selectedIssue";
import { epicOf, formatShortDate, isOverdue } from "./boardModel";
import { EpicChip, FlagMark, MemberAvatar, PointsBadge } from "./PlanningVisuals";

export type CardAction = "top" | "bottom" | "flag" | "assign-me" | "open";

function CardMenu({
  issue,
  isViewer,
  canAssignToMe,
  onAction,
}: {
  issue: Issue;
  isViewer: boolean;
  canAssignToMe: boolean;
  onAction: (action: CardAction) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="board-card-menu-trigger"
          type="button"
          aria-label={`Actions for ${issue.id}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="planning-menu"
          align="end"
          sideOffset={4}
          onClick={(event) => event.stopPropagation()}
        >
          {!isViewer && (
            <>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction("top")}
              >
                <ArrowUpToLine size={14} aria-hidden="true" />
                Move to top of column
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction("bottom")}
              >
                <ArrowDownToLine size={14} aria-hidden="true" />
                Move to bottom of column
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="planning-menu-separator" />
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => onAction("flag")}
              >
                {issue.flagged ? (
                  <FlagOff size={14} aria-hidden="true" />
                ) : (
                  <Flag size={14} aria-hidden="true" />
                )}
                {issue.flagged ? "Remove flag" : "Add flag"}
              </DropdownMenu.Item>
              {canAssignToMe && (
                <DropdownMenu.Item
                  className="planning-menu-item"
                  onSelect={() => onAction("assign-me")}
                >
                  <UserRound size={14} aria-hidden="true" />
                  Assign to me
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="planning-menu-separator" />
            </>
          )}
          <DropdownMenu.Item
            className="planning-menu-item"
            onSelect={() => onAction("open")}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open issue
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Jira card anatomy: summary, then the epic lozenge, then a footer with the
 * type icon + key on the left and points, priority and assignee on the right.
 */
export function BoardCardBody({
  issue,
  isViewer,
  canAssignToMe,
  onAction,
}: {
  issue: Issue;
  isViewer: boolean;
  canAssignToMe: boolean;
  onAction?: (action: CardAction) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const epic = epicOf(issue);
  const overdue = isOverdue(issue);
  const isDone = isDoneStatus(issue.status);

  return (
    <>
      <div className="board-card-head">
        <p className="board-card-title">{issue.title}</p>
        {onAction && (
          <CardMenu
            issue={issue}
            isViewer={isViewer}
            canAssignToMe={canAssignToMe}
            onAction={onAction}
          />
        )}
      </div>

      {(issue.labels.length > 0 || epic) && (
        <div className="board-card-labels">
          {epic && <EpicChip epic={epic} />}
          {issue.labels.slice(0, 2).map((label) => (
            <IssueLabelChip label={label} compact key={label.id} />
          ))}
        </div>
      )}

      <div className="board-card-meta">
        <KindIcon kind={issue.kind} projectId={issue.projectId} />
        <Link
          className={isDone ? "board-card-id done" : "board-card-id"}
          href={selectedIssueHref(pathname, searchParams, issue.id)}
          scroll={false}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {issue.id}
        </Link>
        {issue.flagged && <FlagMark />}
        {issue.childCount > 0 && (
          <span className="board-card-subtasks" title="Subtasks done">
            <ListTree size={12} aria-hidden="true" />
            {issue.doneChildCount}/{issue.childCount}
          </span>
        )}
        {issue.dueDate && (
          <span
            className={overdue ? "board-card-due overdue" : "board-card-due"}
            title={overdue ? "Overdue" : "Due date"}
          >
            <CalendarClock size={12} aria-hidden="true" />
            {formatShortDate(issue.dueDate)}
          </span>
        )}
        <span className="board-card-meta-end">
          {issue.estimate !== null && <PointsBadge points={issue.estimate} />}
          <span className="board-card-priority">
            <PriorityBadge priority={issue.priority} />
          </span>
          <MemberAvatar member={issue.assignee} />
        </span>
      </div>
    </>
  );
}

export function SortableBoardCard({
  issue,
  cellId,
  isViewer,
  canAssignToMe,
  onAction,
  onOpen,
  shouldIgnoreClick,
}: {
  issue: Issue;
  cellId: string;
  isViewer: boolean;
  canAssignToMe: boolean;
  onAction: (issue: Issue, action: CardAction) => void;
  onOpen: (issue: Issue) => void;
  shouldIgnoreClick: () => boolean;
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
    data: { type: "card", cellId },
    disabled: isViewer,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "board-card",
        "planning-card",
        issue.flagged ? "flagged" : "",
        isDragging ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`${issue.id} ${issue.title}`}
      onClick={(event) => {
        if (shouldIgnoreClick()) return;
        if (event.metaKey || event.ctrlKey) {
          window.open(`/issues/${issue.id}`, "_blank", "noopener");
          return;
        }
        onOpen(issue);
      }}
      onKeyDown={(event) => {
        // Space/Enter are dnd-kit's keyboard drag keys; "o" opens like Jira.
        if (event.key === "o" && !isDragging) onOpen(issue);
        listeners?.onKeyDown?.(event);
      }}
    >
      <BoardCardBody
        issue={issue}
        isViewer={isViewer}
        canAssignToMe={canAssignToMe}
        onAction={(action) => onAction(issue, action)}
      />
    </div>
  );
}
