"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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
  CornerDownLeft,
  Lightbulb,
  MoreHorizontal,
  Package,
  Plus,
  Rows3,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { apiRequest, useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { KindIcon } from "../../../components/IssueVisuals";
import { useSelectedIssue } from "../../../components/issue/selectedIssue";
import {
  BoardCardBody,
  SortableBoardCard,
  type CardAction,
  type CardDisplay,
} from "../../../components/board/BoardCard";
import {
  useIssueMenuActions,
  type MoveDestination,
} from "../../../components/board/IssueActions";
import { KanbanReleaseDialog } from "../../../components/board/KanbanRelease";
import { InsightsPanel } from "../../../components/board/InsightsPanel";
import {
  activeSprintsOf,
  cardColorFor,
  compileQueries,
  groupQueryLanes,
  isHiddenKanbanDone,
  matchesQuickFilters,
  visibleSprintIds,
} from "../../../components/board/boardRules";
import { useJqlContext } from "../../../components/search/useJqlContext";
import {
  AssigneeStack,
  EpicFilter,
  FilterCheckItem,
  FilterMenu,
  MenuLabel,
  PlanningSearch,
  QuickFilterButtons,
  TypeFilter,
  hasActiveFilters,
  toggleValue,
} from "../../../components/board/FilterControls";
import {
  CompleteSprintDialog,
  DialogFooter,
  FormError,
  PlanningDialog,
} from "../../../components/board/SprintDialogs";
import { useProjectBoards } from "../../../components/board/useProjectBoards";
import {
  BoardAddColumn,
  BoardColumnHeader,
} from "../../../components/board/BoardColumnHeader";
import { useBoardView } from "../../../components/board/useBoardView";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { DEFAULT_BOARD_ID } from "../../../data/projects";
import { parseJql, searchIssuesWithJql } from "../../../data/jql";
import { usePlanningActions } from "../../../components/board/sprintApi";
import { useWorkflow, useWorkflows } from "../../../WorkflowProvider";
import {
  allowedTransitions,
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
  statusName,
  type ProjectWorkflow,
  type StatusCategory,
} from "../../../data/workflow";
import {
  BOARD_CREATE_DESCRIPTION,
  EMPTY_FILTERS,
  NO_SUBTASKS_LANE,
  UNASSIGNED,
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
  addColumnForStatus,
  type BoardColumnConfig,
  type BoardSwimlanes,
} from "../../../data/projects";

const GROUP_OPTIONS: { value: BoardSwimlanes; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "ASSIGNEE", label: "Assignee" },
  { value: "EPIC", label: "Epic" },
  { value: "PRIORITY", label: "Priority" },
  { value: "SUBTASKS", label: "Subtasks" },
  { value: "QUERY", label: "Queries" },
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

/** One status of a multi-status column, shown as a drop zone while dragging. */
function StatusZone({
  cellId,
  status,
  name,
  allowed,
}: {
  cellId: string;
  status: string;
  name: string;
  allowed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone${CELL_SEPARATOR}${cellId}${CELL_SEPARATOR}${status}`,
    data: { type: "status", cellId, status },
    disabled: !allowed,
  });
  return (
    <div
      ref={setNodeRef}
      className={[
        "board-status-zone",
        isOver ? "over" : "",
        allowed ? "" : "blocked",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {name}
    </div>
  );
}

function BoardCell({
  id,
  issues,
  collapsed = false,
  zones = [],
  children,
}: {
  id: string;
  issues: Issue[];
  collapsed?: boolean;
  zones?: { key: string; name: string; allowed: boolean }[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "cell" } });

  return (
    <SortableContext
      id={id}
      items={collapsed ? [] : issues.map((issue) => issue.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={[
          "board-cell",
          isOver ? "drag-over" : "",
          collapsed ? "collapsed" : "",
          zones.length > 0 ? "with-zones" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!collapsed && children}
        {zones.length > 0 && (
          <div className="board-status-zones">
            {zones.map((zone) => (
              <StatusZone
                key={zone.key}
                cellId={id}
                status={zone.key}
                name={zone.name}
                allowed={zone.allowed}
              />
            ))}
          </div>
        )}
      </div>
    </SortableContext>
  );
}

/** Status zones win while the pointer is over one; otherwise sort by corners. */
const boardCollision: CollisionDetection = (args) => {
  const zones = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) => container.data.current?.type === "status",
    ),
  });
  return zones.length > 0 ? zones : closestCorners(args);
};

/**
 * Jira's hover "+ Create" at the bottom of a column: a card with the summary,
 * a work type picker and Enter to create. Escape (or leaving it empty)
 * cancels.
 */
function ColumnCreate({
  types,
  defaultKind,
  projectId,
  onCreate,
}: {
  types: { key: IssueKind; name: string }[];
  defaultKind: IssueKind;
  projectId: string;
  onCreate: (title: string, kind: IssueKind) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<IssueKind>(defaultKind);
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
      await onCreate(title.trim(), kind);
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

  const kindName = types.find((type) => type.key === kind)?.name ?? "Work type";

  return (
    <form
      className="board-inline-create"
      onSubmit={handleSubmit}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        // Menus render in a portal, so only close when focus really left.
        const inMenu =
          next instanceof HTMLElement &&
          next.closest("[data-radix-popper-content-wrapper]") !== null;
        if ((next && event.currentTarget.contains(next)) || inMenu) return;
        if (!title.trim() && !isSubmitting) close();
      }}
    >
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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="board-inline-type"
              type="button"
              aria-label={`Work type: ${kindName}`}
              title={kindName}
            >
              <KindIcon kind={kind} projectId={projectId} />
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="planning-menu" align="start" sideOffset={4}>
              <DropdownMenu.RadioGroup
                value={kind}
                onValueChange={(value) => setKind(value as IssueKind)}
              >
                {types.map((type) => (
                  <DropdownMenu.RadioItem
                    key={type.key}
                    value={type.key}
                    className="planning-menu-item"
                  >
                    <KindIcon kind={type.key} projectId={projectId} />
                    {type.name}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button
          className="board-inline-submit"
          type="submit"
          disabled={isSubmitting || !title.trim()}
          aria-label="Create"
          title="Create (Enter)"
        >
          <CornerDownLeft size={14} aria-hidden="true" />
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
  } = useIssues();
  const { allProjects: projects, updateProject, refreshProjects } = useProjects();
  const { setProjectWorkflow } = useWorkflows();
  const { data: activeMember } = authClient.useActiveMember();
  // Read-only for workspace viewers and for people without edit access to
  // this project (Limited/Private projects, project Viewer role, archived).
  const isViewer =
    activeMember?.role === "viewer" ||
    projects.find((candidate) => candidate.id === projectId)?.permissions
      ?.canEdit === false;
  const meId = activeMember?.id ?? null;
  const planning = usePlanningActions();
  const { open: openIssue } = useSelectedIssue();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    boards,
    create: createBoard,
    update: updateBoard,
  } = useProjectBoards(projectId);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
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
  const [completeSprintId, setCompleteSprintId] = useState<string | null>(null);
  const [chosenSprintIds, setChosenSprintIds] = useState<string[]>([]);
  const [isReleaseOpen, setIsReleaseOpen] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const justDragged = useRef(false);
  const [now] = useState(() => new Date());
  const jqlContext = useJqlContext(now);
  const issueActions = useIssueMenuActions({
    onError: (text) => planning.setError(text),
    onNotice: setNotice,
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const project = projects.find((candidate) => candidate.id === projectId);
  const boardType = project?.boardType ?? "SCRUM";
  const boardId = searchParams.get("board") ?? DEFAULT_BOARD_ID;
  const currentBoard = boards?.find((board) => board.id === boardId) ?? null;
  const isDefaultBoard = !currentBoard || currentBoard.isDefault;
  // The default board follows the project (kept live by the provider).
  const config = isDefaultBoard
    ? (project?.boardConfig ?? DEFAULT_BOARD_CONFIG)
    : currentBoard.config;
  const canAdminBoards = project?.permissions?.canAdmin ?? false;
  const columns = resolveBoardColumns(config, boardType);
  const { view, update: updateView, toggleColumn } = useBoardView(projectId, boardId);
  const collapsedColumns = new Set(view.collapsedColumns);
  const quickFilters = compileQueries(config.quickFilters, now);
  const laneQueries = compileQueries(config.swimlaneQueries, now);
  const colorQueries = compileQueries(config.cardColors.queries, now);
  const groupOptions = GROUP_OPTIONS.filter(
    (option) => option.value !== "QUERY" || laneQueries.length > 0,
  );
  const swimlaneWanted = swimlaneChoice ?? config.swimlanes;
  const swimlanes: BoardSwimlanes =
    swimlaneWanted === "QUERY" && laneQueries.length === 0
      ? "NONE"
      : swimlaneWanted;

  const activeSprints = activeSprintsOf(cycles, projectId);
  const shownSprintIds = visibleSprintIds(activeSprints, chosenSprintIds);
  const shownSprints = activeSprints.filter((sprint) =>
    shownSprintIds.includes(sprint.id),
  );
  const activeSprint = shownSprints[0] ?? null;
  const futureSprints = futureSprintsOf(cycles, projectId);

  const projectIssues = planning
    .applyOverrides(allIssues.filter((issue) => issue.projectId === projectId))
    .sort(compareRank);
  const epics = projectIssues.filter((issue) => isEpicLevel(issue.kind));
  const boardKinds: IssueKind[] = workflow.types
    .filter((type) => type.level === 0)
    .map((type) => type.key);
  const createTypes = workflow.types
    .filter((type) => type.level === 0)
    .map((type) => ({ key: type.key, name: type.name }));
  const typeColor = (kind: string) =>
    workflow.types.find((type) => type.key === kind)?.color ?? null;

  const planningBoardIssues = projectIssues.filter((issue) => {
    if (!isPlanningIssue(issue)) return false;
    if (boardType === "SCRUM") {
      return !!issue.cycleId && shownSprintIds.includes(issue.cycleId);
    }
    return !isHiddenKanbanDone(issue, config.kanbanDoneDays, now);
  });
  // Subtask lanes need the subtasks of every parent on the board; subtasks
  // follow their parent's sprint, as in Jira.
  const onBoardParents = new Set(planningBoardIssues.map((issue) => issue.id));
  const boardIssues =
    swimlanes === "SUBTASKS"
      ? [
          ...planningBoardIssues,
          ...projectIssues.filter(
            (issue) =>
              isSubtaskLevel(issue.kind) &&
              !!issue.parentId &&
              onBoardParents.has(issue.parentId) &&
              !isHiddenKanbanDone(issue, config.kanbanDoneDays, now),
          ),
        ]
      : planningBoardIssues;
  // An extra board shows only the project work its JQL filter matches.
  const boardFilter = currentBoard?.filterJql
    ? searchIssuesWithJql(boardIssues, currentBoard.filterJql, jqlContext)
    : null;
  const filteredBoardIssues = boardFilter
    ? boardFilter.ok
      ? boardFilter.issues
      : []
    : boardIssues;

  const columnOf = (issue: Issue) =>
    columnForStatus(columns, issue.status, boardType);
  const onBoard = filteredBoardIssues.filter((issue) => columnOf(issue) !== null);
  const visible = onBoard.filter(
    (issue) =>
      matchesFilters(issue, filters, meId) &&
      matchesQuickFilters(issue, filters.quickFilterIds, quickFilters, jqlContext),
  );
  // Parents shown as subtask-lane headers aren't cards, so they don't count.
  const laneHeaderIds = new Set(
    swimlanes === "SUBTASKS"
      ? onBoard.flatMap((issue) =>
          isSubtaskLevel(issue.kind) && issue.parentId ? [issue.parentId] : [],
        )
      : [],
  );
  const lanes =
    swimlanes === "QUERY"
      ? groupQueryLanes(visible, laneQueries, jqlContext)
      : groupLanes(visible, swimlanes, members);
  const displayOf = (issue: Issue): CardDisplay => ({
    fields: config.cardFields,
    color: cardColorFor(issue, config.cardColors, {
      ctx: jqlContext,
      compiled: colorQueries,
      typeColor,
    }),
    daysInColumn:
      view.daysInColumn && issue.statusChangedAt
        ? Math.max(
            0,
            Math.floor((now.getTime() - Date.parse(issue.statusChangedAt)) / 86_400_000),
          )
        : null,
    compact: view.compact,
  });

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
    chosenStatus?: string,
  ) => {
    const sourceColumn = columnOf(issue);
    // A column with no mapped statuses has nowhere to transition the issue to.
    if (sourceColumn !== targetColumn.id && targetColumn.statuses.length === 0) {
      return;
    }
    // Jira: dropping on a column moves to the first of its statuses that the
    // workflow allows; a status drop zone names the status instead.
    let status: string | undefined;
    const wanted = chosenStatus === issue.status ? undefined : chosenStatus;
    if (wanted || (!chosenStatus && sourceColumn !== targetColumn.id)) {
      const allowed = new Set(
        allowedTransitions(workflow, issue.status).map(
          (transition) => transition.toKey,
        ),
      );
      status = wanted
        ? allowed.has(wanted)
          ? wanted
          : undefined
        : targetColumn.statuses.find((key) => allowed.has(key));
      if (!status) {
        planning.setError(
          `The workflow does not allow moving ${issue.id} from ${statusName(
            issue.status,
            workflow.statuses,
          )} to ${wanted ? statusName(wanted, workflow.statuses) : targetColumn.name}.`,
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
        {
          rank: ranks.get(issue.id) ?? issue.rank,
          ...(status ? { status, statusChangedAt: new Date().toISOString() } : {}),
        },
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

  // Columns the viewer can configure (Kanban's implied Backlog column isn't
  // stored, so it has no menu).
  const storedColumnIds = new Set(config.columns.map((column) => column.id));
  const extraBoard = currentBoard && !currentBoard.isDefault ? currentBoard : null;

  const saveColumns = async (
    change: (current: BoardColumnConfig[]) => BoardColumnConfig[],
  ) => {
    const next = { ...config, columns: change(config.columns) };
    if (extraBoard) {
      await updateBoard(extraBoard.id, { config: next });
    } else if (project && !(await updateProject(project.id, { boardConfig: next }))) {
      throw new Error("The board could not be saved");
    }
  };

  const reportError = (error: unknown) =>
    planning.setError(
      error instanceof Error ? error.message : "The board could not be saved",
    );

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    void saveColumns((current) => {
      const index = current.findIndex((column) => column.id === columnId);
      const swap = index + direction;
      if (index < 0 || swap < 0 || swap >= current.length) return current;
      const next = [...current];
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    }).catch(reportError);
  };

  /** Jira keeps the work: a deleted column's statuses join its neighbour. */
  const deleteColumn = async (columnId: string) => {
    await saveColumns((current) => {
      const index = current.findIndex((column) => column.id === columnId);
      if (index < 0 || current.length < 2) return current;
      const neighbour = index > 0 ? index - 1 : index + 1;
      const removed = current[index];
      return current
        .map((column, position) =>
          position === neighbour
            ? { ...column, statuses: [...column.statuses, ...removed.statuses] }
            : column,
        )
        .filter((column) => column.id !== columnId);
    });
    if (collapsedColumns.has(columnId)) toggleColumn(columnId);
  };

  const addColumn = async (name: string, category: StatusCategory) => {
    const updated = await apiRequest<ProjectWorkflow>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow/statuses`,
      {
        method: "POST",
        body: JSON.stringify({ name, category, boardColumn: !extraBoard }),
      },
    );
    setProjectWorkflow(projectId, updated);
    const created = updated.statuses.find(
      (status) => !workflow.statuses.some((known) => known.key === status.key),
    );
    if (extraBoard && created) {
      await updateBoard(extraBoard.id, {
        config: addColumnForStatus(config, created.key, name),
      });
    }
    // The default board's columns changed on the server with the status.
    await refreshProjects();
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
      | { type?: string; cellId?: string; status?: string }
      | undefined;
    const targetCell =
      overData?.type === "cell" ? String(over.id) : overData?.cellId;
    const onZone = overData?.type === "status";
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
      overId: overData?.type === "card" ? String(over.id) : null,
    });
    if (!target) return;
    void moveIssue(issue, targetColumn, target, onZone ? overData?.status : undefined);
  };

  /** Sprints and the backlog a board card can move to (Scrum only). */
  const destinationsFor = (issue: Issue): MoveDestination[] =>
    boardType === "SCRUM"
      ? [
          ...activeSprints,
          ...futureSprints,
        ]
          .filter((sprint) => sprint.id !== issue.cycleId)
          .map<MoveDestination>((sprint) => ({ id: sprint.id, label: sprint.name }))
          .concat([{ id: null, label: "Backlog" }])
      : [];

  const moveToSprint = (issue: Issue, cycleId: string | null) => {
    const last = projectIssues
      .filter(
        (candidate) =>
          candidate.cycleId === cycleId &&
          candidate.id !== issue.id &&
          isPlanningIssue(candidate),
      )
      .at(-1);
    const rank = last ? last.rank + 1 : issue.rank;
    void planning.rank(
      { issueIds: [issue.id], afterId: last?.id, cycleId },
      new Map([[issue.id, { rank, cycleId }]]),
    );
  };

  const handleCardAction = (issue: Issue, action: CardAction) => {
    if (action.type === "open") {
      openIssue(issue.id);
      return;
    }
    if (action.type === "move") {
      moveToSprint(issue, action.cycleId);
      return;
    }
    if (action.type !== "top" && action.type !== "bottom") {
      void issueActions.run(issue, action);
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
      action.type === "top"
        ? { beforeId: list[0], order: [issue.id, ...list] }
        : { afterId: list.at(-1), order: [...list, issue.id] },
    );
  };

  /** Creates in the column's first status and inherits the lane's grouping. */
  const handleCreate = async (
    title: string,
    column: BoardColumnConfig,
    lane: Lane,
    kind: IssueKind = defaultKind,
  ) => {
    const input: NewIssueInput = {
      title,
      description: BOARD_CREATE_DESCRIPTION,
      priority: "MEDIUM",
      kind,
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
    } else if (swimlanes === "SUBTASKS" && lane.id !== NO_SUBTASKS_LANE) {
      const subtaskKind = workflow.types.find((type) => type.level === -1)?.key;
      if (subtaskKind) {
        input.parentId = lane.id;
        input.kind = subtaskKind;
        input.cycleId = null;
      }
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
      ? shownSprints.length === 1
        ? shownSprints[0].name
        : shownSprints.length > 1
          ? `${shownSprints.length} active sprints`
          : `${project.key} board`
      : `${project.key} board`;

  const boardSwitcher = boards && (boards.length > 1 || canAdminBoards) && (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="board-switcher" type="button" aria-label="Switch board">
          {currentBoard?.name ?? `${project.key} board`}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="planning-menu" align="start" sideOffset={4}>
          <DropdownMenu.Label className="planning-menu-label">Boards in {project.name}</DropdownMenu.Label>
          {boards.map((board) => (
            <DropdownMenu.Item
              key={board.id}
              className="planning-menu-item"
              onSelect={() =>
                router.push(
                  board.isDefault
                    ? `/projects/${projectId}/board`
                    : `/projects/${projectId}/board?board=${encodeURIComponent(board.id)}`,
                )
              }
            >
              <span className="board-switcher-item">
                {board.name}
                {board.filterJql && <small>{board.filterJql}</small>}
              </span>
            </DropdownMenu.Item>
          ))}
          {canAdminBoards && (
            <>
              <DropdownMenu.Separator className="planning-menu-separator" />
              <DropdownMenu.Item
                className="planning-menu-item"
                onSelect={() => setBoardDialogOpen(true)}
              >
                <Plus size={14} aria-hidden="true" />
                Create board
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const boardDialog = boardDialogOpen && (
    <CreateBoardDialog
      projectKey={project.key}
      onClose={() => setBoardDialogOpen(false)}
      onCreate={async (input) => {
        const id = await createBoard(input);
        router.push(`/projects/${projectId}/board?board=${encodeURIComponent(id)}`);
      }}
    />
  );

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
            <Link
              href={`/projects/${projectId}/settings?tab=board&board=${encodeURIComponent(boardId)}`}
            >
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

  if (boardType === "SCRUM" && activeSprints.length === 0) {
    return (
      <div className="page board-page">
        <div className="board-titlebar">
          <h2 className="board-name">{boardName}</h2>
          {boardSwitcher}
          {boardMenu}
        </div>
        {boardDialog}
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
  const completeSprint =
    activeSprints.find((sprint) => sprint.id === completeSprintId) ?? null;
  const sprintIssuesOf = (sprintId: string) =>
    projectIssues.filter(
      (issue) => issue.cycleId === sprintId && isPlanningIssue(issue),
    );

  const canAssignToMe = !!meId && !isViewer;
  const track = (column: BoardColumnConfig, open: string) =>
    collapsedColumns.has(column.id) ? "44px" : open;
  const columnStyle = {
    "--board-columns": columns.length,
    "--board-template": columns
      .map((column) => track(column, "minmax(250px, 1fr)"))
      .join(" "),
    "--board-template-narrow": columns
      .map((column) => track(column, "minmax(240px, 80vw)"))
      .join(" "),
  } as React.CSSProperties;
  // Statuses the dragged card may move to, for the status drop zones.
  const dragTargets = activeIssue
    ? new Set([
        activeIssue.status,
        ...allowedTransitions(workflow, activeIssue.status).map(
          (transition) => transition.toKey,
        ),
      ])
    : null;
  const zonesFor = (column: BoardColumnConfig) =>
    dragTargets && column.statuses.length > 1 && !collapsedColumns.has(column.id)
      ? column.statuses.map((key) => ({
          key,
          name: statusName(key, workflow.statuses),
          allowed: dragTargets.has(key),
        }))
      : [];
  const deletingColumn =
    columns.find((column) => column.id === deleteColumnId) ?? null;
  const quickCount = QUICK_FILTERS.filter(([key]) => filters[key]).length +
    (filters.labelId ? 1 : 0);
  const groupLabel =
    groupOptions.find((option) => option.value === swimlanes)?.label ?? "None";
  const remaining = activeSprint ? daysRemaining(activeSprint.endDate) : 0;
  // Kanban "Release" lives on the last column when it only holds done statuses.
  const releaseColumn =
    boardType === "KANBAN"
      ? (() => {
          const last = columns.at(-1);
          return last &&
            last.statuses.length > 0 &&
            last.statuses.every((status) => isDoneStatus(status))
            ? last
            : null;
        })()
      : null;
  const releasable = releaseColumn
    ? onBoard.filter((issue) => columnOf(issue) === releaseColumn.id)
    : [];
  const toggleSprint = (sprintId: string) =>
    setChosenSprintIds(() => {
      const current = shownSprintIds;
      const next = toggleValue(current, sprintId);
      return next.length === 0 ? current : next;
    });

  return (
    <div
      className={
        showInsights ? "page board-page with-insights" : "page board-page"
      }
    >
      <div className="board-titlebar">
        <h2 className="board-name">{boardName}</h2>
        <div className="board-titlebar-actions">
          {activeSprint && shownSprints.length === 1 && (
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
          {!isViewer && shownSprints.length === 1 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCompleteSprintId(shownSprints[0].id)}
            >
              Complete sprint
            </button>
          )}
          {!isViewer && shownSprints.length > 1 && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="secondary-button" type="button">
                  Complete sprint
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="planning-menu" align="end" sideOffset={4}>
                  {shownSprints.map((sprint) => (
                    <DropdownMenu.Item
                      key={sprint.id}
                      className="planning-menu-item"
                      onSelect={() => setCompleteSprintId(sprint.id)}
                    >
                      {sprint.name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          {boardSwitcher}
          {boardMenu}
        </div>
      </div>
      {boardFilter && !boardFilter.ok && (
        <p className="form-submit-error" role="alert">
          This board&apos;s filter is no longer valid JQL: {boardFilter.error.message}. Fix it in
          the board settings.
        </p>
      )}
      {boardDialog}

      {boardType === "SCRUM" && activeSprints.length > 1 && (
        <div className="board-sprint-chips" role="group" aria-label="Active sprints">
          {activeSprints.map((sprint) => {
            const active = shownSprintIds.includes(sprint.id);
            return (
              <button
                key={sprint.id}
                type="button"
                className={active ? "planning-quick-filter active" : "planning-quick-filter"}
                aria-pressed={active}
                onClick={() => toggleSprint(sprint.id)}
              >
                {sprint.name}
              </button>
            );
          })}
        </div>
      )}

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
          <QuickFilterButtons
            filters={filters}
            queries={quickFilters}
            setFilters={setFilters}
          />
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
                  {groupOptions.map((option) => (
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
          <button
            className={showInsights ? "planning-filter active" : "planning-filter"}
            type="button"
            aria-pressed={showInsights}
            onClick={() => setShowInsights((current) => !current)}
          >
            <Lightbulb size={14} aria-hidden="true" />
            Insights
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="icon-button"
                type="button"
                aria-label="View settings"
                title="View settings"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="planning-menu"
                align="end"
                sideOffset={4}
              >
                <MenuLabel>View settings</MenuLabel>
                <FilterCheckItem
                  checked={view.daysInColumn}
                  onToggle={() =>
                    updateView((current) => ({
                      ...current,
                      daysInColumn: !current.daysInColumn,
                    }))
                  }
                >
                  Days in column
                </FilterCheckItem>
                <FilterCheckItem
                  checked={view.compact}
                  onToggle={() =>
                    updateView((current) => ({ ...current, compact: !current.compact }))
                  }
                >
                  Compact cards
                </FilterCheckItem>
                {collapsedColumns.size > 0 && (
                  <DropdownMenu.Item
                    className="planning-menu-item"
                    onSelect={() =>
                      updateView((current) => ({ ...current, collapsedColumns: [] }))
                    }
                  >
                    Expand all columns
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item className="planning-menu-item" asChild>
                  <Link
                    href={`/projects/${projectId}/settings?tab=board&board=${encodeURIComponent(boardId)}`}
                  >
                    Card layout and colours
                  </Link>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {planning.error && (
        <p className="form-submit-error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {planning.error}
        </p>
      )}
      {notice && (
        <p className="planning-notice" role="status">
          {notice}
        </p>
      )}

      <div className="board-body">
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollision}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board-scroll">
          <div className="board-grid-row">
          <div
            className={
              swimlanes === "NONE" ? "board-grid no-lanes" : "board-grid"
            }
            style={columnStyle}
          >
            {columns.map((column, index) => {
              const count = onBoard.filter(
                (issue) =>
                  columnOf(issue) === column.id && !laneHeaderIds.has(issue.id),
              ).length;
              const stored = storedColumnIds.has(column.id);
              const storedIndex = config.columns.findIndex(
                (candidate) => candidate.id === column.id,
              );
              return (
                <BoardColumnHeader
                  key={column.id}
                  column={column}
                  count={count}
                  isDone={
                    column.statuses.length > 0 &&
                    column.statuses.every((status) => isDoneStatus(status))
                  }
                  overLimit={column.wipLimit !== null && count > column.wipLimit}
                  collapsed={collapsedColumns.has(column.id)}
                  canConfigure={canAdminBoards && stored}
                  canMoveLeft={storedIndex > 0 && index > 0}
                  canMoveRight={storedIndex >= 0 && storedIndex < config.columns.length - 1}
                  canDelete={config.columns.length > 1}
                  onToggleCollapse={() => toggleColumn(column.id)}
                  onRename={(name) =>
                    saveColumns((current) =>
                      current.map((candidate) =>
                        candidate.id === column.id ? { ...candidate, name } : candidate,
                      ),
                    )
                  }
                  onSetLimit={(wipLimit) =>
                    saveColumns((current) =>
                      current.map((candidate) =>
                        candidate.id === column.id ? { ...candidate, wipLimit } : candidate,
                      ),
                    )
                  }
                  onMove={(direction) => moveColumn(column.id, direction)}
                  onDelete={() => setDeleteColumnId(column.id)}
                >
                  {releaseColumn?.id === column.id && !isViewer && (
                    <button
                      type="button"
                      className="board-column-release"
                      disabled={releasable.length === 0}
                      title={
                        releasable.length === 0
                          ? "Nothing to release yet"
                          : "Release the done work items as a version"
                      }
                      onClick={() => setIsReleaseOpen(true)}
                    >
                      <Package size={12} aria-hidden="true" />
                      Release
                    </button>
                  )}
                </BoardColumnHeader>
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
                        <BoardCell
                          key={id}
                          id={id}
                          issues={items}
                          collapsed={collapsedColumns.has(column.id)}
                          zones={zonesFor(column)}
                        >
                          {items.map((issue) => (
                            <SortableBoardCard
                              key={issue.id}
                              issue={issue}
                              cellId={id}
                              isViewer={isViewer}
                              canAssignToMe={canAssignToMe}
                              meId={meId}
                              destinations={destinationsFor(issue)}
                              display={displayOf(issue)}
                              onAction={handleCardAction}
                              onOpen={(target) => openIssue(target.id)}
                              shouldIgnoreClick={() => justDragged.current}
                            />
                          ))}
                          {!isViewer && column.statuses.length > 0 && (
                            <ColumnCreate
                              types={createTypes}
                              defaultKind={defaultKind}
                              projectId={projectId}
                              onCreate={(title, kind) =>
                                handleCreate(title, column, lane, kind)
                              }
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
          {canAdminBoards && !isViewer && <BoardAddColumn onCreate={addColumn} />}
          </div>
        </div>
        <DragOverlay>
          {activeIssue && (
            <div
              className={
                displayOf(activeIssue).color
                  ? "board-card planning-card overlay colored"
                  : "board-card planning-card overlay"
              }
              style={
                {
                  "--card-color": displayOf(activeIssue).color ?? undefined,
                } as React.CSSProperties
              }
            >
              <BoardCardBody
                issue={activeIssue}
                isViewer={isViewer}
                canAssignToMe={false}
                display={displayOf(activeIssue)}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {showInsights && (
        <InsightsPanel
          projectId={projectId}
          sprints={boardType === "SCRUM" ? shownSprints : []}
          issues={boardIssues}
          cycles={cycles}
          onClose={() => setShowInsights(false)}
        />
      )}
      </div>

      {deletingColumn && (
        <ConfirmDialog
          title={`Delete the ${deletingColumn.name} column?`}
          body={
            deletingColumn.statuses.length > 0
              ? "Its statuses and work items move to the neighbouring column. The workflow statuses stay."
              : "The column has no statuses, so no work items move."
          }
          confirmLabel="Delete column"
          onClose={() => setDeleteColumnId(null)}
          onConfirm={async () => {
            try {
              await deleteColumn(deletingColumn.id);
            } catch (error) {
              reportError(error);
            }
            setDeleteColumnId(null);
          }}
        />
      )}

      {completeSprint && (
        <CompleteSprintDialog
          key={completeSprint.id}
          sprint={completeSprint}
          issues={sprintIssuesOf(completeSprint.id)}
          futureSprints={futureSprints}
          open
          onOpenChange={(open) => !open && setCompleteSprintId(null)}
          onComplete={(destination) =>
            planning.completeSprint(completeSprint.id, destination)
          }
        />
      )}
      {isReleaseOpen && (
        <KanbanReleaseDialog
          projectId={projectId}
          issues={releasable}
          onOpenChange={setIsReleaseOpen}
        />
      )}
      {issueActions.dialogs}
    </div>
  );
}

function CreateBoardDialog({
  projectKey,
  onClose,
  onCreate,
}: {
  projectKey: string;
  onClose: () => void;
  onCreate: (input: { name: string; filterJql: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [filterJql, setFilterJql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Give the board a name of at least 2 characters.");
      return;
    }
    const jql = filterJql.trim();
    if (jql) {
      const parsed = parseJql(jql, new Date(), { customFields: "any" });
      if (!parsed.ok) {
        setError(`The filter is not valid JQL: ${parsed.error.message}`);
        return;
      }
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), filterJql: jql || null });
      onClose();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "The board could not be created",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Create board"
      description={`A board shows ${projectKey} work with its own columns, swimlanes and quick filters. Use a filter to show only part of the project.`}
    >
      <form onSubmit={submit}>
        <label className="form-field">
          <span>Board name</span>
          <input
            value={name}
            maxLength={60}
            placeholder="e.g. Payments team"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Filter (JQL, optional)</span>
          <input
            value={filterJql}
            maxLength={2000}
            placeholder="component = Payments"
            onChange={(event) => setFilterJql(event.target.value)}
          />
        </label>
        <FormError error={error} />
        <DialogFooter onCancel={onClose} submitLabel="Create board" isSubmitting={isSubmitting} />
      </form>
    </PlanningDialog>
  );
}
