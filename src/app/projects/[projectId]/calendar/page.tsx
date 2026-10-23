"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addMonths, addWeeks, format, isSameMonth, subMonths, subWeeks } from "date-fns";
import * as Popover from "@radix-ui/react-popover";
import { CalendarX2, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";
import { KindIcon, StatusBadge } from "../../../components/IssueVisuals";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { selectedIssueHref } from "../../../components/issue/selectedIssue";
import {
  ISSUE_KINDS,
  KIND_LABELS,
  type Cycle,
  type Issue,
  type IssueKind,
} from "../../../data/issues";
import {
  buildMonthWeeks,
  buildWeek,
  dateOfKey,
  parseCalendarPrefs,
  weekdayNames,
  type CalendarPrefs,
  dayKeyOf,
  issueRange,
  layoutWeek,
  moveToDay,
  sprintForDay,
} from "./calendarMath";
import { isDoneStatus, statusCategory } from "../../../data/workflow";
import { PRIORITY_COLORS } from "../../../components/board/boardRules";
import { useStoredPrefs } from "../../../components/useStoredPrefs";
import { useWorkflow } from "../../../WorkflowProvider";

/** How chips look: colour source and whether the key shows. */
type ChipDisplay = { color: string | null; showKey: boolean };
const LANE_HEIGHT = 24;
const DAY_HEADER_HEIGHT = 26;
const UNSCHEDULED_ID = "unscheduled";

/** Issue links open the work item on top of the calendar. */
function useIssueHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (issueId: string) => selectedIssueHref(pathname, searchParams, issueId);
}

function categoryClass(issue: Issue) {
  return `calendar-cat-${statusCategory(issue.status).toLowerCase()}`;
}

