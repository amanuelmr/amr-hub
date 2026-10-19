"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  BellRing,
  Copy,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { apiRequest, useIssues } from "../IssueProvider";
import { DEFAULT_FILTERS, type FilterSummary } from "../data/filters";
import { searchIssuesWithJql } from "../data/jql";
import type { FilterSubscription } from "../data/notifications";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import { FilterSubscribeDialog } from "../components/FilterSubscribeDialog";
import { useJqlContext } from "../components/search/useJqlContext";
import { useFilters } from "../components/search/useFilters";
import { FilterDetailsDialog } from "../components/search/FilterDetailsDialog";
import { summarizeShares, useShareDirectory } from "../components/search/ShareEditor";

type Tab = "all" | "mine" | "starred";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All filters" },
  { value: "mine", label: "My filters" },
  { value: "starred", label: "Starred" },
];

function filterHref(id: string) {
  return `/issues?filter=${encodeURIComponent(id)}`;
}

export default function FiltersPage() {
  const router = useRouter();
  const { issues, isLoading } = useIssues();
  const { filters, error, update, remove, setStar, copy, changeOwner } = useFilters();
  const directory = useShareDirectory();
  const [now] = useState(() => new Date());
  const ctx = useJqlContext(now);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [editing, setEditing] = useState<FilterSummary | null>(null);
  const [deleting, setDeleting] = useState<FilterSummary | null>(null);
  const [reassigning, setReassigning] = useState<FilterSummary | null>(null);
  const [subscribing, setSubscribing] = useState<FilterSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<FilterSubscription[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ subscriptions: FilterSubscription[] }>("/api/notification-preferences", {
      signal: controller.signal,
    })
      .then((response) => setSubscriptions(response.subscriptions))
      .catch(() => {
        // Subscriptions are optional on this page; the list still works.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const owners = useMemo(
    () =>
      [...new Map((filters ?? []).map((filter) => [filter.ownerId, filter.ownerName])).entries()]
        .filter((entry): entry is [string, string] => entry[0] !== null)
        .sort((a, b) => a[1].localeCompare(b[1])),
    [filters],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const filter of filters ?? []) {
      const result = searchIssuesWithJql(issues, filter.jql, ctx);
      map.set(filter.id, result.ok ? result.issues.length : null);
    }
    return map;
  }, [filters, issues, ctx]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (filters ?? []).filter((filter) => {
      if (tab === "mine" && !filter.isMine) return false;
      if (tab === "starred" && !filter.isStarred) return false;
      if (ownerFilter && filter.ownerId !== ownerFilter) return false;
      if (!needle) return true;
      return (
        filter.name.toLowerCase().includes(needle) ||
        (filter.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [filters, tab, ownerFilter, search]);

  if (isLoading || (!filters && !error)) return <WorkspaceLoading label="filters" />;

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) setNotice(done);
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : "Something went wrong");
    }
  };

  return (
    <div className="page filters-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">Filters</h1>
        <div className="jira-page-actions">
          <Link className="primary-button jira-compact-button" href="/issues">
            <Plus size={16} aria-hidden="true" />
            Create filter
          </Link>
        </div>
      </header>

      <section className="filters-defaults" aria-label="Default filters">
        <h2>Default filters</h2>
        <ul>
          {DEFAULT_FILTERS.map((filter) => (
            <li key={filter.id}>
              <Link href={filterHref(filter.id)}>{filter.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={search}
            placeholder="Search filters"
            aria-label="Search filters"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="filters-owner-select"
          aria-label="Owner"
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <option value="">Owner: anyone</option>
          {owners.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="jira-toolbar-spacer" />
        <div className="filter-tabs" role="tablist" aria-label="Which filters">
          {TABS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={tab === option.value}
              className={tab === option.value ? "active" : ""}
              onClick={() => setTab(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="filters-notice" role="status">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <section className="empty-state filters-empty">
          <Filter size={22} aria-hidden="true" />
          <h2>{tab === "starred" ? "No starred filters" : "No filters found"}</h2>
          <p>
            {tab === "starred"
              ? "Star a filter to keep it at hand."
              : "Run a search and choose Save filter, or open a default filter above."}
          </p>
        </section>
      ) : (
        <div className="panel filters-table-panel">
          <table className="filters-table">
            <thead>
              <tr>
                <th className="filters-col-star">
                  <span className="sr-only">Starred</span>
                </th>
                <th>Name</th>
                <th>Owner</th>
                <th>Viewers</th>
                <th>Editors</th>
                <th className="filters-col-number">Starred by</th>
                <th className="filters-col-number">Work items</th>
                <th className="filters-col-actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((filter) => {
                const subscribed = subscriptions.some(
                  (subscription) => subscription.savedViewId === filter.id,
                );
                const count = counts.get(filter.id);
                return (
                  <tr key={filter.id}>
                    <td className="filters-col-star">
                      <button
                        type="button"
                        className={filter.isStarred ? "filters-star active" : "filters-star"}
                        aria-pressed={filter.isStarred}
                        aria-label={`${filter.isStarred ? "Unstar" : "Star"} ${filter.name}`}
                        onClick={() => void run(() => setStar(filter.id, !filter.isStarred))}
                      >
                        <Star size={15} aria-hidden="true" />
                      </button>
                    </td>
                    <td>
                      <Link className="filters-name" href={filterHref(filter.id)}>
                        {filter.name}
                      </Link>
                      {filter.description && (
                        <span className="filters-description">{filter.description}</span>
                      )}
                    </td>
                    <td>{filter.ownerName}</td>
                    <td className="filters-share">{summarizeShares(filter.viewers, directory)}</td>
                    <td className="filters-share">
                      {filter.editors.length ? summarizeShares(filter.editors, directory) : "Owner only"}
                    </td>
                    <td className="filters-col-number">{filter.starCount}</td>
                    <td className="filters-col-number">
                      {count === null || count === undefined ? (
                        <span title="This filter's JQL no longer works">—</span>
                      ) : (
                        count
                      )}
                    </td>
                    <td className="filters-col-actions">
                      <button
                        type="button"
                        className={subscribed ? "icon-button filters-subscribe active" : "icon-button filters-subscribe"}
                        aria-label={`${subscribed ? "Manage subscriptions for" : "Subscribe to"} ${filter.name}`}
                        title={subscribed ? "Subscribed — manage" : "Subscribe"}
                        onClick={() => setSubscribing(filter)}
                      >
                        {subscribed ? (
                          <BellRing size={14} aria-hidden="true" />
                        ) : (
                          <Bell size={14} aria-hidden="true" />
                        )}
                      </button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Actions for ${filter.name}`}
                          >
                            <MoreHorizontal size={15} aria-hidden="true" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="planning-menu" align="end" sideOffset={4}>
                            <DropdownMenu.Item
                              className="planning-menu-item"
                              onSelect={() => router.push(filterHref(filter.id))}
                            >
                              <ExternalLink size={14} aria-hidden="true" />
                              Open
                            </DropdownMenu.Item>
                            {filter.canEdit && (
                              <DropdownMenu.Item
                                className="planning-menu-item"
                                onSelect={() => setEditing(filter)}
                              >
                                <Pencil size={14} aria-hidden="true" />
                                Edit details
                              </DropdownMenu.Item>
                            )}
                            <DropdownMenu.Item
                              className="planning-menu-item"
                              onSelect={() =>
                                void run(async () => {
                                  const created = await copy(filter.id);
                                  setNotice(`Copied as "${created.name}"`);
                                })
                              }
                            >
                              <Copy size={14} aria-hidden="true" />
                              Copy
                            </DropdownMenu.Item>
                            {filter.canManage && (
                              <>
                                <DropdownMenu.Item
                                  className="planning-menu-item"
                                  onSelect={() => setReassigning(filter)}
                                >
                                  <UserRound size={14} aria-hidden="true" />
                                  Change owner
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="planning-menu-separator" />
                                <DropdownMenu.Item
                                  className="planning-menu-item danger"
                                  onSelect={() => setDeleting(filter)}
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  Delete
                                </DropdownMenu.Item>
                              </>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <FilterDetailsDialog
          title="Edit filter details"
          submitLabel="Save"
          initial={editing}
          jqlPreview={editing.jql}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await update(editing.id, input);
            setNotice("Filter details saved");
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          body="The filter, its stars and its subscriptions are removed for everyone it's shared with. This can't be undone."
          confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() => run(() => remove(deleting.id), "Filter deleted")}
        />
      )}

      {reassigning && (
        <ChangeOwnerDialog
          filter={reassigning}
          people={directory.people}
          onClose={() => setReassigning(null)}
          onSubmit={(userId) => run(() => changeOwner(reassigning.id, userId), "Owner changed")}
        />
      )}

      {subscribing && (
        <FilterSubscribeDialog
          filter={{ id: subscribing.id, name: subscribing.name }}
          subscriptions={subscriptions}
          onClose={() => setSubscribing(null)}
          onChange={setSubscriptions}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [isWorking, setIsWorking] = useState(false);
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="save-view-dialog planning-dialog filter-details-dialog">
          <header>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description>{body}</Dialog.Description>
          <footer className="filter-details-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={isWorking}
              onClick={async () => {
                setIsWorking(true);
                await onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChangeOwnerDialog({
  filter,
  people,
  onClose,
  onSubmit,
}: {
  filter: FilterSummary;
  people: { userId: string; name: string }[];
  onClose: () => void;
  onSubmit: (userId: string) => Promise<void>;
}) {
  const candidates = people.filter((person) => person.userId !== filter.ownerId);
  const [userId, setUserId] = useState(candidates[0]?.userId ?? "");
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="save-view-dialog planning-dialog filter-details-dialog">
          <header>
            <Dialog.Title asChild>
              <h2>Change owner</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description>
            The new owner of {filter.name} can edit, share and delete it.
          </Dialog.Description>
          {candidates.length === 0 ? (
            <p className="field-meta">There is no one else in this workspace yet.</p>
          ) : (
            <label className="form-field">
              <span>New owner</span>
              <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                {candidates.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <footer className="filter-details-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!userId}
              onClick={async () => {
                await onSubmit(userId);
                onClose();
              }}
            >
              Change owner
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
