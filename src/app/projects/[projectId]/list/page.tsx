"use client";

import { type FormEvent, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";
import {
  ISSUE_ESTIMATES,
  PRIORITY_LABELS,
  type Issue,
  type IssueEstimate,
  type IssueKind,
  type IssuePriority,
  type IssueStatus,
  type StatusCategory,
} from "../../../data/issues";
import { sortIssuesByJql, textContains, type JqlField, type JqlOrderBy } from "../../../data/jql";
import { KindIcon } from "../../../components/IssueVisuals";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { COLUMNS_BY_ID, initials, issueLink } from "../../../components/search/columns";
import { useColumnLookups, useJqlContext } from "../../../components/search/useJqlContext";
import {
  isEpicLevel,
  isSubtaskLevel,
  statusCategory,
  statusName,
} from "../../../data/workflow";
import { useWorkflow } from "../../../WorkflowProvider";

type Grouping = "none" | "status" | "assignee" | "epic" | "sprint";

type ListColumnId =
  | "type"
  | "key"
  | "summary"
  | "status"
  | "assignee"
  | "due"
  | "priority"
  | "labels"
  | "created"
  | "updated"
  | "reporter"
  | "points"
  | "sprint"
  | "fixVersion"
  | "parent";

type ListColumn = {
  id: ListColumnId;
  label: string;
  sortField: JqlField;
  width: string;
};

/** Jira's list view columns, in Jira's default order; extras are opt-in. */
const LIST_COLUMNS: ListColumn[] = [
  { id: "type", label: "Type", sortField: "issuetype", width: "44px" },
  { id: "key", label: "Key", sortField: "key", width: "92px" },
  { id: "summary", label: "Summary", sortField: "summary", width: "minmax(260px, 2.4fr)" },
  { id: "status", label: "Status", sortField: "status", width: "140px" },
  { id: "assignee", label: "Assignee", sortField: "assignee", width: "minmax(140px, 1fr)" },
  { id: "due", label: "Due date", sortField: "due", width: "104px" },
  { id: "priority", label: "Priority", sortField: "priority", width: "120px" },
  { id: "labels", label: "Labels", sortField: "labels", width: "minmax(120px, 0.8fr)" },
  { id: "created", label: "Created", sortField: "created", width: "104px" },
  { id: "updated", label: "Updated", sortField: "updated", width: "104px" },
  { id: "reporter", label: "Reporter", sortField: "reporter", width: "minmax(130px, 0.8fr)" },
  { id: "points", label: "Story points", sortField: "storypoints", width: "92px" },
  { id: "sprint", label: "Sprint", sortField: "sprint", width: "120px" },
  { id: "fixVersion", label: "Fix versions", sortField: "fixversion", width: "110px" },
  { id: "parent", label: "Parent", sortField: "parent", width: "minmax(110px, 0.7fr)" },
];

const DEFAULT_LIST_COLUMNS: ListColumnId[] = [
  "type",
  "key",
  "summary",
  "status",
  "assignee",
  "due",
  "priority",
  "labels",
  "created",
  "updated",
  "reporter",
];

const COLUMNS_STORAGE_KEY = "amr.list.columns";
const AVATAR_LIMIT = 5;

function readStoredColumns(): ListColumnId[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_LIST_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LIST_COLUMNS;
    const known = new Set(LIST_COLUMNS.map((column) => column.id));
    const ids = parsed.filter((id): id is ListColumnId => known.has(id as ListColumnId));
    return ids.includes("summary") ? ids : DEFAULT_LIST_COLUMNS;
  } catch {
    return DEFAULT_LIST_COLUMNS;
  }
}


function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Group = { key: string; label: string; issues: Issue[] };

export default function ProjectListPage() {
  return (
    <Suspense fallback={<WorkspaceLoading label="list" />}>
      <ProjectList />
    </Suspense>
  );
}

