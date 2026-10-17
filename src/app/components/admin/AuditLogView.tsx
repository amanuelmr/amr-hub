"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminHeader, AdminNotice, OwnerOnly } from "./AdminShell";
import { adminRequest, formatDateTime } from "./adminClient";

type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  actorName: string;
  createdAt: string;
};

type AuditPage = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
};

export function actionLabel(action: string) {
  const [area, verb] = action.split(".");
  if (!verb) return action;
  const nice = (text: string) => text.replace(/_/g, " ");
  return `${nice(area).replace(/^./, (c) => c.toUpperCase())} ${nice(verb)}`;
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(formatDetailValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuditLogView() {
  return (
    <>
      <AdminHeader
        title="Audit log"
        description="A record of administrative changes in this workspace: projects, members, tokens, webhooks, imports and exports."
      />
      <OwnerOnly what="view the audit log">
        <AuditLogTable />
      </OwnerOnly>
    </>
  );
}

function AuditLogTable() {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [action, from, to, page]);
  const loading = loadedQuery !== query;

  useEffect(() => {
    let cancelled = false;
    adminRequest<AuditPage>(`/api/admin/audit-log?${query}`)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedQuery(query);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const pageCount = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1;
  const hasFilters = Boolean(action || from || to);

  return (
    <div className="admin-stack">
      <form className="admin-filters" onSubmit={(event) => event.preventDefault()}>
        <label className="form-field">
          <span>Action</span>
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {data?.actions.map((value) => (
              <option key={value} value={value}>
                {actionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>From</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="form-field">
          <span>To</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setAction("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </form>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      <div className="admin-table-wrap" aria-busy={loading}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((entry) => (
              <tr key={entry.id}>
                <td className="admin-nowrap">{formatDateTime(entry.createdAt)}</td>
                <td>{entry.actorName}</td>
                <td>
                  <span className="admin-pill">{actionLabel(entry.action)}</span>
                </td>
                <td>
                  <span className="admin-muted">{entry.targetType}</span>
                  {entry.targetId && <div className="admin-mono admin-break">{entry.targetId}</div>}
                </td>
                <td>
                  {Object.keys(entry.details).length === 0 ? (
                    <span className="admin-muted">—</span>
                  ) : (
                    <dl className="admin-kv">
                      {Object.entries(entry.details).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{formatDetailValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.entries.length === 0 && (
          <div className="admin-empty">
            <h2>{hasFilters ? "No events match these filters" : "No audit events yet"}</h2>
            <p>
              {hasFilters
                ? "Try a different action or a wider date range."
                : "Administrative changes will appear here as they happen."}
            </p>
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="admin-pagination">
          <span className="admin-muted">
            {(data.page - 1) * data.pageSize + 1}–
            {Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <span className="admin-muted">
              Page {data.page} of {pageCount}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((value) => value + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
