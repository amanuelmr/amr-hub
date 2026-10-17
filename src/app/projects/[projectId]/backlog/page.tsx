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
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  MoreHorizontal,
  MoveRight,
  PanelLeft,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { useSelectedIssue } from "../../../components/issue/selectedIssue";
import { IssueDetailContainer } from "../../../components/issue/IssueDetailView";
import {
  BacklogRowBody,
  SortableBacklogRow,
  type MoveDestination,
  type RowAction,
} from "../../../components/board/BacklogRow";
import {
  AssigneeStack,
  EpicFilter,
  PlanningSearch,
  TypeFilter,
  hasActiveFilters,
  toggleValue,
} from "../../../components/board/FilterControls";
import {
  CompleteSprintDialog,
  DeleteSprintDialog,
  EditSprintDialog,
  StartSprintDialog,
} from "../../../components/board/SprintDialogs";
import { usePlanningActions } from "../../../components/board/sprintApi";
import {
  BACKLOG_CREATE_DESCRIPTION,
  EMPTY_FILTERS,
  compareRank,
  computeDropTarget,
  epicColor,
  formatShortDate,
  isPlanningIssue,
  isStaleDone,
  matchesFilters,
  optimisticRanks,
  pointBreakdown,
  type DropTarget,
  type IssueFilters,
} from "../../../components/board/boardModel";
import type {
  Cycle,
  Issue,
  IssueKind,
  IssueStatus,
} from "../../../data/issues";
import { isEpicLevel } from "../../../data/workflow";
import { useWorkflow } from "../../../WorkflowProvider";

const BACKLOG_KEY = "backlog";
const SECTION_PREFIX = "section::";

type Section = {
  key: string;
  cycleId: string | null;
  title: string;
  sprint: Cycle | null;
  allIssues: Issue[];
  issues: Issue[];
};

type DialogState = {
  type: "start" | "complete" | "edit" | "delete";
  sprint: Cycle;
} | null;

function sectionDroppableId(key: string) {
  return `${SECTION_PREFIX}${key}`;
}

function SectionDropZone({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const id = sectionDroppableId(section.key);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "section", sectionId: section.key },
  });

  return (
    <SortableContext
      id={id}
      items={section.issues.map((issue) => issue.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={isOver ? "backlog-rows drag-over" : "backlog-rows"}
      >
        {children}
      </div>
    </SortableContext>
  );
}

function InlineRowCreate({
  onCreate,
  placeholder = "What needs to be done?",
  label = "Create",
  withKind = true,
  kinds = [],
}: {
  onCreate: (title: string, kind: IssueKind) => Promise<void>;
  placeholder?: string;
  label?: string;
  withKind?: boolean;
  kinds?: { key: IssueKind; name: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kindChoice, setKind] = useState<IssueKind | null>(null);
  const kind =
    kindChoice && kinds.some((option) => option.key === kindChoice)
      ? kindChoice
      : (kinds.find((option) => option.key === "STORY") ?? kinds[0])?.key ??
        "TASK";
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return (
      <button
        className="backlog-create-trigger"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Plus size={14} aria-hidden="true" />
        {label}
      </button>
    );
  }

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

  return (
    <form className="backlog-create" onSubmit={handleSubmit}>
      {withKind && (
        <select
          className="planning-select"
          aria-label="Issue type"
          value={kind}
          onChange={(event) => setKind(event.target.value as IssueKind)}
        >
          {kinds.map((option) => (
            <option key={option.key} value={option.key}>
              {option.name}
            </option>
          ))}
        </select>
      )}
      <input
        value={title}
        maxLength={255}
        placeholder={placeholder}
        aria-label={label}
        autoFocus
        disabled={isSubmitting}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
        }}
      />
      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create"}
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="Cancel"
        onClick={() => setIsOpen(false)}
      >
        <X size={14} aria-hidden="true" />
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}

function PointPills({ issues }: { issues: Issue[] }) {
  const points = pointBreakdown(issues);
  return (
    <span className="backlog-point-pills" aria-label="Story points by status">
      <span
        className="backlog-pill todo"
        title={`To do: ${points.todo} points`}
      >
        {points.todo}
      </span>
      <span
        className="backlog-pill progress"
        title={`In progress: ${points.inProgress} points`}
      >
        {points.inProgress}
      </span>
      <span className="backlog-pill done" title={`Done: ${points.done} points`}>
        {points.done}
      </span>
    </span>
  );
}

function workItemCount(count: number) {
  return `(${count} ${count === 1 ? "work item" : "work items"})`;
}

