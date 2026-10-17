"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Plus, Search } from "lucide-react";
import { apiRequest } from "../IssueProvider";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import {
  GADGET_META,
  type DashboardRecord,
} from "../components/dashboard/gadgetMeta";

const UPDATED_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<DashboardRecord[]>("/api/dashboards", { signal: controller.signal })
      .then(setDashboards)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Dashboards could not be loaded",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const visibleDashboards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (dashboards ?? []).filter(
      (dashboard) => !needle || dashboard.name.toLowerCase().includes(needle),
    );
  }, [dashboards, query]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setError(null);
    try {
      const dashboard = await apiRequest<DashboardRecord>("/api/dashboards", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      router.push(`/dashboards/${dashboard.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Dashboard could not be created",
      );
      setIsSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">Dashboards</h1>
        <div className="jira-page-actions">
          <button
            type="button"
            className="primary-button jira-compact-button"
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
          >
            <Plus size={16} aria-hidden="true" />
            Create dashboard
          </button>
        </div>
      </header>

      {isCreating && (
        <form className="panel dashboards-create" onSubmit={handleCreate}>
          <label className="gadget-field">
            <span>Dashboard name</span>
            <input
              autoFocus
              value={name}
              maxLength={80}
              placeholder="e.g. Release readiness"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="gadget-config-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setIsCreating(false);
                setName("");
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search dashboards"
            aria-label="Search dashboards"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {dashboards === null && !error ? (
        <WorkspaceLoading label="Loading dashboards" />
      ) : (
        <div className="jira-table-wrap">
          <table className="jira-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Gadgets</th>
                <th scope="col">Owner</th>
                <th scope="col">Viewers</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visibleDashboards.map((dashboard) => (
                <tr key={dashboard.id}>
                  <td>
                    <Link
                      href={`/dashboards/${dashboard.id}`}
                      className="jira-table-name"
                    >
                      <span className="dashboards-card-icon" aria-hidden="true">
                        <LayoutDashboard size={14} />
                      </span>
                      {dashboard.name}
                    </Link>
                  </td>
                  <td className="jira-table-meta">
                    {dashboard.gadgets.length === 0
                      ? "No gadgets"
                      : dashboard.gadgets
                          .slice(0, 3)
                          .map((gadget) => GADGET_META[gadget.type].label)
                          .join(", ") +
                        (dashboard.gadgets.length > 3
                          ? ` +${dashboard.gadgets.length - 3}`
                          : "")}
                  </td>
                  <td>You</td>
                  <td className="jira-table-meta">Private</td>
                  <td className="jira-table-meta">
                    <time dateTime={dashboard.updatedAt}>
                      {UPDATED_FORMAT.format(new Date(dashboard.updatedAt))}
                    </time>
                  </td>
                </tr>
              ))}
              {visibleDashboards.length === 0 && (
                <tr>
                  <td colSpan={5} className="jira-table-empty">
                    {query.trim()
                      ? "No dashboards match your search."
                      : "No dashboards yet. Create one to track the work you care about."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
