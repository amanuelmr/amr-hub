"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Search, Target } from "lucide-react";
import { apiRequest } from "../IssueProvider";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import {
  PersonAvatar,
  useWorkspaceRole,
} from "../projects/[projectId]/settings/adminUi";
import { CreateGoalDialog } from "../components/goals/CreateGoalDialog";
import {
  formatGoalDate,
  GoalIcon,
  GoalProgressBar,
  GoalStatusLozenge,
} from "../components/goals/GoalVisuals";
import {
  CLOSED_GOAL_STATUSES,
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  isGoalOverdue,
  sortGoals,
  type GoalListResponse,
  type GoalStatus,
} from "../components/goals/goalModel";

type StatusFilter = "ACTIVE" | "ALL" | GoalStatus;

export default function GoalsPage() {
  const router = useRouter();
  const { isViewer, userId } = useWorkspaceRole();
  const [data, setData] = useState<GoalListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<GoalListResponse>("/api/goals", { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error ? requestError.message : "Goals could not be loaded",
        );
      });
    return () => controller.abort();
  }, []);

  const goals = useMemo(() => data?.goals ?? [], [data]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return goals.filter((goal) => {
      if (needle && !goal.name.toLowerCase().includes(needle)) return false;
      if (statusFilter === "ACTIVE" && CLOSED_GOAL_STATUSES.includes(goal.status)) {
        return false;
      }
      if (statusFilter !== "ACTIVE" && statusFilter !== "ALL" && goal.status !== statusFilter) {
        return false;
      }
      if (ownerFilter && goal.owner?.userId !== ownerFilter) return false;
      return true;
    });
  }, [goals, query, statusFilter, ownerFilter]);

  const isFiltered = Boolean(query.trim()) || statusFilter !== "ACTIVE" || Boolean(ownerFilter);

  return (
    <div className="page gf-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">Goals</h1>
        {!isViewer && (
          <div className="jira-page-actions">
            <button
              type="button"
              className="primary-button jira-compact-button"
              onClick={() => setIsCreating(true)}
              disabled={!data}
            >
              <Plus size={16} aria-hidden="true" />
              Create goal
            </button>
          </div>
        )}
      </header>

      <div className="jira-toolbar gf-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search goals"
            aria-label="Search goals"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="gf-toolbar-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="ACTIVE">Active goals</option>
          <option value="ALL">All goals</option>
          {GOAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {GOAL_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select
          className="gf-toolbar-select"
          aria-label="Filter by owner"
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <option value="">Any owner</option>
          {userId && <option value={userId}>Owned by me</option>}
          {(data?.people ?? [])
            .filter((person) => person.userId !== userId)
            .map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
        </select>
      </div>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {!data && !error ? (
        <WorkspaceLoading label="goals" />
      ) : data && goals.length === 0 ? (
        <div className="empty-state gf-empty">
          <Target size={26} aria-hidden="true" />
          <h2>Set your first goal</h2>
          <p>
            Goals connect the work in your projects to the outcomes they drive. Link epics and
            work items to a goal to track its progress.
          </p>
          {!isViewer && (
            <button type="button" className="primary-button" onClick={() => setIsCreating(true)}>
              Create goal
            </button>
          )}
        </div>
      ) : data ? (
        <div className="jira-table-wrap gf-table-wrap">
          <table className="jira-table gf-table">
            <thead>
              <tr>
                <th scope="col">Goal</th>
                <th scope="col">Status</th>
                <th scope="col">Owner</th>
                <th scope="col">Target date</th>
                <th scope="col">Progress</th>
                <th scope="col">Sub-goals</th>
              </tr>
            </thead>
            <tbody>
              {sortGoals(visible).map((goal) => {
                const overdue = isGoalOverdue(goal);
                return (
                  <tr key={goal.id}>
                    <td>
                      <Link href={`/goals/${goal.id}`} className="jira-table-name gf-goal-name">
                        <GoalIcon />
                        <span>
                          {goal.name}
                          {goal.parent && (
                            <small className="gf-goal-parent">Sub-goal of {goal.parent.name}</small>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <GoalStatusLozenge status={goal.status} />
                    </td>
                    <td>
                      {goal.owner ? (
                        <span className="pa-lead" title={goal.owner.email}>
                          <PersonAvatar name={goal.owner.name} />
                          {goal.owner.name}
                        </span>
                      ) : (
                        <span className="pa-muted">No owner</span>
                      )}
                    </td>
                    <td className="jira-table-meta">
                      {goal.targetDate ? (
                        <span className={overdue ? "gf-overdue" : undefined}>
                          {overdue && <AlertTriangle size={12} aria-label="Overdue" />}
                          {formatGoalDate(goal.targetDate)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <GoalProgressBar progress={goal.progress} />
                    </td>
                    <td className="jira-table-meta">{goal.subGoalCount || "—"}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="jira-table-empty">
                    {isFiltered ? "No goals match these filters." : "No goals yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && (
        <CreateGoalDialog
          open={isCreating}
          onOpenChange={setIsCreating}
          people={data.people}
          goals={sortGoals(data.goals)}
          defaultOwnerId={userId}
          onCreated={(goal) => router.push(`/goals/${goal.id}`)}
        />
      )}
    </div>
  );
}