export default function ProjectBacklogPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const {
    issues: allIssues,
    cycles,
    members,
    isLoading,
    createIssue,
    updateIssue,
  } = useIssues();
  const { projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const meId = activeMember?.id ?? null;
  const planning = usePlanningActions();
  const workflow = useWorkflow(projectId);
  const standardKinds = workflow.types.filter((type) => type.level === 0);
  const epicKind = workflow.types.find((type) => type.level === 1)?.key ?? null;
  const {
    selectedIssueId,
    open: openIssue,
    close: closeIssue,
  } = useSelectedIssue();

  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const [showEpics, setShowEpics] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<{ id: string; section: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isCreatingSprint, setIsCreatingSprint] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (isLoading) return <WorkspaceLoading label="backlog" />;

  const project = projects.find((candidate) => candidate.id === projectId);
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

  const projectIssues = planning
    .applyOverrides(allIssues.filter((issue) => issue.projectId === projectId))
    .sort(compareRank);
  const epics = projectIssues.filter((issue) => isEpicLevel(issue.kind));
  const planningIssues = projectIssues.filter(isPlanningIssue);
  const projectSprints = cycles.filter(
    (cycle) => cycle.projectId === projectId,
  );
  const activeSprint =
    projectSprints.find((cycle) => cycle.state === "ACTIVE") ?? null;
  const futureSprints = projectSprints
    .filter((cycle) => (cycle.state ?? "FUTURE") === "FUTURE")
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
  const openSprintIds = new Set(
    [activeSprint, ...futureSprints].filter(Boolean).map((cycle) => cycle!.id),
  );

  const visible = (issue: Issue) => matchesFilters(issue, filters, meId);
  const sections: Section[] = [
    ...[activeSprint, ...futureSprints]
      .filter((cycle): cycle is Cycle => cycle !== null)
      .map((sprint) => {
        const sprintIssues = planningIssues.filter(
          (issue) => issue.cycleId === sprint.id,
        );
        return {
          key: sprint.id,
          cycleId: sprint.id,
          title: sprint.name,
          sprint,
          allIssues: sprintIssues,
          issues: sprintIssues.filter(visible),
        };
      }),
  ];
  const backlogIssues = planningIssues.filter(
    (issue) =>
      (issue.cycleId === null || !openSprintIds.has(issue.cycleId)) &&
      !isStaleDone(issue),
  );
  sections.push({
    key: BACKLOG_KEY,
    cycleId: null,
    title: "Backlog",
    sprint: null,
    allIssues: backlogIssues,
    issues: backlogIssues.filter(visible),
  });

  const sectionOf = (issueId: string) =>
    sections.find((section) =>
      section.issues.some((issue) => issue.id === issueId),
    );
  const sectionByKey = (key: string) =>
    sections.find((section) => section.key === key);
  const visibleOrder = sections.flatMap((section) =>
    section.issues.map((issue) => issue.id),
  );
  const orderedSelection = visibleOrder.filter((id) => selected.includes(id));
  const destinations: MoveDestination[] = sections.map((section) => ({
    id: section.cycleId,
    label: section.title,
  }));
  const assigneeMembers = members.filter((member) =>
    planningIssues.some((issue) => issue.assignee?.id === member.id),
  );

  const rankOf = (id: string) =>
    projectIssues.find((issue) => issue.id === id)?.rank ?? 0;

  const moveBlock = (
    movedIds: string[],
    section: Section,
    target: Pick<DropTarget, "afterId" | "beforeId">,
  ) => {
    if (movedIds.length === 0) return;
    const ranks = optimisticRanks({ ...target, order: [] }, movedIds, rankOf);
    const optimistic = new Map<string, Partial<Issue>>(
      movedIds.map((id) => [
        id,
        { rank: ranks.get(id) ?? rankOf(id), cycleId: section.cycleId },
      ]),
    );
    void planning.rank(
      {
        issueIds: movedIds,
        afterId: target.afterId,
        beforeId: target.beforeId,
        cycleId: section.cycleId,
      },
      optimistic,
    );
  };

  const moveToSection = (movedIds: string[], cycleId: string | null) => {
    const section = sections.find((candidate) => candidate.cycleId === cycleId);
    if (!section) return;
    const remaining = section.allIssues
      .map((issue) => issue.id)
      .filter((id) => !movedIds.includes(id));
    moveBlock(movedIds, section, { afterId: remaining.at(-1) });
    setSelected([]);
  };

  const handleSelect = (issue: Issue, event: React.MouseEvent) => {
    const section = sectionOf(issue.id);
    if (!section) return;
    if (event.shiftKey && anchor.current?.section === section.key) {
      const ids = section.issues.map((item) => item.id);
      const from = ids.indexOf(anchor.current.id);
      const to = ids.indexOf(issue.id);
      const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
      setSelected((current) => [...new Set([...current, ...range])]);
      return;
    }
    anchor.current = { id: issue.id, section: section.key };
    if (event.metaKey || event.ctrlKey) {
      setSelected((current) => toggleValue(current, issue.id));
      return;
    }
    // A plain click selects the row and opens it in the side panel (Jira).
    setSelected([issue.id]);
    if (selectedIssueId !== issue.id) openIssue(issue.id);
  };

  const handleStatusChange = (issue: Issue, status: IssueStatus) => {
    void updateIssue(issue.id, { status });
  };

  const handleRowAction = (issue: Issue, action: RowAction) => {
    const section = sectionOf(issue.id);
    if (!section) return;
    if (action.type === "move") {
      moveToSection([issue.id], action.cycleId);
      return;
    }
    const ids = section.allIssues
      .map((item) => item.id)
      .filter((id) => id !== issue.id);
    if (ids.length === 0) return;
    moveBlock(
      [issue.id],
      section,
      action.type === "top" ? { beforeId: ids[0] } : { afterId: ids.at(-1) },
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    if (!selected.includes(id)) setSelected([]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || isViewer) return;
    const id = String(active.id);
    const movedIds =
      selected.includes(id) && orderedSelection.length > 1
        ? orderedSelection
        : [id];
    const overData = over.data.current as
      { type?: string; sectionId?: string } | undefined;
    const section = overData?.sectionId
      ? sectionByKey(overData.sectionId)
      : undefined;
    if (!section) return;

    const target = computeDropTarget({
      list: section.issues.map((issue) => issue.id),
      movedIds,
      activeId: id,
      overId: overData?.type === "section" ? null : String(over.id),
    });
    if (!target) return;
    moveBlock(movedIds, section, target);
  };

  const handleCreate = async (
    title: string,
    kind: IssueKind,
    cycleId: string | null,
  ) => {
    await createIssue({
      title,
      description: BACKLOG_CREATE_DESCRIPTION,
      priority: "MEDIUM",
      kind,
      assigneeId: null,
      dueDate: null,
      estimate: null,
      projectId,
      cycleId,
      labelIds: [],
      ...(filters.epicId && !isEpicLevel(kind)
        ? { parentId: filters.epicId }
        : {}),
    });
  };

  const handleCreateSprint = async () => {
    setIsCreatingSprint(true);
    try {
      await planning.createSprint(projectId);
    } catch (error) {
      planning.setError(
        error instanceof Error
          ? error.message
          : "The sprint could not be created",
      );
    } finally {
      setIsCreatingSprint(false);
    }
  };

  const toggleSection = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const activeIssue = activeId
    ? (projectIssues.find((issue) => issue.id === activeId) ?? null)
    : null;
  const dragCount =
    activeId && selected.includes(activeId) ? orderedSelection.length : 1;
  const topFutureId = activeSprint ? null : (futureSprints[0]?.id ?? null);

  const isFiltered = hasActiveFilters(filters);

  const sprintMenu = (sprint: Cycle) => (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="icon-button"
          type="button"
          aria-label={`${sprint.name} actions`}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="planning-menu"
          align="end"
          sideOffset={4}
        >
          <DropdownMenu.Item
            className="planning-menu-item"
            onSelect={() => setDialog({ type: "edit", sprint })}
          >
            <Pencil size={14} aria-hidden="true" />
            Edit sprint
          </DropdownMenu.Item>
          {sprint.state !== "ACTIVE" && (
            <DropdownMenu.Item
              className="planning-menu-item danger"
              onSelect={() => setDialog({ type: "delete", sprint })}
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete sprint
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const createSprintButton = !isViewer && (
    <button
      className="secondary-button"
      type="button"
      disabled={isCreatingSprint}
      onClick={() => void handleCreateSprint()}
    >
      {isCreatingSprint ? "Creating..." : "Create sprint"}
    </button>
  );

  return (
    <div
      className={
        selectedIssueId
          ? "page backlog-page with-issue-panel"
          : "page backlog-page"
      }
    >
      <div
        className="planning-toolbar"
        role="toolbar"
        aria-label="Backlog filters"
      >
        <div className="planning-toolbar-start">
          <PlanningSearch
            label="Search backlog"
            value={filters.query}
            onChange={(query) =>
              setFilters((current) => ({ ...current, query }))
            }
          />
          <AssigneeStack
            members={assigneeMembers}
            includeUnassigned={planningIssues.some((issue) => !issue.assignee)}
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
            kinds={standardKinds.map((type) => type.key)}
            filters={filters}
            setFilters={setFilters}
            projectId={projectId}
          />
          {isFiltered && (
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
          <button
            className={showEpics ? "planning-filter active" : "planning-filter"}
            type="button"
            aria-pressed={showEpics}
            onClick={() => setShowEpics((current) => !current)}
          >
            <PanelLeft size={14} aria-hidden="true" />
            Epic panel
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="icon-button"
                type="button"
                aria-label="Backlog actions"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="planning-menu"
                align="end"
                sideOffset={4}
              >
                {!isViewer && (
                  <DropdownMenu.Item
                    className="planning-menu-item"
                    disabled={isCreatingSprint}
                    onSelect={() => void handleCreateSprint()}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Create sprint
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item className="planning-menu-item" asChild>
                  <Link href={`/projects/${projectId}/settings?tab=board`}>
                    <Settings2 size={14} aria-hidden="true" />
                    Board settings
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

      {orderedSelection.length > 1 && !isViewer && (
        <div className="backlog-bulk-bar" role="status">
          <strong>{orderedSelection.length} work items selected</strong>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="secondary-button" type="button">
                <MoveRight size={14} aria-hidden="true" />
                Move to
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="planning-menu" sideOffset={4}>
                {destinations.map((destination) => (
                  <DropdownMenu.Item
                    key={destination.id ?? BACKLOG_KEY}
                    className="planning-menu-item"
                    onSelect={() =>
                      moveToSection(orderedSelection, destination.id)
                    }
                  >
                    {destination.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button
            className="text-button"
            type="button"
            onClick={() => setSelected([])}
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="backlog-split">
        <div
          className={showEpics ? "backlog-layout with-epics" : "backlog-layout"}
        >
          {showEpics && (
            <aside className="backlog-epics" aria-label="Epics">
              <div className="backlog-epics-header">
                <h2>Epics</h2>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close epic panel"
                  onClick={() => setShowEpics(false)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className={
                  filters.epicId === null
                    ? "backlog-epic-all active"
                    : "backlog-epic-all"
                }
                onClick={() =>
                  setFilters((current) => ({ ...current, epicId: null }))
                }
              >
                All work items
              </button>
              {epics.length === 0 && (
                <p className="field-meta">No epics in this project yet.</p>
              )}
              <ul>
                {epics.map((epic) => {
                  const percent = epic.childCount
                    ? Math.round((epic.doneChildCount / epic.childCount) * 100)
                    : 0;
                  const isActive = filters.epicId === epic.id;
                  return (
                    <li key={epic.id}>
                      <button
                        type="button"
                        className={
                          isActive ? "backlog-epic active" : "backlog-epic"
                        }
                        aria-pressed={isActive}
                        style={
                          {
                            "--epic-color": epicColor(epic.id),
                          } as React.CSSProperties
                        }
                        onClick={() =>
                          setFilters((current) => ({
                            ...current,
                            epicId: isActive ? null : epic.id,
                          }))
                        }
                      >
                        <span className="backlog-epic-title">
                          <Zap size={12} aria-hidden="true" />
                          {epic.title}
                        </span>
                        <span
                          className="backlog-epic-progress"
                          aria-hidden="true"
                        >
                          <i style={{ width: `${percent}%` }} />
                        </span>
                        <small>
                          {epic.doneChildCount}/{epic.childCount} done ·{" "}
                          {epic.id}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!isViewer && epicKind && (
                <InlineRowCreate
                  label="Create epic"
                  placeholder="Epic name"
                  withKind={false}
                  onCreate={(title) => handleCreate(title, epicKind, null)}
                />
              )}
            </aside>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="backlog-sections">
              {sections.map((section) => {
                const isCollapsed = collapsed.has(section.key);
                const sprint = section.sprint;
                const totals = pointBreakdown(section.allIssues);
                const overCapacity =
                  !!sprint &&
                  sprint.capacity > 0 &&
                  totals.total > sprint.capacity;
                return (
                  <section
                    key={section.key}
                    className={[
                      "backlog-section",
                      sprint ? "sprint" : "backlog",
                      sprint?.state === "ACTIVE" ? "active-sprint" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={section.title}
                  >
                    <header className="backlog-section-header">
                      <button
                        type="button"
                        className="backlog-section-toggle"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleSection(section.key)}
                      >
                        {isCollapsed ? (
                          <ChevronRight size={16} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={16} aria-hidden="true" />
                        )}
                        <strong>{section.title}</strong>
                        {sprint && (
                          <span className="backlog-section-dates">
                            {formatShortDate(sprint.startDate)} –{" "}
                            {formatShortDate(sprint.endDate)}
                          </span>
                        )}
                        <span className="backlog-section-count">
                          {workItemCount(section.allIssues.length)}
                        </span>
                      </button>
                      {sprint?.state === "ACTIVE" && (
                        <span className="backlog-sprint-state">Active</span>
                      )}
                      <span className="backlog-section-end">
                        {overCapacity && sprint && (
                          <span
                            className="backlog-capacity-warning"
                            title={`Capacity is ${sprint.capacity} points; ${totals.total} planned`}
                          >
                            <TriangleAlert size={13} aria-hidden="true" />
                            {totals.total}/{sprint.capacity}
                          </span>
                        )}
                        <PointPills issues={section.allIssues} />
                        {sprint && !isViewer && (
                          <>
                            {sprint.id === topFutureId && (
                              <button
                                className="secondary-button"
                                type="button"
                                disabled={section.allIssues.length === 0}
                                title={
                                  section.allIssues.length === 0
                                    ? "Add work items to this sprint before starting it"
                                    : undefined
                                }
                                onClick={() =>
                                  setDialog({ type: "start", sprint })
                                }
                              >
                                Start sprint
                              </button>
                            )}
                            {sprint.state === "ACTIVE" && (
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() =>
                                  setDialog({ type: "complete", sprint })
                                }
                              >
                                Complete sprint
                              </button>
                            )}
                            {sprintMenu(sprint)}
                          </>
                        )}
                        {!sprint && createSprintButton}
                      </span>
                    </header>
                    {sprint?.goal && !isCollapsed && (
                      <p className="backlog-sprint-goal">{sprint.goal}</p>
                    )}
                    {!isCollapsed && (
                      <>
                        <SectionDropZone section={section}>
                          {section.issues.map((issue) => (
                            <SortableBacklogRow
                              key={issue.id}
                              issue={issue}
                              sectionId={section.key}
                              isSelected={selected.includes(issue.id)}
                              isOpen={selectedIssueId === issue.id}
                              isViewer={isViewer}
                              destinations={destinations.filter(
                                (destination) =>
                                  destination.id !== section.cycleId,
                              )}
                              onSelect={handleSelect}
                              onAction={handleRowAction}
                              onStatusChange={handleStatusChange}
                            />
                          ))}
                          {section.issues.length === 0 && (
                            <p className="backlog-empty">
                              {section.allIssues.length > 0
                                ? "No work items match these filters."
                                : sprint
                                  ? "Plan a sprint by dragging work items from the backlog here."
                                  : "Your backlog is empty."}
                            </p>
                          )}
                        </SectionDropZone>
                        {!isViewer && (
                          <InlineRowCreate
                            kinds={standardKinds}
                            onCreate={(title, kind) =>
                              handleCreate(title, kind, section.cycleId)
                            }
                          />
                        )}
                      </>
                    )}
                  </section>
                );
              })}
            </div>
            <DragOverlay>
              {activeIssue && (
                <div className="backlog-row overlay">
                  <BacklogRowBody
                    issue={activeIssue}
                    selectionCount={dragCount}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
        {selectedIssueId && (
          <aside className="backlog-issue-panel" aria-label="Work item details">
            <IssueDetailContainer
              issueId={selectedIssueId}
              variant="panel"
              onClose={closeIssue}
            />
          </aside>
        )}
      </div>

      {dialog?.type === "start" && (
        <StartSprintDialog
          key={dialog.sprint.id}
          sprint={dialog.sprint}
          issueCount={
            planningIssues.filter((issue) => issue.cycleId === dialog.sprint.id)
              .length
          }
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onStart={(fields) => planning.startSprint(dialog.sprint.id, fields)}
        />
      )}
      {dialog?.type === "complete" && (
        <CompleteSprintDialog
          key={dialog.sprint.id}
          sprint={dialog.sprint}
          issues={planningIssues.filter(
            (issue) => issue.cycleId === dialog.sprint.id,
          )}
          futureSprints={futureSprints}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onComplete={(destination) =>
            planning.completeSprint(dialog.sprint.id, destination)
          }
        />
      )}
      {dialog?.type === "edit" && (
        <EditSprintDialog
          key={dialog.sprint.id}
          sprint={dialog.sprint}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onSave={(fields) => planning.updateSprint(dialog.sprint.id, fields)}
        />
      )}
      {dialog?.type === "delete" && (
        <DeleteSprintDialog
          key={dialog.sprint.id}
          sprint={dialog.sprint}
          issueCount={
            projectIssues.filter((issue) => issue.cycleId === dialog.sprint.id)
              .length
          }
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onDelete={() => planning.deleteSprint(dialog.sprint.id)}
        />
      )}
    </div>
  );
}
