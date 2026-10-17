"use client";

import { Target } from "lucide-react";
import {
  GOAL_STATUS_LABELS,
  goalProgressPercent,
  type GoalProgress,
  type GoalStatus,
} from "./goalModel";

export function GoalStatusLozenge({ status }: { status: GoalStatus }) {
  return (
    <span className={`gf-goal-status gf-goal-status-${status.toLowerCase()}`}>
      {GOAL_STATUS_LABELS[status]}
    </span>
  );
}

export function GoalIcon({ size = 14 }: { size?: number }) {
  return (
    <span className="gf-goal-icon" aria-hidden="true">
      <Target size={size} />
    </span>
  );
}

export function GoalProgressBar({
  progress,
  showLabel = true,
}: {
  progress: GoalProgress;
  showLabel?: boolean;
}) {
  const percent = goalProgressPercent(progress);
  const label =
    progress.total === 0
      ? "No work items"
      : `${progress.done} of ${progress.total} done`;
  return (
    <span className="gf-progress">
      <span
        className="gf-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <span className="gf-progress-fill" style={{ width: `${percent}%` }} />
      </span>
      {showLabel && (
        <span className="gf-progress-label" title={label}>
          {progress.total === 0 ? "—" : `${percent}%`}
        </span>
      )}
    </span>
  );
}

export function formatGoalDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00.000Z`));
}
