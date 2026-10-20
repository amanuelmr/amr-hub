"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, ListTree, Package, Puzzle } from "lucide-react";
import type { Issue } from "../../data/issues";
import {
  DEFAULT_BOARD_CONFIG,
  type CardField,
} from "../../data/projects";
import { isDoneStatus } from "../../data/workflow";
import { IssueLabelChip } from "../IssueLabelChip";
import { KindIcon, PriorityBadge } from "../IssueVisuals";
import { selectedIssueHref } from "../issue/selectedIssue";
import { epicOf, formatShortDate, isOverdue } from "./boardModel";
import { EpicChip, FlagMark, MemberAvatar, PointsBadge } from "./PlanningVisuals";
import {
  IssueActionsMenu,
  type IssueMenuAction,
  type MoveDestination,
} from "./IssueActions";

export type CardAction = IssueMenuAction;

export type CardDisplay = {
  fields: CardField[];
  /** Left color bar from the board's card color strategy. */
  color: string | null;
  /** Whole days in the current status, shown as Jira's dots when set. */
  daysInColumn?: number | null;
  /** View settings "Compact cards": title, key and assignee only. */
  compact?: boolean;
};

/** Jira's days-in-column dots: more dots the longer an item sits still. */
function DaysInColumn({ days }: { days: number }) {
  const filled = days >= 14 ? 4 : days >= 7 ? 3 : days >= 3 ? 2 : days >= 1 ? 1 : 0;
  if (filled === 0) return null;
  const label = `${days} ${days === 1 ? "day" : "days"} in this column`;
  return (
    <span className="board-card-days" title={label} aria-label={label} role="img">
      {[0, 1, 2, 3].map((dot) => (
        <span key={dot} className={dot < filled ? "on" : undefined} />
      ))}
    </span>
  );
}

const DEFAULT_DISPLAY: CardDisplay = {
  fields: DEFAULT_BOARD_CONFIG.cardFields,
  color: null,
};

/**
 * Jira card anatomy: summary, then the epic lozenge, then a footer with the
 * type icon + key on the left and points, priority and assignee on the right.
 */
export function BoardCardBody({
  issue,
  isViewer,
  canAssignToMe,
  meId = null,
  destinations = [],
  display = DEFAULT_DISPLAY,
  onAction,
}: {
  issue: Issue;
  isViewer: boolean;
  canAssignToMe: boolean;
  meId?: string | null;
  destinations?: MoveDestination[];
  display?: CardDisplay;
  onAction?: (action: CardAction) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const show = (field: CardField) =>
    display.fields.includes(field) &&
    (!display.compact || field === "assignee");
  const epic = show("epic") ? epicOf(issue) : null;
  const labels = show("labels") ? issue.labels.slice(0, 2) : [];
  const components = show("components") ? issue.components.slice(0, 2) : [];
  const overdue = isOverdue(issue);
  const isDone = isDoneStatus(issue.status);

  return (
    <>
      <div className="board-card-head">
        <p className="board-card-title">{issue.title}</p>
        {onAction && (
          <IssueActionsMenu
            issue={issue}
            isViewer={isViewer}
            canAssignToMe={canAssignToMe}
            meId={meId}
            scope="column"
            destinations={destinations}
            onAction={onAction}
          />
        )}
      </div>

      {(labels.length > 0 || epic || components.length > 0 ||
        (show("fixVersion") && issue.fixVersion)) && (
        <div className="board-card-labels">
          {epic && <EpicChip epic={epic} />}
          {labels.map((label) => (
            <IssueLabelChip label={label} compact key={label.id} />
          ))}
          {components.map((component) => (
            <span
              className="board-card-field-chip"
              key={component.id}
              title={`Component: ${component.name}`}
            >
              <Puzzle size={11} aria-hidden="true" />
              {component.name}
            </span>
          ))}
          {show("fixVersion") && issue.fixVersion && (
            <span
              className="board-card-field-chip"
              title={`Fix version: ${issue.fixVersion.name}`}
            >
              <Package size={11} aria-hidden="true" />
              {issue.fixVersion.name}
            </span>
          )}
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
        {show("subtasks") && issue.childCount > 0 && (
          <span className="board-card-subtasks" title="Subtasks done">
            <ListTree size={12} aria-hidden="true" />
            {issue.doneChildCount}/{issue.childCount}
          </span>
        )}
        {show("dueDate") && issue.dueDate && (
          <span
            className={overdue ? "board-card-due overdue" : "board-card-due"}
            title={overdue ? "Overdue" : "Due date"}
          >
            <CalendarClock size={12} aria-hidden="true" />
            {formatShortDate(issue.dueDate)}
          </span>
        )}
        {display.daysInColumn != null && <DaysInColumn days={display.daysInColumn} />}
        <span className="board-card-meta-end">
          {show("storyPoints") && issue.estimate !== null && (
            <PointsBadge points={issue.estimate} />
          )}
          {show("priority") && (
            <span className="board-card-priority">
              <PriorityBadge priority={issue.priority} />
            </span>
          )}
          {show("assignee") && <MemberAvatar member={issue.assignee} />}
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
  meId,
  destinations,
  display,
  onAction,
  onOpen,
  shouldIgnoreClick,
}: {
  issue: Issue;
  cellId: string;
  isViewer: boolean;
  canAssignToMe: boolean;
  meId: string | null;
  destinations: MoveDestination[];
  display: CardDisplay;
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
        display.color ? "colored" : "",
        display.compact ? "compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          transform: CSS.Translate.toString(transform),
          transition,
          ...(display.color ? { "--card-color": display.color } : {}),
        } as React.CSSProperties
      }
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
        meId={meId}
        destinations={destinations}
        display={display}
        onAction={(action) => onAction(issue, action)}
      />
    </div>
  );
}
