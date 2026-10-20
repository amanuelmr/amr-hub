"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Copy,
  ExternalLink,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { apiRequest } from "../IssueProvider";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FilterDetailsDialog } from "../components/search/FilterDetailsDialog";
import { summarizeShares, useShareDirectory } from "../components/search/ShareEditor";
import type { DashboardRecord } from "../components/dashboard/gadgetMeta";

type Tab = "all" | "mine" | "starred";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All dashboards" },
  { value: "mine", label: "My dashboards" },
  { value: "starred", label: "Starred" },
];

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function DashboardsPage() {
  const router = useRouter();
  const directory = useShareDirectory();
  const [dashboards, setDashboards] = useState<DashboardRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [sharing, setSharing] = useState<DashboardRecord | null>(null);
  const [deleting, setDeleting] = useState<DashboardRecord | null>(null);
  const [reassigning, setReassigning] = useState<DashboardRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<DashboardRecord[]>("/api/dashboards", { signal: controller.signal })
      .then(setDashboards)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(messageFrom(requestError, "Dashboards could not be loaded"));
        }
      });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (dashboards ?? []).filter((dashboard) => {
      if (tab === "mine" && !dashboard.isMine) return false;
      if (tab === "starred" && !dashboard.isStarred) return false;
      if (!needle) return true;
      return (
        dashboard.name.toLowerCase().includes(needle) ||
        (dashboard.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [dashboards, tab, query]);

  const replace = (dashboard: DashboardRecord) =>
    setDashboards((current) =>
      (current ?? []).map((item) => (item.id === dashboard.id ? dashboard : item)),
    );

  const path = (id: string, suffix = "") => `/api/dashboards/${encodeURIComponent(id)}${suffix}`;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(messageFrom(actionError, "Something went wrong"));
    }
  };

  if (!dashboards && !error) return <WorkspaceLoading label="dashboards" />;

  return (
    <div className="page filters-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">Dashboards</h1>
        <div className="jira-page-actions">
          <button
            type="button"
            className="primary-button jira-compact-button"
            onClick={() => setIsCreating(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Create dashboard
          </button>
        </div>
      </header>

      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            placeholder="Search dashboards"
            aria-label="Search dashboards"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="jira-toolbar-spacer" />
        <div className="filter-tabs" role="tablist" aria-label="Which dashboards">
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

      {rows.length === 0 ? (
        <section className="empty-state filters-empty">
          <LayoutDashboard size={22} aria-hidden="true" />
          <h2>{tab === "starred" ? "No starred dashboards" : "No dashboards found"}</h2>
          <p>
            {tab === "starred"
              ? "Star a dashboard to keep it at hand."
              : "Create a dashboard, or ask a teammate to share theirs."}
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
                <th className="filters-col-number">Gadgets</th>
                <th className="filters-col-actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((dashboard) => (
                <tr key={dashboard.id}>
                  <td className="filters-col-star">
                    <button
                      type="button"
                      className={dashboard.isStarred ? "filters-star active" : "filters-star"}
                      aria-pressed={dashboard.isStarred}
                      aria-label={`${dashboard.isStarred ? "Unstar" : "Star"} ${dashboard.name}`}
                      onClick={() =>
                        void run(async () =>
                          replace(
                            await apiRequest<DashboardRecord>(path(dashboard.id, "/star"), {
                              method: dashboard.isStarred ? "DELETE" : "POST",
                            }),
                          ),
                        )
                      }
                    >
                      <Star size={15} aria-hidden="true" />
                    </button>
                  </td>
                  <td>
                    <Link className="filters-name" href={`/dashboards/${dashboard.id}`}>
                      {dashboard.name}
                    </Link>
                    {dashboard.description && (
                      <span className="filters-description">{dashboard.description}</span>
                    )}
                  </td>
                  <td>{dashboard.ownerName}</td>
                  <td className="filters-share">{summarizeShares(dashboard.viewers, directory)}</td>
                  <td className="filters-share">
                    {dashboard.editors.length
                      ? summarizeShares(dashboard.editors, directory)
                      : "Owner only"}
                  </td>
                  <td className="filters-col-number">{dashboard.starCount}</td>
                  <td className="filters-col-number">{dashboard.gadgets.length}</td>
                  <td className="filters-col-actions">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Actions for ${dashboard.name}`}
                        >
                          <MoreHorizontal size={15} aria-hidden="true" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="planning-menu" align="end" sideOffset={4}>
                          <DropdownMenu.Item
                            className="planning-menu-item"
                            onSelect={() => router.push(`/dashboards/${dashboard.id}`)}
                          >
                            <ExternalLink size={14} aria-hidden="true" />
                            Open
                          </DropdownMenu.Item>
                          {dashboard.canEdit && (
                            <DropdownMenu.Item
                              className="planning-menu-item"
                              onSelect={() => setSharing(dashboard)}
                            >
                              <Share2 size={14} aria-hidden="true" />
                              Share and details
                            </DropdownMenu.Item>
                          )}
                          <DropdownMenu.Item
                            className="planning-menu-item"
                            onSelect={() =>
                              void run(async () => {
                                const created = await apiRequest<DashboardRecord>(
                                  path(dashboard.id, "/copy"),
                                  { method: "POST" },
                                );
                                setDashboards((current) => [...(current ?? []), created]);
                              })
                            }
                          >
                            <Copy size={14} aria-hidden="true" />
                            Copy
                          </DropdownMenu.Item>
                          {dashboard.canManage && (
                            <>
                              <DropdownMenu.Item
                                className="planning-menu-item"
                                onSelect={() => setReassigning(dashboard)}
                              >
                                <UserRound size={14} aria-hidden="true" />
                                Change owner
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="planning-menu-separator" />
                              <DropdownMenu.Item
                                className="planning-menu-item danger"
                                onSelect={() => setDeleting(dashboard)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isCreating && (
        <FilterDetailsDialog
          title="Create dashboard"
          submitLabel="Create"
          noun="dashboard"
          initial={{ name: "", description: null, viewers: [], editors: [] }}
          onClose={() => setIsCreating(false)}
          onSubmit={async (input) => {
            const created = await apiRequest<DashboardRecord>("/api/dashboards", {
              method: "POST",
              body: JSON.stringify(input),
            });
            router.push(`/dashboards/${created.id}`);
          }}
        />
      )}

      {sharing && (
        <FilterDetailsDialog
          title="Share dashboard"
          submitLabel="Save"
          noun="dashboard"
          initial={sharing}
          onClose={() => setSharing(null)}
          onSubmit={async (input) => {
            replace(
              await apiRequest<DashboardRecord>(path(sharing.id), {
                method: "PATCH",
                body: JSON.stringify(input),
              }),
            );
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          body="The dashboard and its gadgets are removed for everyone it's shared with. This can't be undone."
          confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            run(async () => {
              await apiRequest<unknown>(path(deleting.id), { method: "DELETE" });
              setDashboards((current) => (current ?? []).filter((item) => item.id !== deleting.id));
            })
          }
        />
      )}

      {reassigning && (
        <ChangeOwnerDialog
          name={reassigning.name}
          ownerId={reassigning.ownerId}
          people={directory.people}
          onClose={() => setReassigning(null)}
          onSubmit={(userId) =>
            run(async () => {
              const updated = await apiRequest<Partial<DashboardRecord>>(
                path(reassigning.id, "/owner"),
                { method: "PATCH", body: JSON.stringify({ userId }) },
              );
              // A private dashboard leaves the list once someone else owns it.
              if (updated.id) replace(updated as DashboardRecord);
              else
                setDashboards((current) =>
                  (current ?? []).filter((item) => item.id !== reassigning.id),
                );
            })
          }
        />
      )}
    </div>
  );
}

function ChangeOwnerDialog({
  name,
  ownerId,
  people,
  onClose,
  onSubmit,
}: {
  name: string;
  ownerId: string;
  people: { userId: string; name: string }[];
  onClose: () => void;
  onSubmit: (userId: string) => Promise<void>;
}) {
  const candidates = people.filter((person) => person.userId !== ownerId);
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
          <Dialog.Description>The new owner of {name} can edit, share and delete it.</Dialog.Description>
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
