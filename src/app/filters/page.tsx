"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, BellRing, Filter, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { apiRequest, useIssues } from "../IssueProvider";
import { authClient } from "../../lib/auth-client";
import type { SavedView } from "../data/issues";
import { basicFiltersToJql, parseJql, searchIssuesWithJql } from "../data/jql";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import { useJqlContext } from "../components/search/useJqlContext";
import { FilterSubscribeDialog } from "../components/FilterSubscribeDialog";
import type { FilterSubscription } from "../data/notifications";

type FilterRow = SavedView & { isMine: boolean };
type Tab = "mine" | "starred" | "all";

const STARRED_STORAGE_KEY = "amr-hub:starred-filters";

function readStarred(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STARRED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeStarred(ids: Set<string>) {
  try {
    window.localStorage.setItem(STARRED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Starring is a per-browser convenience; ignore unavailable storage.
  }
}

export default function FiltersPage() {
  const {
    issues,
    labels,
    members,
    isLoading: isWorkspaceLoading,
    deleteSavedView,
    refreshSavedViews,
  } = useIssues();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const [now] = useState(() => new Date());
  const ctx = useJqlContext(now);

  const [filters, setFilters] = useState<FilterRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FilterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editJql, setEditJql] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FilterRow | null>(null);
  const [subscribing, setSubscribing] = useState<FilterRow | null>(null);
  const [subscriptions, setSubscriptions] = useState<FilterSubscription[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ subscriptions: FilterSubscription[] }>("/api/notification-preferences", {
      signal: controller.signal,
    })
      .then((response) => setSubscriptions(response.subscriptions))
      .catch(() => {
        // Subscriptions are optional chrome on this page; the list still works.
      });
    return () => controller.abort();
  }, []);
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  // The table only renders after the client fetch, so reading storage in the
  // initializer can't cause a hydration mismatch.
  const [starred, setStarred] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readStarred(),
  );

  const toggleStar = (id: string) =>
    setStarred((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStarred(next);
      return next;
    });

  const owners = useMemo(
    () =>
      [...new Set((filters ?? []).filter((view) => !view.isSystem).map((view) => view.owner))].sort(),
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<FilterRow[]>("/api/views?scope=all", { signal: controller.signal })
      .then((rows) => setFilters(rows))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Filters could not be loaded");
        }
      });
    return () => controller.abort();
  }, []);

  const jqlFor = useMemo(
    () => (view: SavedView) =>
      view.jql ??
      basicFiltersToJql({
        text: view.query,
        status: view.status,
        priority: view.priority,
        labelName: labels.find((label) => label.id === view.labelId)?.name ?? null,
        assignee:
          view.assignee === "ALL"
            ? null
            : view.assignee === "UNASSIGNED"
              ? "UNASSIGNED"
              : (members.find((member) => member.id === view.assignee)?.email ?? view.assignee),
        sort: view.sort,
      }),
    [labels, members],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (filters ?? [])
      .filter((view) =>
        tab === "mine"
          ? view.isMine || view.isSystem
          : tab === "starred"
            ? starred.has(view.id)
            : true,
      )
      .filter((view) =>
        ownerFilter === "ALL"
          ? true
          : ownerFilter === "WORKSPACE"
            ? view.isSystem
            : !view.isSystem && view.owner === ownerFilter,
      )
      .filter(
        (view) =>
          !term ||
          view.name.toLowerCase().includes(term) ||
          view.owner.toLowerCase().includes(term),
      )
      .map((view) => {
        const jql = jqlFor(view);
        const result = searchIssuesWithJql(issues, jql, ctx);
        return { view, jql, count: result.ok ? result.issues.length : null };
      });
  }, [filters, tab, starred, ownerFilter, search, jqlFor, issues, ctx]);

  const openEdit = (view: FilterRow) => {
    setEditing(view);
    setEditName(view.name);
    setEditJql(jqlFor(view));
    setEditError(null);
  };

  const editParse = editing ? parseJql(editJql) : null;

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !editParse?.ok) return;
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await apiRequest<FilterRow>(`/api/views/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), jql: editJql.trim() }),
      });
      setFilters((current) =>
        (current ?? []).map((view) => (view.id === updated.id ? updated : view)),
      );
      void refreshSavedViews();
      setEditing(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Filter could not be saved");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    if (await deleteSavedView(id)) {
      setFilters((current) => (current ?? []).filter((view) => view.id !== id));
    }
  };

  if (isWorkspaceLoading || (!filters && !loadError)) {
    return <WorkspaceLoading label="filters" />;
  }

  return (
    <div className="page filters-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">Filters</h1>
        <div className="jira-page-actions">
          <Link className="primary-button filters-create" href="/issues?jql=">
            <Plus size={15} aria-hidden="true" />
            Create filter
          </Link>
        </div>
      </header>

      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search filters</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filters"
          />
        </label>
        <label className="select-button">
          <span className="sr-only">Filter by owner</span>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="ALL">Owner: Anyone</option>
            <option value="WORKSPACE">Workspace (system)</option>
            {owners.map((owner) => (
              <option value={owner} key={owner}>
                {owner}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-tabs" role="tablist" aria-label="Filter scope">
          {(
            [
              ["mine", "My filters"],
              ["starred", "Starred"],
              ["all", "All filters"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
              {value === "all" && <span>{filters?.length ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p className="form-submit-error" role="alert">
          {loadError}
        </p>
      )}

      <section className="issues-table-panel" aria-label="Filters">
        {rows.length === 0 ? (
          <div className="empty-state">
            <Filter size={24} aria-hidden="true" />
            <h2>{tab === "starred" ? "No starred filters" : "No filters found"}</h2>
            <p>
              {tab === "starred"
                ? "Star a filter to keep it here."
                : "Run a search and choose Save filter."}
            </p>
          </div>
        ) : (
          <div className="search-table-scroll">
            <div className="search-table filters-table" role="table">
              <div className="search-table-row search-table-head filters-row" role="row">
                <span role="columnheader">
                  <span className="sr-only">Starred</span>
                </span>
                <span role="columnheader">Name</span>
                <span role="columnheader">Owner</span>
                <span role="columnheader">Viewers</span>
                <span role="columnheader">JQL</span>
                <span role="columnheader">Work items</span>
                <span role="columnheader">
                  <span className="sr-only">Actions</span>
                </span>
              </div>
              {rows.map(({ view, jql, count }) => {
                const params = new URLSearchParams({ filter: view.id });
                if (view.jql !== null && view.jql !== undefined) params.set("jql", view.jql);
                return (
                  <div className="search-table-row filters-row" role="row" key={view.id}>
                    <span role="cell" className="filters-star-cell">
                      <button
                        type="button"
                        className={starred.has(view.id) ? "filters-star active" : "filters-star"}
                        aria-pressed={starred.has(view.id)}
                        aria-label={`${starred.has(view.id) ? "Unstar" : "Star"} ${view.name}`}
                        title={starred.has(view.id) ? "Remove from starred" : "Add to starred"}
                        onClick={() => toggleStar(view.id)}
                      >
                        <Star size={14} aria-hidden="true" />
                      </button>
                    </span>
                    <span role="cell" className="filters-name">
                      <Link href={`/issues?${params}`}>{view.name}</Link>
                      {view.isSystem && <span className="search-chip">System</span>}
                    </span>
                    <span role="cell">{view.isSystem ? "Workspace" : view.owner}</span>
                    <span role="cell" className="search-muted">
                      Workspace
                    </span>
                    <span role="cell">
                      <code className="search-jql-preview" title={jql}>
                        {jql}
                      </code>
                    </span>
                    <span role="cell">{count ?? "—"}</span>
                    <span role="cell" className="filters-actions">
                      {(() => {
                        const subscribed = subscriptions.some(
                          (subscription) => subscription.savedViewId === view.id,
                        );
                        return (
                          <button
                            className={subscribed ? "icon-button filters-subscribe active" : "icon-button filters-subscribe"}
                            type="button"
                            aria-label={`${subscribed ? "Manage subscriptions for" : "Subscribe to"} ${view.name}`}
                            title={subscribed ? "Subscribed — manage" : "Subscribe"}
                            onClick={() => setSubscribing(view)}
                          >
                            {subscribed ? (
                              <BellRing size={14} aria-hidden="true" />
                            ) : (
                              <Bell size={14} aria-hidden="true" />
                            )}
                          </button>
                        );
                      })()}
                      {view.isMine && !isViewer && (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              className="icon-button"
                              type="button"
                              aria-label={`Actions for ${view.name}`}
                              title="Actions"
                            >
                              <MoreHorizontal size={14} aria-hidden="true" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content className="search-menu" align="end" sideOffset={6}>
                              <DropdownMenu.Item
                                className="search-menu-item"
                                onSelect={() => openEdit(view)}
                              >
                                <Pencil size={14} aria-hidden="true" />
                                Edit filter
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="search-menu-item danger"
                                onSelect={() => setPendingDelete(view)}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete filter
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <p className="field-meta filters-footnote">
        Filters run live — issue counts reflect the workspace right now.
      </p>

      {editing && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setEditing(null);
          }}
        >
          <section className="save-view-dialog search-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-filter-title">
            <header>
              <div>
                <h2 id="edit-filter-title">Edit filter</h2>
                <p>Change the name or JQL of this saved filter.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(null)} aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <form onSubmit={saveEdit}>
              <label className="form-field">
                <span>Name</span>
                <input value={editName} maxLength={50} onChange={(event) => setEditName(event.target.value)} autoFocus />
              </label>
              <label className="form-field">
                <span>JQL</span>
                <textarea
                  className="jql-input"
                  value={editJql}
                  rows={3}
                  spellCheck={false}
                  aria-invalid={editParse ? !editParse.ok : false}
                  onChange={(event) => setEditJql(event.target.value)}
                />
              </label>
              {editParse && !editParse.ok && (
                <p className="field-error">
                  {editParse.error.message} (character {editParse.error.position + 1})
                </p>
              )}
              {editError && (
                <p className="form-submit-error" role="alert">
                  {editError}
                </p>
              )}
              <footer>
                <button className="secondary-button" type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSaving || editName.trim().length < 2 || !editParse?.ok}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {subscribing && (
        <FilterSubscribeDialog
          filter={subscribing}
          subscriptions={subscriptions.filter(
            (subscription) => subscription.savedViewId === subscribing.id,
          )}
          onClose={() => setSubscribing(null)}
          onChange={(next) =>
            setSubscriptions((current) => [
              ...current.filter((subscription) => subscription.savedViewId !== subscribing.id),
              ...next,
            ])
          }
        />
      )}

      {pendingDelete && (
        <div className="dialog-backdrop" role="presentation">
          <section className="save-view-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-filter-title">
            <header>
              <div>
                <h2 id="delete-filter-title">Delete “{pendingDelete.name}”?</h2>
                <p>This removes the filter for everyone. Issues are not affected.</p>
              </div>
            </header>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmDelete()}>
                Delete filter
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
