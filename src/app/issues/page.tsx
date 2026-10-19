"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Info,
  Pencil,
  Star,
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
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useIssues } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { useWorkflows } from "../WorkflowProvider";
import { authClient } from "../../lib/auth-client";
import {
  PRIORITY_LABELS,
  type IssuePriority,
  type IssueStatus,
} from "../data/issues";
import { DEFAULT_FILTERS, defaultFilter } from "../data/filters";
import { apiRequest } from "../IssueProvider";
import * as Popover from "@radix-ui/react-popover";
import { useFilters } from "../components/search/useFilters";
import { FilterDetailsDialog } from "../components/search/FilterDetailsDialog";
import { summarizeShares, useShareDirectory } from "../components/search/ShareEditor";
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
import { setIssueNavigation } from "../components/issue/issueNav";
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

type ExtraField = "priority" | "labels" | "reporter" | "sprint" | "created";

const EXTRA_FIELDS: { value: ExtraField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "labels", label: "Labels" },
  { value: "reporter", label: "Reporter" },
  { value: "sprint", label: "Sprint" },
  { value: "created", label: "Created" },
];

const CREATED_WINDOWS = [
  { value: "-1d", label: "Last 24 hours" },
  { value: "-1w", label: "Last week" },
  { value: "-2w", label: "Last 2 weeks" },
  { value: "-4w", label: "Last 4 weeks" },
];

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
    members,
    cycles,
    updateStatus,
  } = useIssues();
  const { projects } = useProjects();
  const { workflows } = useWorkflows();
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
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [reporterFilter, setReporterFilter] = useState("ALL");
  const [sprintFilter, setSprintFilter] = useState("ALL");
  const [createdFilter, setCreatedFilter] = useState("ALL");
  // Jira shows Project, Type, Status and Assignee; "More" adds the rest.
  const [extraFields, setExtraFields] = useState<Set<ExtraField>>(new Set());
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

  const {
    filters,
    create: createFilter,
    update: updateFilter,
    remove: removeFilter,
    setStar: setFilterStar,
  } = useFilters();
  const shareDirectory = useShareDirectory();
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [filterDialog, setFilterDialog] = useState<"save" | "saveAs" | "edit" | null>(null);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const [viewedIssueIds, setViewedIssueIds] = useState<string[]>([]);

  // issueHistory() / "Viewed recently" need the viewer's recent issues.
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ recent: { id: string }[] }>("/api/your-work?only=recent&limit=50")
      .then((response) => !cancelled && setViewedIssueIds(response.recent.map((item) => item.id)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!filterNotice) return;
    const timer = window.setTimeout(() => setFilterNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [filterNotice]);

  const viewParam = searchParams.get(VIEW_PARAM);
  const viewMode: ViewMode = viewParam === "detail" || viewParam === "board" ? viewParam : "list";
  const { selectedIssueId } = useSelectedIssue();

  const baseCtx = useJqlContext(searchedAt);
  const ctx = useMemo(() => ({ ...baseCtx, viewedIssueIds }), [baseCtx, viewedIssueIds]);
  const lookups = useColumnLookups();

  const applyFilter = (id: string, jql: string) => {
    setOpenFilterId(id);
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
    setMode("jql");
    setJqlDraft(jql);
    setAppliedJql(jql);
    setSearchedAt(new Date());
  };

  // ?filter= opens a default or saved filter; saved ones wait for the list.
  const filterParam = searchParams.get("filter");
  const [appliedFilterParam, setAppliedFilterParam] = useState<string | null>(null);
  const requestedFilter = filterParam
    ? (defaultFilter(filterParam) ?? filters?.find((filter) => filter.id === filterParam) ?? null)
    : null;
  if (filterParam !== appliedFilterParam && (!filterParam || requestedFilter || filters !== null)) {
    setAppliedFilterParam(filterParam);
    if (filterParam && requestedFilter) {
      applyFilter(filterParam, searchParams.get("jql") ?? requestedFilter.jql);
    } else if (filterParam) {
      setFilterNotice("That filter doesn't exist or isn't shared with you");
    } else {
      setOpenFilterId(null);
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
      typeName: typeFilter === "ALL" ? null : typeFilter,
      reporter:
        reporterFilter === "ALL"
          ? null
          : (members.find((member) => member.id === reporterFilter)?.email ?? null),
      sprint:
        sprintFilter === "ALL"
          ? null
          : sprintFilter === "OPEN"
            ? "OPEN"
            : (cycles.find((cycle) => cycle.id === sprintFilter)?.name ?? null),
      createdWithin: createdFilter === "ALL" ? null : createdFilter,
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
    typeFilter,
    reporterFilter,
    sprintFilter,
    createdFilter,
    cycles,
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

  // j/k in the issue view walk the full result order, not just the loaded page.
  useEffect(() => {
    setIssueNavigation(results.map((issue) => issue.id));
  }, [results]);

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
    // Keep the open filter so an edited query still shows as "Edited".
    for (const key of [VIEW_PARAM, SELECTED_ISSUE_PARAM, "filter"]) {
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

  const savedFilter =
    openFilterId && !defaultFilter(openFilterId)
      ? (filters?.find((filter) => filter.id === openFilterId) ?? null)
      : null;
  const currentFilter = (openFilterId && defaultFilter(openFilterId)) || savedFilter;
  const normalizeJql = (jql: string) => jql.trim().replace(/\s+/g, " ");
  const isFilterModified =
    !!currentFilter && normalizeJql(effectiveJql) !== normalizeJql(currentFilter.jql);

  const openFilter = (id: string) => {
    const params = new URLSearchParams();
    const view = searchParams.get(VIEW_PARAM);
    if (view) params.set(VIEW_PARAM, view);
    params.set("filter", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const saveFilterChanges = async () => {
    if (!savedFilter) return;
    try {
      await updateFilter(savedFilter.id, { jql: effectiveJql });
      setFilterNotice("Filter saved");
    } catch (error) {
      setFilterNotice(error instanceof Error ? error.message : "Filter could not be saved");
    }
  };

  const deleteOpenFilter = async () => {
    if (!savedFilter) return;
    try {
      await removeFilter(savedFilter.id);
      router.replace(pathname, { scroll: false });
    } catch (error) {
      setFilterNotice(error instanceof Error ? error.message : "Filter could not be deleted");
    }
  };

  const workTypeNames = [
    ...new Set(
      Object.values(workflows).flatMap((workflow) => workflow.types.map((type) => type.name)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  // Removing a field from "More" also clears its value, as in Jira.
  const toggleExtraField = (field: ExtraField, checked: boolean) => {
    setExtraFields((current) => {
      const next = new Set(current);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
    if (checked) return;
    if (field === "priority") setPriorityFilter("ALL");
    if (field === "labels") setLabelFilter("ALL");
    if (field === "reporter") setReporterFilter("ALL");
    if (field === "sprint") setSprintFilter("ALL");
    if (field === "created") setCreatedFilter("ALL");
    markViewModified();
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
    setTypeFilter("ALL");
    setReporterFilter("ALL");
    setSprintFilter("ALL");
    setCreatedFilter("ALL");
    setExtraFields(new Set());
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
          <h1 className="jira-page-title">{currentFilter ? currentFilter.name : "Search"}</h1>
          {savedFilter && (
            <button
              type="button"
              className={savedFilter.isStarred ? "filters-star active" : "filters-star"}
              aria-pressed={savedFilter.isStarred}
              aria-label={savedFilter.isStarred ? "Unstar filter" : "Star filter"}
              onClick={() => void setFilterStar(savedFilter.id, !savedFilter.isStarred)}
            >
              <Star size={16} aria-hidden="true" />
            </button>
          )}
          {currentFilter && isFilterModified && (
            <span className="search-filter-modified">Edited</span>
          )}
          {savedFilter && (
            <Popover.Root>
              <Popover.Trigger asChild>
                <button type="button" className="text-button search-filter-details-trigger">
                  <Info size={14} aria-hidden="true" />
                  Details
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="search-popover search-filter-details" align="start" sideOffset={6}>
                  <dl>
                    <dt>Owner</dt>
                    <dd>{savedFilter.ownerName}</dd>
                    {savedFilter.description && (
                      <>
                        <dt>Description</dt>
                        <dd>{savedFilter.description}</dd>
                      </>
                    )}
                    <dt>Viewers</dt>
                    <dd>{summarizeShares(savedFilter.viewers, shareDirectory)}</dd>
                    <dt>Editors</dt>
                    <dd>
                      {savedFilter.editors.length
                        ? summarizeShares(savedFilter.editors, shareDirectory)
                        : "Owner only"}
                    </dd>
                    <dt>Starred by</dt>
                    <dd>{savedFilter.starCount}</dd>
                  </dl>
                  {savedFilter.canEdit && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setFilterDialog("edit")}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit details
                    </button>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
        <div className="jira-page-actions">
          {filterNotice && (
            <span className="search-filter-notice" role="status">
              {filterNotice}
            </span>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="secondary-button search-header-button" type="button">
                <Bookmark size={15} aria-hidden="true" />
                Filters
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="search-menu search-filter-menu" align="end" sideOffset={6}>
                <DropdownMenu.Label className="search-menu-label">Default filters</DropdownMenu.Label>
                {DEFAULT_FILTERS.map((filter) => (
                  <DropdownMenu.Item
                    key={filter.id}
                    className="search-menu-item"
                    onSelect={() => openFilter(filter.id)}
                  >
                    {filter.name}
                  </DropdownMenu.Item>
                ))}
                {(filters ?? []).filter((filter) => filter.isStarred).length > 0 && (
                  <>
                    <DropdownMenu.Separator className="search-menu-separator" />
                    <DropdownMenu.Label className="search-menu-label">Starred filters</DropdownMenu.Label>
                    {(filters ?? []).filter((filter) => filter.isStarred).map((filter) => (
                      <DropdownMenu.Item
                        key={filter.id}
                        className="search-menu-item"
                        onSelect={() => openFilter(filter.id)}
                      >
                        <Star size={13} aria-hidden="true" />
                        {filter.name}
                      </DropdownMenu.Item>
                    ))}
                  </>
                )}
                {(filters ?? []).some((filter) => filter.isMine && !filter.isStarred) && (
                  <>
                    <DropdownMenu.Separator className="search-menu-separator" />
                    <DropdownMenu.Label className="search-menu-label">My filters</DropdownMenu.Label>
                    {(filters ?? [])
                      .filter((filter) => filter.isMine && !filter.isStarred)
                      .map((filter) => (
                        <DropdownMenu.Item
                          key={filter.id}
                          className="search-menu-item"
                          onSelect={() => openFilter(filter.id)}
                        >
                          {filter.name}
                        </DropdownMenu.Item>
                      ))}
                  </>
                )}
                <DropdownMenu.Separator className="search-menu-separator" />
                <DropdownMenu.Item
                  className="search-menu-item"
                  onSelect={() => router.push("/filters")}
                >
                  <ListFilter size={14} aria-hidden="true" />
                  View all filters
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {savedFilter && isFilterModified && savedFilter.canEdit && (
            <button
              className="primary-button search-header-button"
              type="button"
              disabled={mode === "jql" && !!jqlError}
              onClick={() => void saveFilterChanges()}
            >
              Save
            </button>
          )}
          <button
            className="secondary-button search-header-button"
            type="button"
            disabled={mode === "jql" && !!jqlError}
            onClick={() => setFilterDialog(currentFilter ? "saveAs" : "save")}
          >
            <BookmarkPlus size={15} aria-hidden="true" />
            {currentFilter ? "Save as" : "Save filter"}
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
                {savedFilter?.canManage && (
                  <>
                    <DropdownMenu.Separator className="search-menu-separator" />
                    <DropdownMenu.Item
                      className="search-menu-item danger"
                      onSelect={() => void deleteOpenFilter()}
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
                <span className="sr-only">Filter by work type</span>
                <select
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value);
                    markViewModified();
                  }}
                >
                  <option value="ALL">Type: All</option>
                  {workTypeNames.map((name) => (
                    <option value={name} key={name}>
                      {name}
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
              {extraFields.has("priority") && (
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
              )}
              {extraFields.has("labels") && (
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
              )}
              {extraFields.has("reporter") && (
                <label className="select-button">
                  <span className="sr-only">Filter by reporter</span>
                  <select
                    value={reporterFilter}
                    onChange={(event) => {
                      setReporterFilter(event.target.value);
                      markViewModified();
                    }}
                  >
                    <option value="ALL">Reporter: All</option>
                    {members.map((member) => (
                      <option value={member.id} key={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {extraFields.has("sprint") && (
                <label className="select-button">
                  <span className="sr-only">Filter by sprint</span>
                  <select
                    value={sprintFilter}
                    onChange={(event) => {
                      setSprintFilter(event.target.value);
                      markViewModified();
                    }}
                  >
                    <option value="ALL">Sprint: All</option>
                    <option value="OPEN">Open sprints</option>
                    {cycles.map((cycle) => (
                      <option value={cycle.id} key={cycle.id}>
                        {cycle.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {extraFields.has("created") && (
                <label className="select-button">
                  <span className="sr-only">Filter by created date</span>
                  <select
                    value={createdFilter}
                    onChange={(event) => {
                      setCreatedFilter(event.target.value);
                      markViewModified();
                    }}
                  >
                    <option value="ALL">Created: Any time</option>
                    {CREATED_WINDOWS.map((window) => (
                      <option value={window.value} key={window.value}>
                        {window.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className="secondary-button search-more-button">
                    More
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="search-menu" align="start" sideOffset={6}>
                    <DropdownMenu.Label className="search-menu-label">Add a filter</DropdownMenu.Label>
                    {EXTRA_FIELDS.map((field) => (
                      <DropdownMenu.CheckboxItem
                        key={field.value}
                        className="search-menu-item"
                        checked={extraFields.has(field.value)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => toggleExtraField(field.value, checked)}
                      >
                        <span className="search-menu-check" aria-hidden="true">
                          {extraFields.has(field.value) ? "✓" : ""}
                        </span>
                        {field.label}
                      </DropdownMenu.CheckboxItem>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
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

      {filterDialog && (
        <FilterDetailsDialog
          title={
            filterDialog === "edit"
              ? "Edit filter details"
              : filterDialog === "saveAs"
                ? "Save as a new filter"
                : "Save filter"
          }
          submitLabel={filterDialog === "edit" ? "Save" : "Save filter"}
          initial={
            filterDialog === "edit" && savedFilter
              ? savedFilter
              : {
                  name: currentFilter ? `${currentFilter.name} (copy)` : "",
                  description: savedFilter?.description ?? null,
                  viewers: [],
                  editors: [],
                }
          }
          jqlPreview={filterDialog === "edit" && savedFilter ? savedFilter.jql : effectiveJql}
          onClose={() => setFilterDialog(null)}
          onSubmit={async (input) => {
            if (filterDialog === "edit" && savedFilter) {
              await updateFilter(savedFilter.id, input);
              setFilterNotice("Filter details saved");
              return;
            }
            const created = await createFilter({ ...input, jql: effectiveJql });
            setFilterNotice(`Saved "${created.name}"`);
            openFilter(created.id);
          }}
        />
      )}
    </div>
  );
}
