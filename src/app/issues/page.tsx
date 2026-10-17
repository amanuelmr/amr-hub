"use client";

import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  Bookmark,
  BookmarkPlus,
  Download,
  Kanban,
  ListFilter,
  MoreHorizontal,
  PanelRight,
  Plus,
  Rows3,
  Search,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useIssues } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { authClient } from "../../lib/auth-client";
import {
  PRIORITY_LABELS,
  type IssuePriority,
  type IssueStatus,
  type SavedView,
} from "../data/issues";
import {
  DEFAULT_JQL_ORDER,
  basicFiltersToJql,
  searchIssuesWithJql,
  setJqlOrderBy,
  type JqlField,
  type JqlOrderBy,
  type JqlSuggestionSource,
} from "../data/jql";
import { IssueBoard } from "../components/IssueBoard";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import { IssueResultsTable } from "../components/search/IssueResultsTable";
import { ColumnChooser } from "../components/search/ColumnChooser";
import { JqlEditor } from "../components/search/JqlEditor";
import { IssueDetailContainer } from "../components/issue/IssueDetailView";
import {
  SELECTED_ISSUE_PARAM,
  selectedIssueHref,
  useSelectedIssue,
} from "../components/issue/selectedIssue";
import { KindIcon, StatusBadge } from "../components/IssueVisuals";
import { BulkBar } from "../components/search/BulkBar";
import {
  COLUMNS_BY_ID,
  DEFAULT_COLUMNS,
  issuesCsv,
  type ColumnId,
} from "../components/search/columns";
import { downloadCsv, toCsv } from "../components/search/csv";
import { useColumnLookups, useJqlContext } from "../components/search/useJqlContext";

type ViewMode = "list" | "detail" | "board";
type SearchMode = "basic" | "jql";
type StatusFilter = "ALL" | "ACTIVE" | IssueStatus;

const UNASSIGNED_FILTER = "UNASSIGNED";
/** `?view=detail` shows the split list + issue panel; `?view=board` the board. */
const VIEW_PARAM = "view";
const PAGE_SIZE = 50;
const COLUMNS_STORAGE_KEY = "amr-hub:navigator-columns";
const MODE_STORAGE_KEY = "amr-hub:navigator-mode";
const DATE_FIELDS: JqlField[] = ["created", "updated", "resolved", "due", "startdate"];

const statusFilters: { label: string; value: StatusFilter }[] = [
  { label: "All issues", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Backlog", value: "BACKLOG" },
  { label: "Completed", value: "DONE" },
];

function readStorage<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); preferences are optional.
  }
}