function ProjectList() {
  const { projectId } = useParams<{ projectId: string }>();
  const { issues, members, isLoading, updateIssue, createIssue } = useIssues();
  const { projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const project = projects.find((candidate) => candidate.id === projectId);
  const workflow = useWorkflow(projectId);
  const workflowStatuses = workflow.statuses;
  // Inline create offers every non-subtask type of the project's scheme.
  const createKinds = workflow.types.filter((type) => !isSubtaskLevel(type.key));

  const [now] = useState(() => new Date());
  const ctx = useJqlContext(now);
  const lookups = useColumnLookups();
  const [search, setSearch] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<IssueKind | "">("");
  const [categoryFilter, setCategoryFilter] = useState<StatusCategory | "">("");
  const [visibleColumns, setVisibleColumns] = useState<ListColumnId[]>(DEFAULT_LIST_COLUMNS);
  useEffect(() => {
    // Restore the viewer's column choice after hydration (storage is per-browser).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleColumns(readStoredColumns());
  }, []);
  const [orderBy, setOrderBy] = useState<JqlOrderBy[]>([{ field: "rank", direction: "ASC" }]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<IssueKind>("TASK");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === projectId),
    [issues, projectId],
  );
  const byId = useMemo(
    () => new Map(projectIssues.map((issue) => [issue.id, issue])),
    [projectIssues],
  );

  const assignees = useMemo(() => {
    const seen = new Map<string, string>();
    let hasUnassigned = false;
    for (const issue of projectIssues) {
      if (issue.assignee) seen.set(issue.assignee.id, issue.assignee.name);
      else hasUnassigned = true;
    }
    return {
      people: [...seen.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      hasUnassigned,
    };
  }, [projectIssues]);

  const isFiltered =
    search.trim() !== "" || assigneeFilter.size > 0 || kindFilter !== "" || categoryFilter !== "";

  const matching = useMemo(() => {
    const term = search.trim();
    if (!term && assigneeFilter.size === 0 && !kindFilter && !categoryFilter) {
      return projectIssues;
    }
    const hits = new Set(
      projectIssues
        .filter(
          (issue) =>
            (!term || textContains(`${issue.id} ${issue.title}`, term)) &&
            (assigneeFilter.size === 0 || assigneeFilter.has(issue.assignee?.id ?? "none")) &&
            (!kindFilter || issue.kind === kindFilter) &&
            (!categoryFilter || statusCategory(issue.status) === categoryFilter),
        )
        .map((issue) => issue.id),
    );
    // Keep ancestors so matches stay in their hierarchy.
    for (const id of [...hits]) {
      let parentId = byId.get(id)?.parentId;
      while (parentId && byId.has(parentId) && !hits.has(parentId)) {
        hits.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    }
    return projectIssues.filter((issue) => hits.has(issue.id));
  }, [projectIssues, search, byId, assigneeFilter, kindFilter, categoryFilter]);

  const groups = useMemo<Group[]>(() => {
    const epicOf = (issue: Issue): string | null => {
      if (isEpicLevel(issue.kind)) return issue.id;
      if (isEpicLevel(issue.parent?.kind)) return issue.parent!.id;
      const parent = issue.parentId ? byId.get(issue.parentId) : undefined;
      return parent?.parent && isEpicLevel(parent.parent.kind) ? parent.parent.id : null;
    };
    const keyFor = (issue: Issue): [string, string] => {
      switch (grouping) {
        case "status":
          return [issue.status, statusName(issue.status, workflowStatuses)];
        case "assignee":
          return issue.assignee ? [issue.assignee.id, issue.assignee.name] : ["none", "Unassigned"];
        case "epic": {
          const epicId = epicOf(issue);
          const epic = epicId ? byId.get(epicId) : undefined;
          return epicId ? [epicId, epic ? `${epic.id} ${epic.title}` : epicId] : ["none", "No epic"];
        }
        case "sprint":
          return issue.cycleId
            ? [issue.cycleId, lookups.cyclesById.get(issue.cycleId)?.name ?? "Sprint"]
            : ["none", "Backlog"];
        default:
          return ["all", "All issues"];
      }
    };
    const map = new Map<string, Group>();
    for (const issue of matching) {
      const [key, label] = keyFor(issue);
      const group = map.get(key) ?? { key, label, issues: [] };
      group.issues.push(issue);
      map.set(key, group);
    }
    const list = [...map.values()];
    if (grouping === "status") {
      const statusOrder = (key: string) => {
        const index = workflowStatuses.findIndex((status) => status.key === key);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      };
      list.sort((a, b) => statusOrder(a.key) - statusOrder(b.key));
    } else if (grouping === "sprint") {
      list.sort((a, b) => {
        if (a.key === "none") return 1;
        if (b.key === "none") return -1;
        return (lookups.cyclesById.get(a.key)?.startDate ?? "").localeCompare(
          lookups.cyclesById.get(b.key)?.startDate ?? "",
        );
      });
    } else {
      list.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
    }
    return list;
  }, [matching, grouping, byId, lookups, workflowStatuses]);

  if (isLoading) return <WorkspaceLoading label="list" />;

  const columns = LIST_COLUMNS.filter((column) => visibleColumns.includes(column.id));
  const grid = columns.map((column) => column.width).join(" ");

  const setColumns = (ids: ListColumnId[]) => {
    setVisibleColumns(ids);
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  };

  const toggleColumn = (id: ListColumnId) => {
    if (id === "summary") return;
    setColumns(
      visibleColumns.includes(id)
        ? visibleColumns.filter((column) => column !== id)
        : LIST_COLUMNS.map((column) => column.id).filter(
            (column) => column === id || visibleColumns.includes(column),
          ),
    );
  };

  const toggleAssignee = (id: string) =>
    setAssigneeFilter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = () => {
    setSearch("");
    setAssigneeFilter(new Set());
    setKindFilter("");
    setCategoryFilter("");
  };

  const toggleSort = (field: JqlField) => {
    setOrderBy((current) => [
      {
        field,
        direction: current[0]?.field === field && current[0].direction === "ASC" ? "DESC" : "ASC",
      },
    ]);
  };

  const toggleCollapsed = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async (id: string, updates: Parameters<typeof updateIssue>[1]) => {
    setSavingIds((current) => new Set(current).add(id));
    await updateIssue(id, updates);
    setSavingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (title.length < 4) {
      setCreateError("Summary needs at least 4 characters");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      await createIssue({
        title,
        description: `<p>Created from the project list: ${escapeHtml(title)}</p>`,
        priority: "MEDIUM",
        kind: newKind,
        estimate: null,
        cycleId: null,
        projectId,
        assigneeId: null,
        dueDate: null,
        labelIds: [],
      });
      setNewTitle("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Issue could not be created");
    } finally {
      setIsCreating(false);
    }
  };

  const renderRows = (group: Group) => {
    const inGroup = new Set(group.issues.map((issue) => issue.id));
    const childrenOf = new Map<string, Issue[]>();
    const roots: Issue[] = [];
    for (const issue of group.issues) {
      if (issue.parentId && inGroup.has(issue.parentId)) {
        childrenOf.set(issue.parentId, [...(childrenOf.get(issue.parentId) ?? []), issue]);
      } else {
        roots.push(issue);
      }
    }
    const rows: { issue: Issue; depth: number }[] = [];
    const walk = (list: Issue[], depth: number) => {
      for (const issue of sortIssuesByJql(list, orderBy, ctx)) {
        rows.push({ issue, depth });
        if (!collapsed.has(issue.id)) walk(childrenOf.get(issue.id) ?? [], depth + 1);
      }
    };
    walk(roots, 0);

    return rows.map(({ issue, depth }) => {
      const hasChildren = childrenOf.has(issue.id);
      const isSaving = savingIds.has(issue.id);
      const href = issueLink(lookups, issue.id);
      const cell = (id: ListColumnId): ReactNode => {
        switch (id) {
          case "type":
            return <KindIcon kind={issue.kind} />;
          case "key":
            return (
              <Link className="search-key" href={href} scroll={false}>
                {issue.id}
              </Link>
            );
          case "summary":
            return (
              <span className="list-summary-cell" style={{ paddingLeft: `${depth * 22}px` }}>
                {hasChildren ? (
                  <button
                    type="button"
                    className="list-expander"
                    onClick={() => toggleCollapsed(issue.id)}
                    aria-label={collapsed.has(issue.id) ? `Expand ${issue.id}` : `Collapse ${issue.id}`}
                    aria-expanded={!collapsed.has(issue.id)}
                  >
                    {collapsed.has(issue.id) ? (
                      <ChevronRight size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="list-expander-spacer" />
                )}
                <Link href={href} scroll={false} className="list-title">
                  {issue.title}
                </Link>
                {hasChildren && (
                  <span className="search-chip">
                    {issue.doneChildCount}/{issue.childCount}
                  </span>
                )}
              </span>
            );
          case "status":
            return (
              <label className={`inline-status status-${issue.status.toLowerCase()}`}>
                <span className="sr-only">Status for {issue.id}</span>
                <i />
                <select
                  value={issue.status}
                  disabled={isViewer}
                  onChange={(event) => void save(issue.id, { status: event.target.value as IssueStatus })}
                >
                  {(workflow.statuses.some((status) => status.key === issue.status)
                    ? workflow.statuses
                    : [...workflow.statuses, { key: issue.status, name: statusName(issue.status) }]
                  ).map((status) => (
                    <option value={status.key} key={status.key}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          case "assignee":
            return (
              <select
                className="list-select"
                aria-label={`Assignee for ${issue.id}`}
                value={issue.assignee?.id ?? ""}
                disabled={isViewer}
                onChange={(event) => void save(issue.id, { assigneeId: event.target.value || null })}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            );
          case "priority":
            return (
              <select
                className={`list-select priority-${issue.priority.toLowerCase()}`}
                aria-label={`Priority for ${issue.id}`}
                value={issue.priority}
                disabled={isViewer}
                onChange={(event) => void save(issue.id, { priority: event.target.value as IssuePriority })}
              >
                {(Object.keys(PRIORITY_LABELS) as IssuePriority[]).map((priority) => (
                  <option value={priority} key={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            );
          case "points":
            return (
              <select
                className="list-select list-points"
                aria-label={`Story points for ${issue.id}`}
                value={issue.estimate ?? ""}
                disabled={isViewer}
                onChange={(event) =>
                  void save(issue.id, {
                    estimate: event.target.value === "" ? null : (Number(event.target.value) as IssueEstimate),
                  })
                }
              >
                <option value="">—</option>
                {ISSUE_ESTIMATES.map((estimate) => (
                  <option value={estimate} key={estimate}>
                    {estimate}
                  </option>
                ))}
              </select>
            );
          default:
            return COLUMNS_BY_ID.get(id)?.render(issue, lookups);
        }
      };
      return (
        <div
          className={isSaving ? "search-table-row list-row saving" : "search-table-row list-row"}
          role="row"
          key={issue.id}
          style={{ gridTemplateColumns: grid }}
        >
          {columns.map((column) => (
            <span role="cell" key={column.id} className={`list-cell-${column.id}`}>
              {cell(column.id)}
            </span>
          ))}
        </div>
      );
    });
  };

  const primary = orderBy[0];

  const visibleAvatars = assignees.people.slice(0, AVATAR_LIMIT);
  const hiddenAvatars = assignees.people.slice(AVATAR_LIMIT);

  return (
    <div className="page project-list-page">
      <div className="jira-toolbar list-toolbar">
        <label className="jira-toolbar-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search list</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search list"
          />
        </label>
        {(visibleAvatars.length > 0 || assignees.hasUnassigned) && (
          <div className="list-avatars" role="group" aria-label="Filter by assignee">
            {visibleAvatars.map((person) => (
              <button
                type="button"
                key={person.id}
                className={assigneeFilter.has(person.id) ? "list-avatar active" : "list-avatar"}
                aria-pressed={assigneeFilter.has(person.id)}
                title={person.name}
                onClick={() => toggleAssignee(person.id)}
              >
                <span className="sr-only">{person.name}</span>
                <span aria-hidden="true">{initials(person.name)}</span>
              </button>
            ))}
            {hiddenAvatars.length > 0 && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button type="button" className="list-avatar list-avatar-more" aria-label="More assignees">
                    +{hiddenAvatars.length}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="search-popover" align="start" sideOffset={6}>
                    <div className="search-column-list">
                      {hiddenAvatars.map((person) => (
                        <label key={person.id}>
                          <input
                            type="checkbox"
                            checked={assigneeFilter.has(person.id)}
                            onChange={() => toggleAssignee(person.id)}
                          />
                          {person.name}
                        </label>
                      ))}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
            {assignees.hasUnassigned && (
              <button
                type="button"
                className={assigneeFilter.has("none") ? "list-avatar list-avatar-none active" : "list-avatar list-avatar-none"}
                aria-pressed={assigneeFilter.has("none")}
                title="Unassigned"
                onClick={() => toggleAssignee("none")}
              >
                <span className="sr-only">Unassigned</span>
                <span aria-hidden="true">?</span>
              </button>
            )}
          </div>
        )}
        <label className="select-button list-filter">
          <span className="sr-only">Type</span>
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as IssueKind | "")}>
            <option value="">Type: All</option>
            {workflow.types.map((type) => (
              <option value={type.key} key={type.key}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="select-button list-filter">
          <span className="sr-only">Status category</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as StatusCategory | "")}
          >
            <option value="">Status: All</option>
            <option value="TODO">To do</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </select>
        </label>
        {isFiltered && (
          <button type="button" className="text-button" onClick={clearFilters}>
            Clear filters
          </button>
        )}
        <span className="jira-toolbar-spacer" />
        <span className="search-result-count">
          {matching.length} of {projectIssues.length}
        </span>
        <label className="select-button list-filter">
          <span className="list-control-label">Group</span>
          <select value={grouping} onChange={(event) => setGrouping(event.target.value as Grouping)}>
            <option value="none">None</option>
            <option value="status">Status</option>
            <option value="assignee">Assignee</option>
            <option value="epic">Epic</option>
            <option value="sprint">Sprint</option>
          </select>
        </label>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" className="icon-button list-more" aria-label="List options">
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="search-popover" align="end" sideOffset={6}>
              <p className="search-popover-title">Columns</p>
              <div className="search-column-list">
                {LIST_COLUMNS.map((column) => (
                  <label key={column.id}>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column.id)}
                      disabled={column.id === "summary"}
                      onChange={() => toggleColumn(column.id)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
              <button className="text-button" type="button" onClick={() => setColumns(DEFAULT_LIST_COLUMNS)}>
                Restore defaults
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setCollapsed((current) =>
                    current.size
                      ? new Set()
                      : new Set(projectIssues.filter((issue) => issue.childCount > 0).map((issue) => issue.id)),
                  )
                }
              >
                {collapsed.size ? "Expand all" : "Collapse all"}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <section className="issues-table-panel" aria-label={`${project?.name ?? "Project"} issue list`}>
        <div className="search-table-scroll">
          <div className="search-table list-table" role="table">
            <div className="search-table-row search-table-head" role="row" style={{ gridTemplateColumns: grid }}>
              {columns.map((header) => {
                const isSorted = primary?.field === header.sortField;
                return (
                  <span role="columnheader" key={header.id}>
                    <button
                      type="button"
                      className={isSorted ? "search-sort active" : "search-sort"}
                      onClick={() => toggleSort(header.sortField)}
                      aria-label={header.id === "type" ? "Sort by type" : undefined}
                    >
                      {header.id === "type" ? "T" : header.label}
                      {isSorted &&
                        (primary.direction === "ASC" ? (
                          <ArrowUp size={11} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={11} aria-hidden="true" />
                        ))}
                    </button>
                  </span>
                );
              })}
            </div>

            {groups.map((group) => (
              <div role="rowgroup" key={group.key}>
                {grouping !== "none" && (
                  <button
                    type="button"
                    className="list-group-header"
                    onClick={() => toggleCollapsed(`group:${group.key}`)}
                    aria-expanded={!collapsed.has(`group:${group.key}`)}
                  >
                    {collapsed.has(`group:${group.key}`) ? (
                      <ChevronRight size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                    {group.label}
                    <span>{group.issues.length}</span>
                  </button>
                )}
                {!collapsed.has(`group:${group.key}`) && renderRows(group)}
              </div>
            ))}

            {matching.length === 0 && (
              <div className="empty-state">
                <p>{isFiltered ? "No work items match your filters." : "This project has no work items yet."}</p>
              </div>
            )}

            {!isViewer && !isCreateOpen && (
              <button type="button" className="list-create-trigger" onClick={() => setIsCreateOpen(true)}>
                <Plus size={15} aria-hidden="true" />
                Create
              </button>
            )}

            {!isViewer && isCreateOpen && (
              <form
                className="list-create-row"
                onSubmit={handleCreate}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsCreateOpen(false);
                    setCreateError(null);
                  }
                }}
              >
                <label className="sr-only" htmlFor="list-create-kind">
                  Issue type
                </label>
                <select
                  id="list-create-kind"
                  className="list-select"
                  value={newKind}
                  onChange={(event) => setNewKind(event.target.value as IssueKind)}
                >
                  {createKinds.map((type) => (
                    <option value={type.key} key={type.key}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newTitle}
                  onChange={(event) => {
                    setNewTitle(event.target.value);
                    setCreateError(null);
                  }}
                  maxLength={255}
                  placeholder="What needs to be done?"
                  aria-label="New issue summary"
                  disabled={isCreating}
                  autoFocus
                />
                <button className="primary-button list-create-submit" type="submit" disabled={isCreating}>
                  Create
                </button>
                {createError && <span className="field-error">{createError}</span>}
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