export default function CalendarPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { issues, cycles, members, isLoading, updateIssue } = useIssues();
  const { allProjects: projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  // Read-only for workspace viewers and for people without edit access to
  // this project (Limited/Private projects, project Viewer role, archived).
  const isViewer =
    activeMember?.role === "viewer" ||
    projects.find((candidate) => candidate.id === projectId)?.permissions
      ?.canEdit === false;
  const project = projects.find((candidate) => candidate.id === projectId);
  const issueHref = useIssueHref();

  const [month, setMonth] = useState(() => new Date());
  const { value: view, update: updateView } = useStoredPrefs(
    `amr.calendar.${projectId}`,
    parseCalendarPrefs,
  );
  const workflow = useWorkflow(projectId);
  const chipDisplay = (issue: Issue): ChipDisplay => ({
    showKey: view.showKey,
    color:
      view.colorBy === "priority"
        ? PRIORITY_COLORS[issue.priority]
        : view.colorBy === "type"
          ? (workflow.types.find((type) => type.key === issue.kind)?.color ?? null)
          : null,
  });
  const isWeek = view.mode === "week";
  const step = (direction: -1 | 1) =>
    setMonth((current) =>
      isWeek
        ? direction < 0
          ? subWeeks(current, 1)
          : addWeeks(current, 1)
        : direction < 0
          ? subMonths(current, 1)
          : addMonths(current, 1),
    );
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState<"ALL" | IssueKind>("ALL");
  const [query, setQuery] = useState("");
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const todayKey = dayKeyOf(new Date());
  const weeks = useMemo(
    () => (isWeek ? buildWeek(month, view.weekStartsOn) : buildMonthWeeks(month, view.weekStartsOn)),
    [isWeek, month, view.weekStartsOn],
  );
  const title = isWeek
    ? `${format(dateOfKey(weeks[0][0]), "MMM d")} – ${format(dateOfKey(weeks[0][6]), "MMM d, yyyy")}`
    : format(month, "MMMM yyyy");

  const projectIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          issue.projectId === projectId &&
          (!query.trim() ||
            `${issue.id} ${issue.title}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())) &&
          (kindFilter === "ALL" || issue.kind === kindFilter) &&
          (assigneeFilter === "ALL" ||
            (assigneeFilter === "UNASSIGNED"
              ? !issue.assignee
              : issue.assignee?.id === assigneeFilter)),
      ),
    [issues, projectId, kindFilter, assigneeFilter, query],
  );
  const sprints = useMemo(
    () => cycles.filter((cycle) => cycle.projectId === projectId),
    [cycles, projectId],
  );

  const scheduled = useMemo(
    () =>
      projectIssues
        .map((issue) => ({ item: issue, range: issueRange(issue) }))
        .filter(
          (entry): entry is { item: Issue; range: NonNullable<typeof entry.range> } =>
            entry.range !== null,
        ),
    [projectIssues],
  );
  const unscheduled = useMemo(
    () =>
      projectIssues
        .filter((issue) => !issue.dueDate && !isDoneStatus(issue.status))
        .sort((left, right) => left.rank - right.rank),
    [projectIssues],
  );
  const agenda = useMemo(() => {
    const byDay = new Map<string, Issue[]>();
    for (const { item, range } of scheduled) {
      if (!isSameMonth(dateOfKey(range.end), month)) continue;
      byDay.set(range.end, [...(byDay.get(range.end) ?? []), item]);
    }
    return [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [scheduled, month]);

  const activeIssue = activeIssueId
    ? issues.find((issue) => issue.id === activeIssueId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveIssueId(String(event.active.data.current?.issueId ?? ""));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveIssueId(null);
    const issueId = event.active.data.current?.issueId as string | undefined;
    const overId = event.over ? String(event.over.id) : null;
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (!issue || !overId || isViewer) return;

    if (overId === UNSCHEDULED_ID) {
      if (issue.dueDate || issue.startDate) {
        void updateIssue(issue.id, { dueDate: null, startDate: null });
      }
      return;
    }
    const target = overId.replace(/^day:/, "");
    if (issue.dueDate?.slice(0, 10) === target) return;
    void updateIssue(issue.id, moveToDay(issue, target));
  };

  if (isLoading) return <WorkspaceLoading label="calendar" />;

  return (
    <div className="page calendar-page">
      <h1 className="sr-only">{project ? `${project.name} calendar` : "Calendar"}</h1>
      <div className="jira-toolbar calendar-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search calendar</span>
          <input
            type="search"
            placeholder="Search calendar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="calendar-filters">
          <label>
            <span className="sr-only">Filter by assignee</span>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
            >
              <option value="ALL">All assignees</option>
              <option value="UNASSIGNED">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by type</span>
            <select
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as "ALL" | IssueKind)
              }
            >
              <option value="ALL">All types</option>
              {ISSUE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="jira-toolbar-spacer" />
        <div className="calendar-nav">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMonth(new Date())}
          >
            Today
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => step(-1)}
            aria-label={isWeek ? "Previous week" : "Previous month"}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => step(1)}
            aria-label={isWeek ? "Next week" : "Next month"}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <h2 className="calendar-title">{title}</h2>
          <div className="calendar-mode" role="radiogroup" aria-label="Calendar type">
            {(["month", "week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={view.mode === mode}
                className={view.mode === mode ? "active" : undefined}
                onClick={() => updateView((current) => ({ ...current, mode }))}
              >
                {mode === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
          <CalendarSettings view={view} onUpdate={updateView} />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveIssueId(null)}
      >
        <div className="calendar-layout">
          <section
            className={isWeek ? "panel calendar-panel week-mode" : "panel calendar-panel"}
            aria-label={isWeek ? "Week calendar" : "Month calendar"}
          >
            <div className="calendar-weekdays" aria-hidden="true">
              {weekdayNames(view.weekStartsOn).map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => {
              const placements = layoutWeek(week, scheduled);
              const lanes = placements.reduce(
                (max, placement) => Math.max(max, placement.lane + 1),
                0,
              );
              return (
                <div
                  className="calendar-week"
                  key={week[0]}
                  style={{
                    minHeight: Math.max(
                      isWeek ? 420 : 0,
                      DAY_HEADER_HEIGHT + Math.max(lanes, 2) * LANE_HEIGHT + 10,
                    ),
                  }}
                >
                  <div className="calendar-days">
                    {week.map((day) => (
                      <CalendarDay
                        key={day}
                        day={day}
                        sprint={sprintForDay(day, sprints)}
                        isToday={day === todayKey}
                        inMonth={isWeek || isSameMonth(dateOfKey(day), month)}
                        isFirstOfWeek={day === week[0]}
                      />
                    ))}
                  </div>
                  {placements.map((placement) => (
                    <CalendarChip
                      key={`${placement.item.id}@${weekIndex}`}
                      dragId={`${placement.item.id}@${weekIndex}`}
                      issue={placement.item}
                      display={chipDisplay(placement.item)}
                      disabled={isViewer}
                      className={[
                        "calendar-span",
                        placement.continuesBefore ? "continues-before" : "",
                        placement.continuesAfter ? "continues-after" : "",
                      ].join(" ")}
                      style={{
                        left: `calc(${(placement.startColumn / 7) * 100}% + 3px)`,
                        width: `calc(${(placement.span / 7) * 100}% - 6px)`,
                        top: DAY_HEADER_HEIGHT + placement.lane * LANE_HEIGHT,
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </section>

          <UnscheduledPanel issues={unscheduled} disabled={isViewer} display={chipDisplay} />
        </div>

        <DragOverlay>
          {activeIssue ? (
            <div className={`calendar-chip calendar-overlay ${categoryClass(activeIssue)}`}>
              <KindIcon kind={activeIssue.kind} projectId={activeIssue.projectId} />
              <span className="calendar-chip-title">{activeIssue.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <section className="panel calendar-agenda" aria-label="Agenda">
        {agenda.length === 0 ? (
          <p className="empty-state calendar-agenda-empty">
            Nothing due in {format(month, "MMMM")}.
          </p>
        ) : (
          agenda.map(([day, dayIssues]) => (
            <div className="calendar-agenda-day" key={day}>
              <h3 className={day === todayKey ? "today" : ""}>
                {format(dateOfKey(day), "EEE, MMM d")}
              </h3>
              <ul>
                {dayIssues.map((issue) => (
                  <li key={issue.id}>
                    <Link
                      href={issueHref(issue.id)}
                      scroll={false}
                      className="calendar-agenda-item"
                    >
                      <KindIcon kind={issue.kind} projectId={issue.projectId} />
                      <span className="calendar-chip-key">{issue.id}</span>
                      <span className="calendar-chip-title">{issue.title}</span>
                      <StatusBadge status={issue.status} projectId={issue.projectId} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function CalendarDay({
  day,
  sprint,
  isToday,
  inMonth,
  isFirstOfWeek,
}: {
  day: string;
  sprint: Cycle | null;
  isToday: boolean;
  inMonth: boolean;
  isFirstOfWeek: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const sprintStarts =
    sprint && (sprint.startDate.slice(0, 10) === day || isFirstOfWeek);

  return (
    <div
      ref={setNodeRef}
      className={[
        "calendar-day",
        inMonth ? "" : "outside",
        isToday ? "today" : "",
        sprint ? "in-sprint" : "",
        isOver ? "drop-target" : "",
      ].join(" ")}
      title={sprint ? sprint.name : undefined}
    >
      <span className="calendar-day-number">{Number(day.slice(8, 10))}</span>
      {sprintStarts && <span className="calendar-sprint-label">{sprint.name}</span>}
    </div>
  );
}

function CalendarChip({
  dragId,
  issue,
  display,
  disabled,
  className,
  style,
}: {
  dragId: string;
  issue: Issue;
  display: ChipDisplay;
  disabled: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const issueHref = useIssueHref();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { issueId: issue.id },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`calendar-chip ${display.color ? "colored" : categoryClass(issue)} ${
        className ?? ""
      } ${isDragging ? "dragging" : ""}`}
      style={{ ...style, ...(display.color ? { "--chip-color": display.color } : {}) } as CSSProperties}
      {...listeners}
      {...attributes}
      aria-label={`${issue.id} ${issue.title}`}
    >
      <KindIcon kind={issue.kind} projectId={issue.projectId} />
      {display.showKey && <span className="calendar-chip-key">{issue.id}</span>}
      <Link
        href={issueHref(issue.id)}
        scroll={false}
        className="calendar-chip-title"
        title={issue.title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {issue.title}
      </Link>
    </div>
  );
}

function UnscheduledPanel({
  issues,
  disabled,
  display,
}: {
  issues: Issue[];
  disabled: boolean;
  display: (issue: Issue) => ChipDisplay;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNSCHEDULED_ID });

  return (
    <aside
      ref={setNodeRef}
      className={`panel calendar-unscheduled ${isOver ? "drop-target" : ""}`}
      aria-label="Unscheduled issues"
    >
      <div className="panel-header">
        <div>
          <h2>Unscheduled</h2>
          <p>
            {disabled
              ? "Open issues without a due date"
              : "Drag onto a day to set its due date"}
          </p>
        </div>
      </div>
      {issues.length === 0 ? (
        <p className="calendar-unscheduled-empty">
          <CalendarX2 size={16} aria-hidden="true" />
          Every open issue has a due date.
        </p>
      ) : (
        <div className="calendar-unscheduled-list">
          {issues.map((issue) => (
            <CalendarChip
              key={issue.id}
              dragId={`${issue.id}@unscheduled`}
              issue={issue}
              display={display(issue)}
              disabled={disabled}
              className="calendar-unscheduled-item"
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function CalendarSettings({
  view,
  onUpdate,
}: {
  view: CalendarPrefs;
  onUpdate: (change: (current: CalendarPrefs) => CalendarPrefs) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="icon-button" aria-label="View settings" title="View settings">
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="calendar-settings" align="end" sideOffset={6}>
          <h3>View settings</h3>
          <label>
            <span>Color by</span>
            <select
              value={view.colorBy}
              onChange={(event) =>
                onUpdate((current) => ({
                  ...current,
                  colorBy: event.target.value as CalendarPrefs["colorBy"],
                }))
              }
            >
              <option value="status">Status</option>
              <option value="priority">Priority</option>
              <option value="type">Work type</option>
            </select>
          </label>
          <label className="calendar-settings-check">
            <input
              type="checkbox"
              checked={view.showKey}
              onChange={() => onUpdate((current) => ({ ...current, showKey: !current.showKey }))}
            />
            <span>Show work item key</span>
          </label>
          <label>
            <span>Week starts on</span>
            <select
              value={view.weekStartsOn}
              onChange={(event) =>
                onUpdate((current) => ({
                  ...current,
                  weekStartsOn: event.target.value === "1" ? 1 : 0,
                }))
              }
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