const isColumnList = (value: unknown): value is ColumnId[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((id) => COLUMNS_BY_ID.has(id as ColumnId));
const isMode = (value: unknown): value is SearchMode => value === "basic" || value === "jql";

export default function IssuesPage() {
  return (
    <Suspense fallback={<WorkspaceLoading label="issues" />}>
      <NavigatorGate />
    </Suspense>
  );
}

function NavigatorGate() {
  const { isLoading } = useIssues();
  if (isLoading) return <WorkspaceLoading label="issues" />;
  return <IssueNavigator />;
}

function IssueNavigator() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    issues,
    labels,
    savedViews,
    members,
    cycles,
    updateStatus,
    createSavedView,
    deleteSavedView,
  } = useIssues();
  const { projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const isOwner = activeMember?.role === "owner";

  const [mode, setMode] = useState<SearchMode>(() =>
    searchParams.get("jql") !== null ? "jql" : readStorage(MODE_STORAGE_KEY, "basic", isMode),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "ALL">("ALL");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [labelFilter, setLabelFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [basicOrder, setBasicOrder] = useState<JqlOrderBy[] | null>(null);

  const [jqlDraft, setJqlDraft] = useState(() => searchParams.get("jql") ?? "");
  const [appliedJql, setAppliedJql] = useState(() => searchParams.get("jql") ?? "");
  const [searchedAt, setSearchedAt] = useState(() => new Date());

  const [columns, setColumns] = useState<ColumnId[]>(() =>
    readStorage(COLUMNS_STORAGE_KEY, DEFAULT_COLUMNS, isColumnList),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectedViewId, setSelectedViewId] = useState("");
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);
  const [isSavingView, setIsSavingView] = useState(false);

  const viewParam = searchParams.get(VIEW_PARAM);
  const viewMode: ViewMode = viewParam === "detail" || viewParam === "board" ? viewParam : "list";
  const { selectedIssueId } = useSelectedIssue();

  const ctx = useJqlContext(searchedAt);
  const lookups = useColumnLookups();

  const applySavedView = (view: SavedView | undefined, id: string) => {
    setSelectedViewId(id);
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
    if (!view) return;
    if (view.jql) {
      setMode("jql");
      setJqlDraft(view.jql);
      setAppliedJql(view.jql);
      setSearchedAt(new Date());
      return;
    }
    setMode("basic");
    setQuery(view.query);
    setStatusFilter(view.status);
    setPriorityFilter(view.priority);
    setAssigneeFilter(view.assignee);
    setLabelFilter(view.labelId ?? "ALL");
    setSortNewestFirst(view.sort === "NEWEST");
    setBasicOrder(null);
  };

  const filterParam = searchParams.get("filter");
  const [appliedFilterParam, setAppliedFilterParam] = useState<string | null>(null);
  if (filterParam !== appliedFilterParam) {
    setAppliedFilterParam(filterParam);
    if (filterParam) {
      const view = savedViews.find((candidate) => candidate.id === filterParam);
      const freshJql = searchParams.get("jql");
      applySavedView(view && freshJql !== null ? { ...view, jql: freshJql } : view, filterParam);
    }
  }

  const jqlParam = searchParams.get("jql");
  const [seenJqlParam, setSeenJqlParam] = useState(jqlParam);
  if (jqlParam !== seenJqlParam) {
    setSeenJqlParam(jqlParam);
    if (jqlParam !== null && jqlParam !== appliedJql) {
      setMode("jql");
      setJqlDraft(jqlParam);
      setAppliedJql(jqlParam);
    }
  }

  const markViewModified = () => {
    setSelectedViewId("");
    setVisibleCount(PAGE_SIZE);
  };

  const basicJql = useMemo(() => {
    const base = basicFiltersToJql({
      text: query,
      status: statusFilter,
      priority: priorityFilter,
      projectKey: projects.find((project) => project.id === projectFilter)?.key ?? null,
      labelName: labels.find((label) => label.id === labelFilter)?.name ?? null,
      assignee:
        assigneeFilter === UNASSIGNED_FILTER
          ? UNASSIGNED_FILTER
          : (members.find((member) => member.id === assigneeFilter)?.email ?? null),
      sort: sortNewestFirst ? "NEWEST" : "OLDEST",
    });
    return basicOrder ? setJqlOrderBy(base, basicOrder) : base;
  }, [
    query,
    statusFilter,
    priorityFilter,
    projects,
    projectFilter,
    labels,
    labelFilter,
    members,
    assigneeFilter,
    sortNewestFirst,
    basicOrder,
  ]);

  const effectiveJql = mode === "jql" ? appliedJql : basicJql;
  const search = useMemo(
    () => searchIssuesWithJql(issues, effectiveJql, ctx),
    [issues, effectiveJql, ctx],
  );
  const results = useMemo(() => (search.ok ? search.issues : []), [search]);
  const orderBy = search.ok && search.query.orderBy.length ? search.query.orderBy : DEFAULT_JQL_ORDER;
  const pageIssues = results.slice(0, visibleCount);
  const selectedIssues = results.filter((issue) => selectedIds.has(issue.id));
  const firstResultId = results[0]?.id ?? null;

  // Jira's detail view always shows an issue: pick the first result when the
  // URL doesn't name one yet.
  useEffect(() => {
    if (viewMode !== "detail" || selectedIssueId || !firstResultId) return;
    router.replace(selectedIssueHref(pathname, searchParams, firstResultId), { scroll: false });
  }, [viewMode, selectedIssueId, firstResultId, router, pathname, searchParams]);
  const jqlError = mode === "jql" && !search.ok ? search.error : null;

  const suggestionSource = useMemo<JqlSuggestionSource>(() => {
    const versions = new Map<string, { name: string }>();
    const components = new Map<string, { name: string }>();
    for (const issue of issues) {
      if (issue.fixVersion) versions.set(issue.fixVersion.name, issue.fixVersion);
      for (const component of issue.components) components.set(component.name, component);
    }
    return {
      projects,
      members,
      labels,
      cycles,
      versions: [...versions.values()],
      components: [...components.values()],
    };
  }, [issues, projects, members, labels, cycles]);

  const syncUrl = (jql: string | null) => {
    // Rebuild the query but keep the view switcher and open issue.
    const params = new URLSearchParams();
    for (const key of [VIEW_PARAM, SELECTED_ISSUE_PARAM]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    if (jql !== null) params.set("jql", jql);
    const search = params.toString();
    setSeenJqlParam(jql);
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const runJql = (jql = jqlDraft) => {
    setAppliedJql(jql);
    setSearchedAt(new Date());
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
    setSelectedViewId((current) => {
      const view = savedViews.find((candidate) => candidate.id === current);
      return view?.jql === jql ? current : "";
    });
    syncUrl(jql);
  };

  const switchMode = (next: SearchMode) => {
    if (next === mode) return;
    if (next === "jql") {
      setJqlDraft(basicJql);
      setAppliedJql(basicJql);
    } else {
      syncUrl(null);
    }
    setMode(next);
    writeStorage(MODE_STORAGE_KEY, next);
  };

  const handleSort = (field: JqlField) => {
    const primary = orderBy[0];
    const direction =
      primary?.field === field
        ? primary.direction === "ASC"
          ? "DESC"
          : "ASC"
        : DATE_FIELDS.includes(field)
          ? "DESC"
          : "ASC";
    const nextOrder: JqlOrderBy[] = [{ field, direction }];
    if (mode === "jql") {
      const next = setJqlOrderBy(appliedJql, nextOrder);
      setJqlDraft(next);
      runJql(next);
    } else {
      setBasicOrder(nextOrder);
      markViewModified();
    }
  };

  const updateColumns = (next: ColumnId[]) => {
    setColumns(next);
    writeStorage(COLUMNS_STORAGE_KEY, next);
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (select: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const issue of pageIssues) {
        if (select) next.add(issue.id);
        else next.delete(issue.id);
      }
      return next;
    });

  const exportCsv = () => {
    const { header, rows } = issuesCsv(results, columns, lookups);
    downloadCsv(`issues-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
  };

  const selectedView = savedViews.find((view) => view.id === selectedViewId);

  const handleSaveView = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = viewName.trim();
    if (name.length < 2) return;

    setIsSavingView(true);
    setViewError(null);

    try {
      const view = await createSavedView({
        name,
        query: mode === "basic" ? query.trim().slice(0, 100) : "",
        status: mode === "basic" ? statusFilter : "ALL",
        priority: mode === "basic" ? priorityFilter : "ALL",
        assignee: mode === "basic" ? assigneeFilter : "ALL",
        sort: mode === "basic" && !sortNewestFirst ? "OLDEST" : "NEWEST",
        labelId: mode === "basic" && labelFilter !== "ALL" ? labelFilter : null,
        jql: mode === "jql" ? appliedJql : null,
      });
      setSelectedViewId(view.id);
      setViewName("");
      setIsSaveViewOpen(false);
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "Filter could not be saved");
    } finally {
      setIsSavingView(false);
    }
  };

  const handleDeleteView = async () => {
    if (!selectedViewId) return;
    if (await deleteSavedView(selectedViewId)) setSelectedViewId("");
  };

  const clearFilters = () => {
    if (mode === "jql") {
      setJqlDraft("");
      runJql("");
      return;
    }
    setQuery("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setLabelFilter("ALL");
    setAssigneeFilter("ALL");
    setProjectFilter("ALL");
    setBasicOrder(null);
    markViewModified();
  };

  const handleUpdateStatus = (issueId: string, status: IssueStatus) =>
    updateStatus(issueId, status);

  const setViewMode = (next: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "list") params.delete(VIEW_PARAM);
    else params.set(VIEW_PARAM, next);
    if (next !== "detail") params.delete(SELECTED_ISSUE_PARAM);
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const viewOptions: { value: ViewMode; label: string; icon: typeof Rows3 }[] = [
    { value: "list", label: "List", icon: Rows3 },
    { value: "detail", label: "Detail", icon: PanelRight },
    { value: "board", label: "Board", icon: Kanban },
  ];

  const emptyState = (
    <div className="empty-state">
      <Search size={24} aria-hidden="true" />
      <h2>{jqlError ? "Fix the query to see results" : "No matching work items"}</h2>
      <p>
        {jqlError ? "The JQL above has an error." : "Try changing the search or active filters."}
      </p>
      <button className="secondary-button" type="button" onClick={clearFilters}>
        Clear search
      </button>
    </div>
  );

  const loadMore = visibleCount < results.length && (
    <div className="load-more-row">
      <button
        className="secondary-button"
        type="button"
        onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
      >
        Load more ({results.length - visibleCount} remaining)
      </button>
    </div>
  );

  return (
    <div className="page issues-page search-page">
      <header className="jira-page-header">
        <div className="search-page-heading">
          <h1 className="jira-page-title">{selectedView ? selectedView.name : "Search"}</h1>
        </div>
        <div className="jira-page-actions">
          <label className="select-button search-filter-picker">
            <Bookmark size={15} aria-hidden="true" />
            <span className="sr-only">Open a saved filter</span>
            <select
              value={selectedViewId}
              onChange={(event) =>
                applySavedView(
                  savedViews.find((view) => view.id === event.target.value),
                  event.target.value,
                )
              }
            >
              <option value="">Filters…</option>
              {savedViews.map((view) => (
                <option value={view.id} key={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button search-header-button"
            type="button"
            disabled={mode === "jql" && !!jqlError}
            onClick={() => {
              setViewError(null);
              setIsSaveViewOpen(true);
            }}
          >
            <BookmarkPlus size={15} aria-hidden="true" />
            {selectedView ? "Save as" : "Save filter"}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="icon-button search-header-more"
                type="button"
                aria-label="More actions"
                title="More actions"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="search-menu" align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className="search-menu-item"
                  disabled={results.length === 0}
                  onSelect={exportCsv}
                >
                  <Download size={14} aria-hidden="true" />
                  Export CSV
                </DropdownMenu.Item>
                {!isViewer && (
                  <DropdownMenu.Item
                    className="search-menu-item"
                    onSelect={() => router.push("/issues/new")}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Create issue
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="search-menu-item"
                  onSelect={() => router.push("/filters")}
                >
                  <ListFilter size={14} aria-hidden="true" />
                  View all filters
                </DropdownMenu.Item>
                {selectedView && !selectedView.isSystem && (
                  <>
                    <DropdownMenu.Separator className="search-menu-separator" />
                    <DropdownMenu.Item
                      className="search-menu-item danger"
                      onSelect={() => void handleDeleteView()}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Delete filter
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="search-bar-row">
        <div className="search-mode-toggle" role="tablist" aria-label="Search mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "basic"}
            className={mode === "basic" ? "active" : ""}
            onClick={() => switchMode("basic")}
          >
            Basic
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "jql"}
            className={mode === "jql" ? "active" : ""}
            onClick={() => switchMode("jql")}
          >
            JQL
          </button>
        </div>

        <div className="search-bar-query">
          {mode === "jql" ? (
            <JqlEditor
              value={jqlDraft}
              onChange={setJqlDraft}
              onSearch={() => runJql()}
              source={suggestionSource}
              error={jqlError}
            />
          ) : (
            <div className="search-basic-filters">
              <label className="search-field search-basic-text">
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Search work items</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    markViewModified();
                  }}
                  placeholder="Search work"
                />
              </label>
              <label className="select-button">
                <span className="sr-only">Filter by project</span>
                <select
                  value={projectFilter}
                  onChange={(event) => {
                    setProjectFilter(event.target.value);
                    markViewModified();
                  }}
                >
                  <option value="ALL">Project: All</option>
                  {projects.map((project) => (
                    <option value={project.id} key={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-button">
                <span className="sr-only">Filter by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter);
                    markViewModified();
                  }}
                >
                  {statusFilters.map((filter) => (
                    <option value={filter.value} key={filter.value}>
                      {filter.value === "ALL" ? "Status: All" : filter.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-button">
                <UserRound size={14} aria-hidden="true" />
                <span className="sr-only">Filter by assignee</span>
                <select
                  value={assigneeFilter}
                  onChange={(event) => {
                    setAssigneeFilter(event.target.value);
                    markViewModified();
                  }}
                >
                  <option value="ALL">Assignee: All</option>
                  <option value={UNASSIGNED_FILTER}>Unassigned</option>
                  {members.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-button">
                <span className="sr-only">Filter by priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => {
                    setPriorityFilter(event.target.value as IssuePriority | "ALL");
                    markViewModified();
                  }}
                >
                  <option value="ALL">Priority: All</option>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-button">
                <Tag size={14} aria-hidden="true" />
                <span className="sr-only">Filter by label</span>
                <select
                  value={labelFilter}
                  onChange={(event) => {
                    setLabelFilter(event.target.value);
                    markViewModified();
                  }}
                >
                  <option value="ALL">Labels: All</option>
                  {labels.map((label) => (
                    <option value={label.id} key={label.id}>
                      {label.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="search-view-switcher" role="tablist" aria-label="Result view">
          {viewOptions.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              role="tab"
              key={value}
              aria-selected={viewMode === value}
              className={viewMode === value ? "active" : ""}
              onClick={() => setViewMode(value)}
              title={`${label} view`}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="search-results-toolbar">
        <span className="search-result-count" aria-live="polite">
          {results.length === 0
            ? "No work items"
            : `${Math.min(visibleCount, results.length)} of ${results.length} work item${
                results.length === 1 ? "" : "s"
              }`}
        </span>
        <div className="search-results-actions">
          {mode === "basic" && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSortNewestFirst((current) => !current);
                setBasicOrder(null);
                markViewModified();
              }}
            >
              {sortNewestFirst ? "Newest" : "Oldest"}
              <ArrowDownUp size={14} aria-hidden="true" />
            </button>
          )}
          {viewMode === "list" && <ColumnChooser value={columns} onChange={updateColumns} />}
        </div>
      </div>

      {!isViewer && viewMode === "list" && (
        <BulkBar
          selected={selectedIssues}
          isOwner={isOwner}
          currentMemberId={activeMember?.id ?? null}
          onClear={() => setSelectedIds(new Set())}
          onDeleted={(ids) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              ids.forEach((id) => next.delete(id));
              return next;
            })
          }
        />
      )}

      {viewMode === "board" ? (
        <section className="issues-board-panel" aria-label="Issues board">
          <IssueBoard
            issues={results}
            isViewer={isViewer}
            onStatusChange={handleUpdateStatus}
          />
        </section>
      ) : viewMode === "detail" ? (
        <div className="search-detail">
          <section className="search-detail-list" aria-label="Search results">
            {results.length === 0 ? (
              emptyState
            ) : (
              <ul className="search-detail-items">
                {pageIssues.map((issue) => {
                  const isActive = issue.id === selectedIssueId;
                  return (
                    <li key={issue.id}>
                      <Link
                        href={selectedIssueHref(pathname, searchParams, issue.id)}
                        scroll={false}
                        replace
                        className={isActive ? "search-detail-item active" : "search-detail-item"}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span className="search-detail-summary">{issue.title}</span>
                        <span className="search-detail-meta">
                          <KindIcon kind={issue.kind} projectId={issue.projectId} />
                          <span className="search-key">{issue.id}</span>
                          <StatusBadge status={issue.status} projectId={issue.projectId} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {loadMore}
          </section>
          <section className="search-detail-panel" aria-label="Work item details">
            {selectedIssueId ? (
              <IssueDetailContainer
                issueId={selectedIssueId}
                variant="panel"
                onClose={() => setViewMode("list")}
              />
            ) : (
              <div className="search-detail-empty">
                <p>Select a work item to see its details.</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="issues-table-panel search-results-panel" aria-label="Search results">
          {results.length > 0 ? (
            <IssueResultsTable
              issues={pageIssues}
              columns={columns}
              lookups={lookups}
              orderBy={orderBy}
              onSort={handleSort}
              selectedIds={!isViewer ? selectedIds : undefined}
              onToggleSelected={!isViewer ? toggleSelected : undefined}
              onToggleAll={toggleAll}
            />
          ) : (
            emptyState
          )}
          {loadMore}
        </section>
      )}

      {isSaveViewOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsSaveViewOpen(false);
          }}
        >
          <section
            className="save-view-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-view-title"
          >
            <header>
              <div>
                <h2 id="save-view-title">Save filter</h2>
                <p>
                  {mode === "jql"
                    ? "Saves this JQL so you can rerun it from Filters."
                    : "Reuse this filter combination across the workspace."}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsSaveViewOpen(false)}
                aria-label="Close save filter dialog"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <form onSubmit={handleSaveView}>
              <label className="form-field">
                <span>Filter name</span>
                <input
                  value={viewName}
                  onChange={(event) => {
                    setViewName(event.target.value);
                    setViewError(null);
                  }}
                  maxLength={50}
                  placeholder="e.g. Support triage"
                  autoFocus
                />
              </label>
              {mode === "jql" && <code className="search-jql-preview">{appliedJql || "(all issues)"}</code>}
              {viewError && (
                <p className="form-submit-error" role="alert">
                  {viewError}
                </p>
              )}
              <footer>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setIsSaveViewOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={viewName.trim().length < 2 || isSavingView}
                >
                  <BookmarkPlus size={15} aria-hidden="true" />
                  {isSavingView ? "Saving..." : "Save filter"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
