"use client";

import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import type { Cycle, Issue } from "../../data/issues";
import type { BurndownPoint } from "../../data/reports";
import { isDoneStatus, statusCategory } from "../../data/workflow";
import { useWorkflows } from "../../WorkflowProvider";
import { KindIcon } from "../IssueVisuals";
import { useChartTheme } from "../reports/useChartTheme";
import { epicColor, epicOf, pointBreakdown } from "./boardModel";
import { averageVelocity } from "./boardRules";

type BurndownPayload = { burndown: { points: BurndownPoint[]; committed: number } };

function useBurndown(cycleId: string | null) {
  const [state, setState] = useState<{
    cycleId: string | null;
    points: BurndownPoint[] | null;
    error: string | null;
  }>({ cycleId: null, points: null, error: null });

  useEffect(() => {
    if (!cycleId) return;
    const controller = new AbortController();
    apiRequest<BurndownPayload>(
      `/api/reports/burndown?cycleId=${encodeURIComponent(cycleId)}`,
      { signal: controller.signal },
    )
      .then((data) =>
        setState({ cycleId, points: data.burndown.points, error: null }),
      )
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          cycleId,
          points: null,
          error: error instanceof Error ? error.message : "Burndown could not be loaded",
        });
      });
    return () => controller.abort();
  }, [cycleId]);

  return state.cycleId === cycleId
    ? state
    : { cycleId, points: null, error: null };
}

function ProgressBar({
  todo,
  inProgress,
  done,
}: {
  todo: number;
  inProgress: number;
  done: number;
}) {
  const total = todo + inProgress + done;
  const pct = (value: number) => (total ? `${(value / total) * 100}%` : "0%");
  return (
    <div className="insights-bar" aria-hidden="true">
      <i className="done" style={{ width: pct(done) }} />
      <i className="progress" style={{ width: pct(inProgress) }} />
      <i className="todo" style={{ width: pct(todo) }} />
    </div>
  );
}

function Burndown({ sprint }: { sprint: Cycle }) {
  const theme = useChartTheme();
  const { points, error } = useBurndown(sprint.id);
  if (error) return <p className="insights-muted">{error}</p>;
  if (!points) return <p className="insights-muted">Loading burndown…</p>;
  if (points.length === 0) return <p className="insights-muted">No burndown data yet.</p>;
  return (
    <div className="insights-chart" role="img" aria-label={`Burndown for ${sprint.name}`}>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: theme.muted, fontSize: 10, fontFamily: theme.font }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: theme.muted, fontSize: 10, fontFamily: theme.font }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: theme.surface,
              border: `2px solid ${theme.ink}`,
              borderRadius: 3,
              fontSize: 11,
            }}
          />
          <Line
            dataKey="guideline"
            name="Guideline"
            stroke={theme.muted}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="remaining"
            name="Remaining"
            stroke={theme.critical}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Jira's board/backlog "Insights" drawer. */
