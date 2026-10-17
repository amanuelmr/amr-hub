"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  MoreHorizontal,
  Plus,
  Rows3,
  Settings2,
  X,
} from "lucide-react";
import { useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { useSelectedIssue } from "../../../components/issue/selectedIssue";
import {
  BoardCardBody,
  SortableBoardCard,
  type CardAction,
} from "../../../components/board/BoardCard";
import {
  AssigneeStack,
  EpicFilter,
  FilterCheckItem,
  FilterMenu,
  MenuLabel,
  PlanningSearch,
  TypeFilter,
  hasActiveFilters,
  toggleValue,
} from "../../../components/board/FilterControls";
import { CompleteSprintDialog } from "../../../components/board/SprintDialogs";
import { usePlanningActions } from "../../../components/board/sprintApi";
import { useWorkflow } from "../../../WorkflowProvider";
import {
  allowedTransitions,
  isEpicLevel,
  statusName,
} from "../../../data/workflow";
import {
  BOARD_CREATE_DESCRIPTION,
  EMPTY_FILTERS,
  UNASSIGNED,
  activeSprintOf,
  columnForStatus,
  compareRank,
  computeDropTarget,
  daysRemaining,
  formatShortDate,
  futureSprintsOf,
  groupLanes,
  isPlanningIssue,
  matchesFilters,
  optimisticRanks,
  resolveBoardColumns,
  type IssueFilters,
  type Lane,
} from "../../../components/board/boardModel";
import type {
  Issue,
  IssueKind,
  IssuePriority,
  NewIssueInput,
} from "../../../data/issues";
import {
  DEFAULT_BOARD_CONFIG,
  type BoardColumnConfig,
  type BoardSwimlanes,
} from "../../../data/projects";

const GROUP_OPTIONS: { value: BoardSwimlanes; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "ASSIGNEE", label: "Assignee" },
  { value: "EPIC", label: "Epic" },
  { value: "PRIORITY", label: "Priority" },
];


const QUICK_FILTERS = [
  ["onlyMine", "Only my issues"],
  ["recent", "Recently updated"],
  ["flagged", "Flagged"],
] as const;

const CELL_SEPARATOR = "::";

function cellKey(laneId: string, columnId: string) {
  return `cell${CELL_SEPARATOR}${laneId}${CELL_SEPARATOR}${columnId}`;
}

function parseCellKey(key: string) {
  const [, laneId, columnId] = key.split(CELL_SEPARATOR);
  return { laneId, columnId };
}

