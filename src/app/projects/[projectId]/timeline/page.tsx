"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";
import { KindIcon, StatusBadge } from "../../../components/IssueVisuals";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import {
  selectedIssueHref,
  useSelectedIssue,
} from "../../../components/issue/selectedIssue";
import {
  type Issue,
  type StatusCategory,
} from "../../../data/issues";
import { PROJECT_COLORS } from "../../../data/projects";
import {
  ZOOM_DAY_WIDTH,
  addDays,
  applyDrag,
  barGeometry,
  barSpan,
  diffDays,
  headerSegments,
  pixelsToDays,
  timelineRange,
  toDayKey,
  type DragMode,
  type TimelineZoom,
} from "./timelineMath";
import { isDoneStatus, isEpicLevel, statusCategory } from "../../../data/workflow";

const ZOOMS: { value: TimelineZoom; label: string }[] = [
  { value: "WEEKS", label: "Weeks" },
  { value: "MONTHS", label: "Months" },
  { value: "QUARTERS", label: "Quarters" },
];

const CATEGORY_FILTERS: { value: "ALL" | StatusCategory; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

type Span = { start: string; end: string };

type DragState = {
  issueId: string;
  mode: DragMode;
  originX: number;
  span: Span;
  moved: boolean;
};

type TimelineRow = {
  issue: Issue;
  depth: 0 | 1;
  color: string;
  progress: number | null;
  childCount: number;
};

export default function TimelinePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open: openIssue } = useSelectedIssue();
  const { issues, cycles, members, isLoading, updateIssue, createIssue } =
    useIssues();
  const { projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const project = projects.find((candidate) => candidate.id === projectId);

  const [zoom, setZoom] = useState<TimelineZoom>("WEEKS");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | StatusCategory>(
    "ALL",
  );
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ id: string; span: Span } | null>(
    null,
  );
  const [isCreatingEpic, setIsCreatingEpic] = useState(false);
  const [epicTitle, setEpicTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = toDayKey(new Date());
  const dayWidth = ZOOM_DAY_WIDTH[zoom];

  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === projectId),
    [issues, projectId],
  );
  const projectCycles = useMemo(
    () =>
      cycles
        .filter((cycle) => cycle.projectId === projectId)
        .sort((left, right) => left.startDate.localeCompare(right.startDate)),
    [cycles, projectId],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (issue: Issue) =>
      (!needle ||
        issue.title.toLowerCase().includes(needle) ||
        issue.id.toLowerCase().includes(needle)) &&
      (categoryFilter === "ALL" ||
        statusCategory(issue.status) === categoryFilter) &&
      (assigneeFilter === "ALL" ||
        (assigneeFilter === "UNASSIGNED"
          ? !issue.assignee
          : issue.assignee?.id === assigneeFilter));
    const epics = projectIssues
      .filter((issue) => isEpicLevel(issue.kind))
      .sort(
        (left, right) =>
          left.rank - right.rank || left.createdAt.localeCompare(right.createdAt),
      );
    const palette = [
      project?.color ?? PROJECT_COLORS[0],
      ...PROJECT_COLORS.filter((color) => color !== project?.color),
    ];
    const result: TimelineRow[] = [];

    epics.forEach((epic, index) => {
      const children = projectIssues
        .filter((issue) => issue.parentId === epic.id)
        .sort((left, right) => left.rank - right.rank);
      const visibleChildren = children.filter(matches);
      if (!matches(epic) && visibleChildren.length === 0) return;
      const color = palette[index % palette.length];
      const done = children.filter((child) => isDoneStatus(child.status)).length;
      result.push({
        issue: epic,
        depth: 0,
        color,
        progress: children.length ? done / children.length : null,
        childCount: children.length,
      });
      if (expanded.has(epic.id)) {
        for (const child of visibleChildren) {
          result.push({
            issue: child,
            depth: 1,
            color,
            progress: isDoneStatus(child.status) ? 1 : null,
            childCount: 0,
          });
        }
      }
    });
    return result;
  }, [
    projectIssues,
    categoryFilter,
    assigneeFilter,
    query,
    expanded,
    project?.color,
  ]);

  const range = useMemo(() => {
    const dates: string[] = [];
    for (const issue of projectIssues) {
      if (!isEpicLevel(issue.kind) && !issue.parentId) continue;
      if (issue.startDate) dates.push(issue.startDate);
      if (issue.dueDate) dates.push(issue.dueDate);
    }
    for (const cycle of projectCycles) {
      dates.push(cycle.startDate, cycle.endDate);
    }
    return timelineRange(dates, today, zoom);
  }, [projectIssues, projectCycles, today, zoom]);

  const header = useMemo(
    () => headerSegments(range.start, range.end, zoom),
    [range.start, range.end, zoom],
  );
  const trackWidth = range.days * dayWidth;
  const todayOffset = diffDays(range.start, today) * dayWidth;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollLeft = Math.max(0, todayOffset - container.clientWidth / 3);
  }, [todayOffset, isLoading]);

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    issue: Issue,
    span: Span,
    mode: DragMode,
  ) => {
    if (isViewer || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      issueId: issue.id,
      mode,
      originX: event.clientX,
      span,
      moved: false,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = pixelsToDays(event.clientX - drag.originX, dayWidth);
    if (Math.abs(event.clientX - drag.originX) > 3) drag.moved = true;
    setPreview({ id: drag.issueId, span: applyDrag(drag.span, drag.mode, delta) });
  };

  const endDrag = async (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const delta = pixelsToDays(event.clientX - drag.originX, dayWidth);
    if (!drag.moved) {
      setPreview(null);
      openIssue(drag.issueId);
      return;
    }
    if (delta === 0) {
      setPreview(null);
      return;
    }
    const next = applyDrag(drag.span, drag.mode, delta);
    setPreview({ id: drag.issueId, span: next });
    await updateIssue(drag.issueId, { startDate: next.start, dueDate: next.end });
    setPreview(null);
  };

  const schedule = (issue: Issue) => {
    if (isViewer) return;
    void updateIssue(issue.id, {
      startDate: today,
      dueDate: addDays(today, 13),
    });
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreateEpic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = epicTitle.trim();
    if (title.length < 3) {
      setCreateError("Epic names need at least 3 characters.");
      return;
    }
    setIsSubmitting(true);
    setCreateError(null);
    try {
      await createIssue({
        title,
        description: "<p>Epic created from the project timeline.</p>",
        priority: "MEDIUM",
        kind: "EPIC",
        estimate: null,
        cycleId: null,
        projectId,
        assigneeId: null,
        dueDate: null,
        labelIds: [],
      });
      setEpicTitle("");
      setIsCreatingEpic(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Epic could not be created",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <WorkspaceLoading label="timeline" />;

  const gridStyle = {
    "--timeline-track-width": `${trackWidth}px`,
  } as CSSProperties;

  return (
    <div className="page timeline-page">
      <h1 className="sr-only">Timeline</h1>
      <div className="jira-toolbar timeline-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search timeline</span>
          <input
            type="search"
            placeholder="Search timeline"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-tabs" role="tablist" aria-label="Status category">
          {CATEGORY_FILTERS.map((filter) => (
            <button
              type="button"
              role="tab"
              key={filter.value}
              aria-selected={categoryFilter === filter.value}
              className={categoryFilter === filter.value ? "active" : ""}
              onClick={() => setCategoryFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="timeline-select">
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
        <div className="jira-toolbar-spacer" />
        <div
          className="filter-tabs timeline-zoom"
          role="tablist"
          aria-label="Timeline zoom"
        >
          {ZOOMS.map((option) => (
            <button
              type="button"
              role="tab"
              key={option.value}
              aria-selected={zoom === option.value}
              className={zoom === option.value ? "active" : ""}
              onClick={() => setZoom(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section className="panel timeline-panel">
        <div className="timeline-scroll" ref={scrollRef}>
          <div className="timeline-grid" style={gridStyle}>
            <div className="timeline-head">
              <div className="timeline-row timeline-head-row">
                <div className="timeline-label timeline-corner">Work</div>
                <div className="timeline-track timeline-scale">
                  {header.top.map((segment) => (
                    <span
                      key={segment.key}
                      className="timeline-scale-cell top"
                      style={{
                        left: segment.offset * dayWidth,
                        width: segment.days * dayWidth,
                      }}
                    >
                      {segment.label}
                    </span>
                  ))}
                  {header.bottom.map((segment) => (
                    <span
                      key={segment.key}
                      className="timeline-scale-cell bottom"
                      style={{
                        left: segment.offset * dayWidth,
                        width: segment.days * dayWidth,
                      }}
                    >
                      {segment.days * dayWidth >= 18 ? segment.label : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="timeline-row timeline-sprint-row">
                <div className="timeline-label timeline-corner">Sprints</div>
                <div className="timeline-track">
                  {projectCycles.map((cycle) => {
                    const geometry = barGeometry(
                      {
                        start: toDayKey(cycle.startDate),
                        end: toDayKey(cycle.endDate),
                      },
                      range.start,
                      dayWidth,
                    );
                    return (
                      <span
                        key={cycle.id}
                        className={`timeline-sprint state-${(
                          cycle.state ?? "FUTURE"
                        ).toLowerCase()}`}
                        style={{ left: geometry.left, width: geometry.width }}
                        title={`${cycle.name}${cycle.goal ? ` — ${cycle.goal}` : ""}`}
                      >
                        {cycle.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="timeline-body">
              <div className="timeline-columns" aria-hidden="true">
                {header.bottom.map((segment) => (
                  <span
                    key={segment.key}
                    style={{ left: segment.offset * dayWidth }}
                  />
                ))}
                {todayOffset >= 0 && todayOffset <= trackWidth && (
                  <i
                    className="timeline-today"
                    style={{ left: todayOffset + dayWidth / 2 }}
                    title="Today"
                  />
                )}
              </div>

              {rows.length === 0 && (
                <div className="timeline-row">
                  <div className="timeline-label timeline-empty">
                    {projectIssues.some((issue) => isEpicLevel(issue.kind))
                      ? "No epics match these filters."
                      : "No epics yet. Create one to start planning."}
                  </div>
                  <div className="timeline-track" />
                </div>
              )}

              {rows.map((row) => {
                const { issue } = row;
                const span =
                  preview?.id === issue.id ? preview.span : barSpan(issue);
                const isExpanded = expanded.has(issue.id);
                return (
                  <div
                    key={`${row.depth}-${issue.id}`}
                    className={`timeline-row depth-${row.depth}`}
                  >
                    <div className="timeline-label">
                      {row.depth === 0 ? (
                        <button
                          type="button"
                          className="timeline-toggle"
                          onClick={() => toggle(issue.id)}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? `Collapse ${issue.title}`
                              : `Expand ${issue.title}`
                          }
                          disabled={row.childCount === 0}
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} aria-hidden="true" />
                          ) : (
                            <ChevronRight size={14} aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span className="timeline-indent" />
                      )}
                      <KindIcon kind={issue.kind} projectId={issue.projectId} />
                      <Link
                        href={selectedIssueHref(pathname, searchParams, issue.id)}
                        scroll={false}
                        className="timeline-issue-link"
                        title={issue.title}
                      >
                        <span className="timeline-issue-key">{issue.id}</span>
                        <span className="timeline-issue-title">
                          {issue.title}
                        </span>
                      </Link>
                      {row.depth === 1 && (
                        <span className="timeline-status">
                          <StatusBadge status={issue.status} projectId={issue.projectId} />
                        </span>
                      )}
                    </div>
                    <div className="timeline-track">
                      {span ? (
                        <TimelineBar
                          row={row}
                          span={span}
                          rangeStart={range.start}
                          dayWidth={dayWidth}
                          isViewer={isViewer}
                          isDragging={preview?.id === issue.id}
                          onPointerDown={(event, mode) =>
                            beginDrag(event, issue, span, mode)
                          }
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                        />
                      ) : (
                        <button
                          type="button"
                          className="timeline-schedule"
                          style={{ left: Math.max(0, todayOffset) }}
                          onClick={() => schedule(issue)}
                          disabled={isViewer}
                          title={
                            isViewer
                              ? "Unscheduled"
                              : "Schedule two weeks starting today"
                          }
                        >
                          <CalendarPlus size={12} aria-hidden="true" />
                          Schedule
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!isViewer && (
                <div className="timeline-row timeline-create-row">
                  <div className="timeline-label">
                    {isCreatingEpic ? (
                      <form className="timeline-create-form" onSubmit={handleCreateEpic}>
                        <input
                          autoFocus
                          value={epicTitle}
                          onChange={(event) => setEpicTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setIsCreatingEpic(false);
                              setEpicTitle("");
                              setCreateError(null);
                            }
                          }}
                          placeholder="What needs to be done?"
                          aria-label="Epic name"
                          disabled={isSubmitting}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="text-button timeline-create-button"
                        onClick={() => setIsCreatingEpic(true)}
                      >
                        <Plus size={14} aria-hidden="true" />
                        Create epic
                      </button>
                    )}
                  </div>
                  <div className="timeline-track" />
                </div>
              )}
            </div>
          </div>
        </div>
        {createError && (
          <p className="form-submit-error timeline-error" role="alert">
            {createError}
          </p>
        )}
      </section>
    </div>
  );
}

function TimelineBar({
  row,
  span,
  rangeStart,
  dayWidth,
  isViewer,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  row: TimelineRow;
  span: Span;
  rangeStart: string;
  dayWidth: number;
  isViewer: boolean;
  isDragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, mode: DragMode) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const geometry = barGeometry(span, rangeStart, dayWidth);
  const inferred = !row.issue.startDate || !row.issue.dueDate;
  const style = {
    left: geometry.left,
    width: geometry.width,
    "--timeline-bar-color": row.color,
  } as CSSProperties;
  const handlers = {
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  return (
    <div
      className={[
        "timeline-bar",
        row.depth === 1 ? "child" : "epic",
        inferred ? "inferred" : "",
        isDragging ? "dragging" : "",
        isViewer ? "readonly" : "",
      ].join(" ")}
      style={style}
      title={`${row.issue.title}: ${span.start} → ${span.end}`}
      role="button"
      tabIndex={-1}
      onPointerDown={(event) => onPointerDown(event, "move")}
      {...handlers}
    >
      {row.progress !== null && (
        <span
          className="timeline-bar-progress"
          style={{ width: `${Math.round(row.progress * 100)}%` }}
        />
      )}
      <span className="timeline-bar-label">
        {row.depth === 0 && row.childCount > 0
          ? `${Math.round((row.progress ?? 0) * 100)}%`
          : ""}
      </span>
      {!isViewer && (
        <>
          <span
            className="timeline-bar-handle start"
            onPointerDown={(event) => onPointerDown(event, "start")}
            {...handlers}
            aria-hidden="true"
          />
          <span
            className="timeline-bar-handle end"
            onPointerDown={(event) => onPointerDown(event, "end")}
            {...handlers}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
