"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import {
  RUN_STATUS_LABELS,
  RUN_STATUSES,
  type AutomationRule,
  type AutomationRunEntry,
  type AutomationRunStatus,
} from "../../../server/automationRules";

type RunPage = { runs: AutomationRunEntry[]; nextCursor: string | null };

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const STATUS_CLASS: Record<AutomationRunStatus, string> = {
  SUCCESS: "au-status au-status-success",
  NO_ACTION: "au-status au-status-none",
  ERROR: "au-status au-status-error",
};

export function RunStatusBadge({ status }: { status: AutomationRunStatus }) {
  return (
    <span className={STATUS_CLASS[status] ?? "au-status"}>
      {RUN_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * The automation audit log. With `ruleId` it shows one rule's runs (rule
 * details); otherwise the whole project's, filterable by rule.
 */
export function AutomationAuditLog({
  projectId,
  rules = [],
  ruleId,
  refreshKey = 0,
  compact = false,
}: {
  projectId: string;
  rules?: AutomationRule[];
  ruleId?: string;
  refreshKey?: number;
  compact?: boolean;
}) {
  const [ruleFilter, setRuleFilter] = useState("");
  const [status, setStatus] = useState<AutomationRunStatus | "">("");
  const [issue, setIssue] = useState("");
  const [issueQuery, setIssueQuery] = useState("");
  const [runs, setRuns] = useState<AutomationRunEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const query = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ limit: compact ? "10" : "25" });
      const rule = ruleId ?? ruleFilter;
      if (rule) params.set("ruleId", rule);
      if (status) params.set("status", status);
      if (issueQuery.trim()) params.set("issue", issueQuery.trim());
      if (cursor) params.set("cursor", cursor);
      return `/api/projects/${encodeURIComponent(projectId)}/automation/runs?${params}`;
    },
    [compact, issueQuery, projectId, ruleFilter, ruleId, status],
  );

  const requestKey = `${query()}#${refreshKey}#${reloadKey}`;
  const isLoading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<RunPage>(query(), { signal: controller.signal })
      .then((page) => {
        setRuns(page.runs);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Audit log could not be loaded",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(requestKey);
      });
    return () => controller.abort();
  }, [query, requestKey]);

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      const page = await apiRequest<RunPage>(query(nextCursor));
      setRuns((current) => [...current, ...page.runs]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Audit log could not be loaded",
      );
    }
  };

  return (
    <section className="au-audit" aria-label="Audit log">
      {!compact && (
        <form
          className="au-audit-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setIssueQuery(issue);
          }}
        >
          {!ruleId && (
            <label className="form-field">
              <span>Rule</span>
              <select
                value={ruleFilter}
                onChange={(event) => setRuleFilter(event.target.value)}
              >
                <option value="">All rules</option>
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AutomationRunStatus | "")
              }
            >
              <option value="">Any status</option>
              {RUN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RUN_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Issue</span>
            <input
              placeholder="e.g. WEB-12"
              value={issue}
              maxLength={40}
              onChange={(event) => setIssue(event.target.value)}
              onBlur={() => setIssueQuery(issue)}
            />
          </label>
          <button
            type="button"
            className="icon-button au-refresh"
            aria-label="Refresh audit log"
            title="Refresh"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        </form>
      )}

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {isLoading && runs.length === 0 ? (
        <p className="pa-muted">Loading audit log…</p>
      ) : runs.length === 0 ? (
        <p className="pa-muted au-empty">
          {status || issueQuery || ruleFilter
            ? "No runs match these filters."
            : "No runs yet. Runs appear here every time the rule is triggered."}
        </p>
      ) : (
        <ol className="au-audit-list">
          {runs.map((run) => (
            <li key={run.id}>
              <RunStatusBadge status={run.status} />
              <div className="au-audit-body">
                <div className="au-audit-meta">
                  {!ruleId && <strong>{run.ruleName}</strong>}
                  {run.issueId && (
                    <Link href={`/issues/${encodeURIComponent(run.issueId)}`}>
                      {run.issueId}
                    </Link>
                  )}
                  <time dateTime={run.createdAt}>
                    {formatTime(run.createdAt)}
                  </time>
                </div>
                <p>{run.message}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {nextCursor && (
        <button type="button" className="text-button" onClick={loadMore}>
          Show more
        </button>
      )}
    </section>
  );
}
