"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Plus,
  Search,
} from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { DependencyLayer } from "./DependencyLayer";
import type { Dependency } from "../../../server/dependencies";
import { useProjects } from "../../ProjectProvider";
import { authClient } from "../../../lib/auth-client";
import { KindIcon, StatusBadge } from "../IssueVisuals";
import { WorkspaceLoading } from "../WorkspaceLoading";
import {
  selectedIssueHref,
  useSelectedIssue,
} from "../issue/selectedIssue";
import {
  type Issue,
  type StatusCategory,
} from "../../data/issues";
import { PROJECT_COLORS } from "../../data/projects";
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
import { isDoneStatus, isEpicLevel, statusCategory } from "../../data/workflow";

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

type ProjectHeader = { id: string; key: string; name: string; color: string };

/**
 * The Jira timeline. "project" mode is one project's tab (sprints row,
 * create epic); "roadmap" mode is the Plans-style cross-project view with a
 * header per project and dependencies across projects.
 */
export function TimelineView({
  projectIds,
  mode,
}: {
  projectIds: string[];
  mode: "project" | "roadmap";
}) {
  const projectId = projectIds[0] ?? "";
  const projectKey = projectIds.join(",");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open: openIssue } = useSelectedIssue();
  const { issues, cycles, members, isLoading, updateIssue, createIssue } =
    useIssues();
  const { allProjects: projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  // Read-only for workspace viewers and for people without edit access to
  // an item's project (Limited/Private projects, project Viewer role, archived).
  const canEditProject = (id: string) =>
    activeMember?.role !== "viewer" &&
    projects.find((candidate) => candidate.id === id)?.permissions?.canEdit !== false;
  const isViewer = !canEditProject(projectId);
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
  const gridRef = useRef<HTMLDivElement>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [showDependencies, setShowDependencies] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!projectKey) return;
    apiRequest<Dependency[]>(
      `/api/dependencies?projectIds=${encodeURIComponent(projectKey)}`,
    )
      .then((loaded) => !cancelled && setDependencies(loaded))
      .catch(() => !cancelled && setDependencies([]));
    return () => {
      cancelled = true;
    };
  }, [projectKey, issues]);

  const today = toDayKey(new Date());
  const dayWidth = ZOOM_DAY_WIDTH[zoom];

  const projectIssues = useMemo(() => {
    const wanted = new Set(projectKey.split(","));
    return issues.filter((issue) => wanted.has(issue.projectId));
  }, [issues, projectKey]);
  // Sprints belong to one project's board, so only the project tab shows them.
  const projectCycles = useMemo(
    () =>
      mode === "project"
        ? cycles
            .filter((cycle) => cycle.projectId === projectId)
            .sort((left, right) => left.startDate.localeCompare(right.startDate))
        : [],
    [cycles, projectId, mode],
  );

  const rowModel = useMemo(() => {
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
    const order = projectKey.split(",");
    const epics = projectIssues
      .filter((issue) => isEpicLevel(issue.kind))
      .sort(
        (left, right) =>
          order.indexOf(left.projectId) - order.indexOf(right.projectId) ||
          left.rank - right.rank ||
          left.createdAt.localeCompare(right.createdAt),
      );
    const palette = [
      project?.color ?? PROJECT_COLORS[0],
      ...PROJECT_COLORS.filter((color) => color !== project?.color),
    ];
    const projectColor = (id: string) =>
      projects.find((candidate) => candidate.id === id)?.color ??
      PROJECT_COLORS[Math.max(0, order.indexOf(id)) % PROJECT_COLORS.length];
    const result: TimelineRow[] = [];
    const headers = new Map<string, ProjectHeader>();

    epics.forEach((epic, index) => {
      const children = projectIssues
        .filter((issue) => issue.parentId === epic.id)
        .sort((left, right) => left.rank - right.rank);
      const visibleChildren = children.filter(matches);
      if (!matches(epic) && visibleChildren.length === 0) return;
      const color =
        mode === "roadmap"
          ? projectColor(epic.projectId)
          : palette[index % palette.length];
      if (
        mode === "roadmap" &&
        !result.some((row) => row.issue.projectId === epic.projectId)
      ) {
        const owner = projects.find((candidate) => candidate.id === epic.projectId);
        headers.set(epic.id, {
          id: epic.projectId,
          key: owner?.key ?? "",
          name: owner?.name ?? "Project",
          color,
        });
      }
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
    return { rows: result, headers };
  }, [
    projectIssues,
    categoryFilter,
    assigneeFilter,
    query,
    expanded,
    project?.color,
    projectKey,
    projects,
    mode,
  ]);
  const { rows, headers: projectHeaders } = rowModel;

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
    if (!canEditProject(issue.projectId) || event.button !== 0) return;
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
    if (!canEditProject(issue.projectId)) return;
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

  const barSpans = useMemo(() => {
    const spans = new Map<string, Span>();
    for (const row of rows) {
      const span =
        preview?.id === row.issue.id ? preview.span : barSpan(row.issue);
      if (span) spans.set(row.issue.id, span);
    }
    return spans;
  }, [rows, preview]);

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
        <button
          type="button"
          className={showDependencies ? "secondary-button active" : "secondary-button"}
          aria-pressed={showDependencies}
          onClick={() => setShowDependencies((current) => !current)}
          title="Show arrows between work items that block each other"
        >
          <GitBranch size={14} aria-hidden="true" />
          Dependencies
        </button>
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
          <div className="timeline-grid" style={gridStyle} ref={gridRef}>
            {showDependencies && (
              <DependencyLayer
                gridRef={gridRef}
                dependencies={dependencies}
                spans={barSpans}
                version={`${zoom}|${rows.length}|${[...expanded].join(",")}|${preview ? `${preview.id}:${preview.span.start}:${preview.span.end}` : ""}`}
              />
            )}
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
              {mode === "project" && (
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
              )}
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
                      : mode === "roadmap"
                        ? "No epics in these projects yet."
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
                const header = projectHeaders.get(issue.id);
                const canEditRow = canEditProject(issue.projectId);
                return (
                  <Fragment key={`${row.depth}-${issue.id}`}>
                  {header && (
                    <div className="timeline-row timeline-project-row">
                      <div className="timeline-label">
                        <span
                          className="timeline-project-swatch"
                          style={{ background: header.color }}
                          aria-hidden="true"
                        />
                        <Link
                          href={`/projects/${header.id}/timeline`}
                          className="timeline-project-name"
                        >
                          {header.name}
                          <span>{header.key}</span>
                        </Link>
                      </div>
                      <div className="timeline-track" />
                    </div>
                  )}
                  <div className={`timeline-row depth-${row.depth}`}>
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
                          isViewer={!canEditRow}
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
                          disabled={!canEditRow}
                          title={
                            !canEditRow
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
                  </Fragment>
                );
              })}

              {mode === "project" && !isViewer && (
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
      data-bar-id={row.issue.id}
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