export function InsightsPanel({
  projectId,
  sprints,
  issues,
  cycles,
  onClose,
}: {
  projectId: string;
  /** Sprints in scope (empty on Kanban boards). */
  sprints: Cycle[];
  /** Work items in scope: the sprint(s) or the Kanban board. */
  issues: Issue[];
  cycles: Cycle[];
  onClose: () => void;
}) {
  const { typeMeta } = useWorkflows();
  const [sprintId, setSprintId] = useState<string | null>(null);
  const sprint =
    sprints.find((candidate) => candidate.id === sprintId) ?? sprints[0] ?? null;
  const scoped = sprint
    ? issues.filter((issue) => issue.cycleId === sprint.id)
    : issues;
  const points = pointBreakdown(scoped);
  const counts = { todo: 0, inProgress: 0, done: 0 };
  for (const issue of scoped) {
    const category = statusCategory(issue.status);
    if (category === "DONE") counts.done += 1;
    else if (category === "IN_PROGRESS") counts.inProgress += 1;
    else counts.todo += 1;
  }

  const kinds = new Map<string, number>();
  for (const issue of scoped) kinds.set(issue.kind, (kinds.get(issue.kind) ?? 0) + 1);

  const epics = new Map<string, { id: string; title: string; total: number; done: number }>();
  for (const issue of scoped) {
    const epic = epicOf(issue);
    const key = epic?.id ?? "";
    const entry = epics.get(key) ?? {
      id: key,
      title: epic?.title ?? "Issues without epic",
      total: 0,
      done: 0,
    };
    entry.total += 1;
    if (isDoneStatus(issue.status)) entry.done += 1;
    epics.set(key, entry);
  }

  const velocity = averageVelocity(cycles, projectId);
  const committed = sprint ? (sprint.committedPoints ?? points.total) : 0;

  return (
    <aside className="planning-insights" aria-label="Insights">
      <header className="planning-insights-header">
        <h2>Insights</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close insights"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {sprints.length > 1 && (
        <label className="form-field insights-sprint-picker">
          <span>Sprint</span>
          <select
            value={sprint?.id ?? ""}
            onChange={(event) => setSprintId(event.target.value)}
          >
            {sprints.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="insights-card">
        <h3>{sprint ? "Sprint progress" : "Board progress"}</h3>
        <ProgressBar
          todo={points.total ? points.todo : counts.todo}
          inProgress={points.total ? points.inProgress : counts.inProgress}
          done={points.total ? points.done : counts.done}
        />
        <dl className="insights-legend">
          <div>
            <dt><span className="insights-dot done" />Done</dt>
            <dd>{points.done} pts · {counts.done}</dd>
          </div>
          <div>
            <dt><span className="insights-dot progress" />In progress</dt>
            <dd>{points.inProgress} pts · {counts.inProgress}</dd>
          </div>
          <div>
            <dt><span className="insights-dot todo" />To do</dt>
            <dd>{points.todo} pts · {counts.todo}</dd>
          </div>
        </dl>
      </section>

      {sprint && (
        <section className="insights-card">
          <h3>Sprint burndown</h3>
          <Burndown sprint={sprint} />
        </section>
      )}

      {sprint && (
        <section className="insights-card">
          <h3>Sprint commitment</h3>
          <p className="insights-stat">
            <strong>{committed}</strong> pts committed
          </p>
          {velocity ? (
            <p className="insights-muted">
              Average velocity of the last {velocity.sprints}{" "}
              {velocity.sprints === 1 ? "sprint" : "sprints"}:{" "}
              <strong>{velocity.average}</strong> pts.{" "}
              {committed > velocity.average * 1.1
                ? "This sprint may be overcommitted."
                : committed < velocity.average * 0.9
                  ? "This sprint is under your usual velocity."
                  : "This sprint matches your usual velocity."}
            </p>
          ) : (
            <p className="insights-muted">
              Complete a sprint to compare commitment with velocity.
            </p>
          )}
        </section>
      )}

      <section className="insights-card">
        <h3>Work type breakdown</h3>
        {kinds.size === 0 ? (
          <p className="insights-muted">No work items.</p>
        ) : (
          <ul className="insights-list">
            {[...kinds.entries()]
              .sort((left, right) => right[1] - left[1])
              .map(([kind, count]) => (
                <li key={kind}>
                  <KindIcon kind={kind} projectId={projectId} />
                  <span>{typeMeta(projectId, kind).name}</span>
                  <strong>{count}</strong>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="insights-card">
        <h3>Epic progress</h3>
        {epics.size === 0 ? (
          <p className="insights-muted">No work items.</p>
        ) : (
          <ul className="insights-list epics">
            {[...epics.values()].map((epic) => (
              <li key={epic.id || "none"}>
                <span
                  className="planning-epic-swatch"
                  style={{
                    background: epic.id ? epicColor(epic.id) : "var(--gray-300)",
                  }}
                  aria-hidden="true"
                />
                <span className="insights-epic-name">{epic.title}</span>
                <strong>
                  {epic.done}/{epic.total}
                </strong>
                <span className="insights-bar small" aria-hidden="true">
                  <i
                    className="done"
                    style={{ width: `${(epic.done / epic.total) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