function BoardCell({
  id,
  issues,
  children,
}: {
  id: string;
  issues: Issue[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "cell" } });

  return (
    <SortableContext
      id={id}
      items={issues.map((issue) => issue.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={isOver ? "board-cell drag-over" : "board-cell"}
      >
        {children}
      </div>
    </SortableContext>
  );
}

/** Jira's hover "+ Create" at the bottom of a column. */
function ColumnCreate({
  onCreate,
}: {
  onCreate: (title: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return (
      <button
        className="board-column-create"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Plus size={14} aria-hidden="true" />
        Create
      </button>
    );
  }

  const close = () => {
    setIsOpen(false);
    setTitle("");
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim().length < 4) {
      setError("Titles need at least 4 characters.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate(title.trim());
      setTitle("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The issue could not be created",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="board-inline-create" onSubmit={handleSubmit}>
      <textarea
        value={title}
        maxLength={255}
        rows={2}
        placeholder="What needs to be done?"
        aria-label="New issue summary"
        autoFocus
        disabled={isSubmitting}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {error && <p className="field-error">{error}</p>}
      <div className="board-inline-create-actions">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create"}
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Cancel"
          onClick={close}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

export default function ProjectBoardPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const {
    issues: allIssues,
    cycles,
    members,
    labels,
    isLoading,
    createIssue,
    updateIssue,
  } = useIssues();
  const { projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const meId = activeMember?.id ?? null;
  const planning = usePlanningActions();
  const { open: openIssue } = useSelectedIssue();
  const workflow = useWorkflow(projectId);
  const defaultKind =
    workflow.types.find((type) => type.key === "STORY")?.key ??
    workflow.types.find((type) => type.level === 0)?.key ??
    "TASK";

  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const [swimlaneChoice, setSwimlaneChoice] = useState<BoardSwimlanes | null>(
    null,
  );
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const project = projects.find((candidate) => candidate.id === projectId);
  const boardType = project?.boardType ?? "SCRUM";
  const config = project?.boardConfig ?? DEFAULT_BOARD_CONFIG;
  const swimlanes = swimlaneChoice ?? config.swimlanes;
  const columns = resolveBoardColumns(config, boardType);
  const activeSprint = activeSprintOf(cycles, projectId);

  const projectIssues = planning
    .applyOverrides(allIssues.filter((issue) => issue.projectId === projectId))
    .sort(compareRank);
  const epics = projectIssues.filter((issue) => isEpicLevel(issue.kind));
  const boardKinds: IssueKind[] = workflow.types
    .filter((type) => type.level === 0)
    .map((type) => type.key);

  const boardIssues = projectIssues.filter((issue) => {
    if (!isPlanningIssue(issue)) return false;
    if (boardType === "SCRUM") {
      return !!activeSprint && issue.cycleId === activeSprint.id;
    }
    return true;
  });

  const columnOf = (issue: Issue) =>
    columnForStatus(columns, issue.status, boardType);
  const onBoard = boardIssues.filter((issue) => columnOf(issue) !== null);
  const visible = onBoard.filter((issue) =>
    matchesFilters(issue, filters, meId),
  );
  const lanes = groupLanes(visible, swimlanes, members);

  const boardMembers = members.filter((member) =>
    onBoard.some((issue) => issue.assignee?.id === member.id),
  );
  const hasUnassigned = onBoard.some((issue) => !issue.assignee);

  const cellIssues = (laneIssues: Issue[], column: BoardColumnConfig) =>
    laneIssues.filter((issue) => columnOf(issue) === column.id);

  const laneOf = (issue: Issue) =>
    lanes.find((lane) => lane.issues.some((item) => item.id === issue.id));

  const moveIssue = async (
    issue: Issue,
    targetColumn: BoardColumnConfig,
    target: { afterId?: string; beforeId?: string; order: string[] },
  ) => {
    const sourceColumn = columnOf(issue);
    // A column with no mapped statuses has nowhere to transition the issue to.
    if (sourceColumn !== targetColumn.id && targetColumn.statuses.length === 0) {
      return;
    }
    // Jira: dropping on a column moves to the first of its statuses that the
    // workflow allows from the issue's current status.
    let status: string | undefined;
    if (sourceColumn !== targetColumn.id) {
      const allowed = new Set(
        allowedTransitions(workflow, issue.status).map(
          (transition) => transition.toKey,
        ),
      );
      status = targetColumn.statuses.find((key) => allowed.has(key));
      if (!status) {
        planning.setError(
          `The workflow does not allow moving ${issue.id} from ${statusName(
            issue.status,
            workflow.statuses,
          )} to ${targetColumn.name}.`,
        );
        return;
      }
    }
    const rankOf = (id: string) =>
      projectIssues.find((candidate) => candidate.id === id)?.rank ?? 0;
    const ranks = optimisticRanks(target, [issue.id], rankOf);
    const optimistic = new Map<string, Partial<Issue>>([
      [
        issue.id,
        { rank: ranks.get(issue.id) ?? issue.rank, ...(status ? { status } : {}) },
      ],
    ]);
    await planning.rank(
      {
        issueIds: [issue.id],
        afterId: target.afterId,
        beforeId: target.beforeId,
        ...(status ? { status } : {}),
      },
      optimistic,
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 250);
    const { active, over } = event;
    if (!over || isViewer) return;
    const issue = visible.find((candidate) => candidate.id === active.id);
    if (!issue) return;

    const overData = over.data.current as
      | { type?: string; cellId?: string }
      | undefined;
    const targetCell =
      overData?.type === "cell" ? String(over.id) : overData?.cellId;
    if (!targetCell) return;
    const { laneId, columnId } = parseCellKey(targetCell);
    const targetColumn = columns.find((column) => column.id === columnId);
    const lane = lanes.find((candidate) => candidate.id === laneId);
    if (!targetColumn || !lane) return;

    const list = cellIssues(lane.issues, targetColumn).map((item) => item.id);
    const target = computeDropTarget({
      list,
      movedIds: [issue.id],
      activeId: issue.id,
      overId: overData?.type === "cell" ? null : String(over.id),
    });
    if (!target) return;
    void moveIssue(issue, targetColumn, target);
  };

  const handleCardAction = (issue: Issue, action: CardAction) => {
    if (action === "open") {
      openIssue(issue.id);
      return;
    }
    if (action === "flag") {
      void updateIssue(issue.id, { flagged: !issue.flagged });
      return;
    }
    if (action === "assign-me") {
      if (meId) void updateIssue(issue.id, { assigneeId: meId });
      return;
    }
    const column = columns.find((candidate) => candidate.id === columnOf(issue));
    const lane = laneOf(issue);
    if (!column || !lane) return;
    const list = cellIssues(lane.issues, column)
      .map((item) => item.id)
      .filter((id) => id !== issue.id);
    if (list.length === 0) return;
    void moveIssue(
      issue,
      column,
      action === "top"
        ? { beforeId: list[0], order: [issue.id, ...list] }
        : { afterId: list.at(-1), order: [...list, issue.id] },
    );
  };

  /** Creates in the column's first status and inherits the lane's grouping. */
  const handleCreate = async (
    title: string,
    column: BoardColumnConfig,
    lane: Lane,
  ) => {
    const input: NewIssueInput = {
      title,
      description: BOARD_CREATE_DESCRIPTION,
      priority: "MEDIUM",
      kind: defaultKind,
      assigneeId: null,
      dueDate: null,
      estimate: null,
      projectId,
      cycleId: boardType === "SCRUM" ? (activeSprint?.id ?? null) : null,
      labelIds: [],
      status: column.statuses[0] ?? "OPEN",
    };
    if (swimlanes === "ASSIGNEE" && lane.id !== UNASSIGNED) {
      input.assigneeId = lane.id;
    } else if (swimlanes === "EPIC" && epics.some((epic) => epic.id === lane.id)) {
      input.parentId = lane.id;
    } else if (swimlanes === "PRIORITY") {
      input.priority = lane.id as IssuePriority;
    }
    if (filters.epicId && !input.parentId) input.parentId = filters.epicId;
    await createIssue(input);
  };

  if (isLoading) return <WorkspaceLoading label="board" />;

  if (!project) {
    return (
      <div className="page">
        <section className="empty-state">
          <h2>Project not found</h2>
          <p>This project does not exist or you no longer have access.</p>
        </section>
      </div>
    );
  }

  const boardName =
    boardType === "SCRUM"
      ? (activeSprint?.name ?? `${project.key} board`)
      : `${project.key} board`;

  const boardMenu = (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="icon-button" type="button" aria-label="Board actions">
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="planning-menu" align="end" sideOffset={4}>
          <DropdownMenu.Item className="planning-menu-item" asChild>
            <Link href={`/projects/${projectId}/settings?tab=board`}>
              <Settings2 size={14} aria-hidden="true" />
              Board settings
            </Link>
          </DropdownMenu.Item>
          {boardType === "SCRUM" && (
            <DropdownMenu.Item className="planning-menu-item" asChild>
              <Link href={`/projects/${projectId}/backlog`}>
                <Rows3 size={14} aria-hidden="true" />
                Manage sprints
              </Link>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  if (boardType === "SCRUM" && !activeSprint) {
    return (
      <div className="page board-page">
        <div className="board-titlebar">
          <h2 className="board-name">{boardName}</h2>
          {boardMenu}
        </div>
        <section className="empty-state board-empty">
          <Rows3 size={22} aria-hidden="true" />
          <h2>No active sprint</h2>
          <p>Plan and start a sprint from the backlog to see work here.</p>
          <Link className="primary-button" href={`/projects/${projectId}/backlog`}>
            Go to backlog
          </Link>
        </section>
      </div>
    );
  }

  const activeIssue = activeId
    ? visible.find((issue) => issue.id === activeId) ?? null
    : null;
  const sprintIssues = activeSprint
    ? projectIssues.filter(
        (issue) => issue.cycleId === activeSprint.id && isPlanningIssue(issue),
      )
    : [];

  const canAssignToMe = !!meId && !isViewer;
  const columnStyle = {
    "--board-columns": columns.length,
  } as React.CSSProperties;
  const quickCount = QUICK_FILTERS.filter(([key]) => filters[key]).length +
    (filters.labelId ? 1 : 0);
  const groupLabel =
    GROUP_OPTIONS.find((option) => option.value === swimlanes)?.label ?? "None";
  const remaining = activeSprint ? daysRemaining(activeSprint.endDate) : 0;

  return (
    <div className="page board-page">
      <div className="board-titlebar">
        <h2 className="board-name">{boardName}</h2>
      </div>

      <div className="planning-toolbar" role="toolbar" aria-label="Board filters">
        <div className="planning-toolbar-start">
          <PlanningSearch
            label="Search board"
            value={filters.query}
            onChange={(query) => setFilters((current) => ({ ...current, query }))}
          />
          <AssigneeStack
            members={boardMembers}
            includeUnassigned={hasUnassigned}
            selected={filters.assigneeIds}
            onToggle={(id) =>
              setFilters((current) => ({
                ...current,
                assigneeIds: toggleValue(current.assigneeIds, id),
              }))
            }
          />
          <EpicFilter epics={epics} filters={filters} setFilters={setFilters} />
          <TypeFilter
            kinds={boardKinds}
            filters={filters}
            setFilters={setFilters}
            projectId={projectId}
          />
          <FilterMenu label="Quick filters" count={quickCount}>
            {QUICK_FILTERS.map(([key, label]) => (
              <FilterCheckItem
                key={key}
                checked={filters[key]}
                onToggle={() =>
                  setFilters((current) => ({ ...current, [key]: !current[key] }))
                }
              >
                {label}
              </FilterCheckItem>
            ))}
            {labels.length > 0 && (
              <>
                <DropdownMenu.Separator className="planning-menu-separator" />
                <MenuLabel>Labels</MenuLabel>
                {labels.map((label) => (
                  <FilterCheckItem
                    key={label.id}
                    checked={filters.labelId === label.id}
                    onToggle={() =>
                      setFilters((current) => ({
                        ...current,
                        labelId: current.labelId === label.id ? null : label.id,
                      }))
                    }
                  >
                    <span
                      className="planning-epic-swatch"
                      style={{ background: label.color }}
                      aria-hidden="true"
                    />
                    <span className="planning-menu-text">{label.name}</span>
                  </FilterCheckItem>
                ))}
              </>
            )}
          </FilterMenu>
          {hasActiveFilters(filters) && (
            <button
              className="text-button planning-clear"
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="planning-toolbar-end">
          {activeSprint && (
            <Tooltip.Provider delayDuration={200}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span className="board-sprint-chip" tabIndex={0}>
                    <Clock size={13} aria-hidden="true" />
                    {remaining} {remaining === 1 ? "day" : "days"} remaining
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="planning-tooltip"
                    side="bottom"
                    align="end"
                    sideOffset={6}
                  >
                    <strong>{activeSprint.name}</strong>
                    <span>
                      {formatShortDate(activeSprint.startDate)} –{" "}
                      {formatShortDate(activeSprint.endDate)}
                    </span>
                    {activeSprint.goal && <span>Goal: {activeSprint.goal}</span>}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          )}
          {activeSprint && !isViewer && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setIsCompleteOpen(true)}
            >
              Complete sprint
            </button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="planning-filter" type="button">
                Group: {groupLabel}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="planning-menu"
                align="end"
                sideOffset={4}
              >
                <MenuLabel>Group by</MenuLabel>
                <DropdownMenu.RadioGroup
                  value={swimlanes}
                  onValueChange={(value) =>
                    setSwimlaneChoice(value as BoardSwimlanes)
                  }
                >
                  {GROUP_OPTIONS.map((option) => (
                    <DropdownMenu.RadioItem
                      key={option.value}
                      value={option.value}
                      className="planning-menu-item planning-check-item"
                    >
                      <span className="planning-radio" aria-hidden="true">
                        <DropdownMenu.ItemIndicator>
                          <span className="planning-radio-dot" />
                        </DropdownMenu.ItemIndicator>
                      </span>
                      {option.label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {boardMenu}
        </div>
      </div>

      {planning.error && (
        <p className="form-submit-error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {planning.error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board-scroll">
          <div
            className={
              swimlanes === "NONE" ? "board-grid no-lanes" : "board-grid"
            }
            style={columnStyle}
          >
            {columns.map((column) => {
              const count = onBoard.filter(
                (issue) => columnOf(issue) === column.id,
              ).length;
              const overLimit = column.wipLimit !== null && count > column.wipLimit;
              return (
                <div
                  key={column.id}
                  className={
                    overLimit ? "board-column-head over-limit" : "board-column-head"
                  }
                >
                  <span className="board-column-name">{column.name}</span>
                  <span className="board-column-count">{count}</span>
                  {column.wipLimit !== null && (
                    <span className="board-column-wip">
                      Max {column.wipLimit}
                    </span>
                  )}
                  {overLimit && <span className="sr-only">WIP limit exceeded</span>}
                </div>
              );
            })}

            {lanes.map((lane) => {
              const collapsed = collapsedLanes.has(lane.id);
              return (
                <div className="board-lane" key={lane.id}>
                  {swimlanes !== "NONE" && (
                    <button
                      type="button"
                      className="board-lane-header"
                      aria-expanded={!collapsed}
                      onClick={() =>
                        setCollapsedLanes((current) => {
                          const next = new Set(current);
                          if (next.has(lane.id)) next.delete(lane.id);
                          else next.add(lane.id);
                          return next;
                        })
                      }
                    >
                      {collapsed ? (
                        <ChevronRight size={14} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={14} aria-hidden="true" />
                      )}
                      <strong>{lane.title}</strong>
                      <span>
                        ({lane.issues.length}{" "}
                        {lane.issues.length === 1 ? "work item" : "work items"})
                      </span>
                    </button>
                  )}
                  {!collapsed &&
                    columns.map((column) => {
                      const id = cellKey(lane.id, column.id);
                      const items = cellIssues(lane.issues, column);
                      return (
                        <BoardCell key={id} id={id} issues={items}>
                          {items.map((issue) => (
                            <SortableBoardCard
                              key={issue.id}
                              issue={issue}
                              cellId={id}
                              isViewer={isViewer}
                              canAssignToMe={
                                canAssignToMe && issue.assignee?.id !== meId
                              }
                              onAction={handleCardAction}
                              onOpen={(target) => openIssue(target.id)}
                              shouldIgnoreClick={() => justDragged.current}
                            />
                          ))}
                          {!isViewer && column.statuses.length > 0 && (
                            <ColumnCreate
                              onCreate={(title) => handleCreate(title, column, lane)}
                            />
                          )}
                        </BoardCell>
                      );
                    })}
                </div>
              );
            })}

            {lanes.length === 0 && (
              <p className="board-no-match">
                {onBoard.length === 0
                  ? "No work items on this board yet."
                  : "No work items match these filters."}
              </p>
            )}
          </div>
        </div>
        <DragOverlay>
          {activeIssue && (
            <div className="board-card planning-card overlay">
              <BoardCardBody
                issue={activeIssue}
                isViewer={isViewer}
                canAssignToMe={false}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {isCompleteOpen && activeSprint && (
        <CompleteSprintDialog
          sprint={activeSprint}
          issues={sprintIssues}
          futureSprints={futureSprintsOf(cycles, projectId)}
          open={isCompleteOpen}
          onOpenChange={setIsCompleteOpen}
          onComplete={(destination) =>
            planning.completeSprint(activeSprint.id, destination)
          }
        />
      )}
    </div>
  );
}
