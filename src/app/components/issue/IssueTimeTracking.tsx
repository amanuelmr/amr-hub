"use client";

import { FormEvent, useState } from "react";
import { CircleAlert } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import {
  formatDuration,
  parseDuration,
  type Issue,
} from "../../data/issues";
import { IssueDialog } from "./IssueDialogs";
import {
  localDateTimeValue,
  timeTrackingSegments,
} from "./issueDetailLogic";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";
import type { RollupTotals } from "../../data/rollup";
import type { RemainingEstimateMode, Worklog } from "./types";

export function TimeTrackingBar({ issue }: { issue: Issue }) {
  const segments = timeTrackingSegments(
    issue.timeSpentMinutes,
    issue.remainingEstimateMinutes,
    issue.originalEstimateMinutes,
  );

  return (
    <span className="issue-time-tracking">
      <span
        className={`issue-time-bar${segments.overEstimate ? " is-over" : ""}`}
        role="img"
        aria-label={`${formatDuration(issue.timeSpentMinutes)} logged, ${formatDuration(
          issue.remainingEstimateMinutes,
        )} remaining`}
      >
        <span
          className="issue-time-spent"
          style={{ width: `${segments.spentPercent}%` }}
        />
        <span
          className="issue-time-remaining"
          style={{ width: `${segments.remainingPercent}%` }}
        />
      </span>
      <span className="issue-time-labels">
        <span>{formatDuration(issue.timeSpentMinutes)} logged</span>
        <span>
          {issue.remainingEstimateMinutes === null &&
          issue.originalEstimateMinutes === null
            ? "No estimate"
            : `${formatDuration(issue.remainingEstimateMinutes)} remaining`}
        </span>
      </span>
    </span>
  );
}

/** Time on this item and everything beneath it, as one bar. */
export function RollupTimeBar({ totals }: { totals: RollupTotals }) {
  const segments = timeTrackingSegments(
    totals.spentMinutes,
    totals.remainingMinutes,
    totals.originalMinutes || null,
  );
  return (
    <span className="issue-time-tracking issue-rollup-time">
      <span
        className={`issue-time-bar${segments.overEstimate ? " is-over" : ""}`}
        role="img"
        aria-label={`Including items below: ${formatDuration(totals.spentMinutes)} logged, ${formatDuration(
          totals.remainingMinutes,
        )} remaining`}
      >
        <span className="issue-time-spent" style={{ width: `${segments.spentPercent}%` }} />
        <span className="issue-time-remaining" style={{ width: `${segments.remainingPercent}%` }} />
      </span>
      <span className="issue-time-labels">
        <span>Σ {formatDuration(totals.spentMinutes)} logged</span>
        <span>
          {totals.originalMinutes > 0 && `of ${formatDuration(totals.originalMinutes)} · `}
          {formatDuration(totals.remainingMinutes)} remaining
        </span>
      </span>
    </span>
  );
}

export function LogWorkDialog({
  issue,
  worklog,
  controller,
  onClose,
}: {
  issue: Issue;
  worklog?: Worklog | null;
  controller: IssueDetailController;
  onClose: () => void;
}) {
  const [timeSpent, setTimeSpent] = useState(
    worklog ? formatDuration(worklog.minutes) : "",
  );
  const [startedAt, setStartedAt] = useState(
    localDateTimeValue(worklog ? new Date(worklog.startedAt) : new Date()),
  );
  const [mode, setMode] = useState<RemainingEstimateMode>("AUTO");
  const [remaining, setRemaining] = useState("");
  const [comment, setComment] = useState(worklog?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const minutes = parseDuration(timeSpent);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!minutes || minutes < 1) {
      setError('Enter time spent like "2h 30m" or "1d".');
      return;
    }
    const remainingMinutes = mode === "SET" ? parseDuration(remaining) : null;
    if (mode === "SET" && remainingMinutes === null) {
      setError('Enter the remaining estimate like "4h".');
      return;
    }
    const started = new Date(startedAt);
    if (Number.isNaN(started.getTime())) {
      setError("Choose when the work started.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        minutes,
        startedAt: started.toISOString(),
        comment: comment.trim() || null,
        remaining:
          mode === "SET"
            ? { mode, minutes: remainingMinutes ?? 0 }
            : { mode },
      };
      const response = await apiRequest<{ issue: Issue }>(
        worklog
          ? issueUrl(issue.id, `/worklogs/${encodeURIComponent(worklog.id)}`)
          : issueUrl(issue.id, "/worklogs"),
        {
          method: worklog ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      controller.applyIssue(response.issue);
      await controller.refreshWorklogs();
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Work could not be logged",
      );
      setIsSaving(false);
    }
  };

  const projected =
    minutes && mode === "AUTO"
      ? Math.max(
          0,
          (issue.remainingEstimateMinutes ??
            issue.originalEstimateMinutes ??
            0) -
            (minutes - (worklog?.minutes ?? 0)),
        )
      : null;

  return (
    <IssueDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={worklog ? "Edit work log" : "Log work"}
      description={`${issue.id}: ${issue.title}`}
    >
      <form className="issue-dialog-form" onSubmit={submit}>
        <TimeTrackingBar issue={issue} />
        <div className="issue-dialog-grid">
          <label className="form-field">
            <span>Time spent</span>
            <input
              value={timeSpent}
              onChange={(event) => setTimeSpent(event.target.value)}
              placeholder="2h 30m"
              aria-invalid={Boolean(timeSpent) && !minutes}
              autoFocus
            />
            <small className="field-meta">Use w, d, h and m (1d = 8h)</small>
          </label>
          <label className="form-field">
            <span>Date started</span>
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </label>
        </div>
        <fieldset className="form-field issue-radio-group">
          <legend>Remaining estimate</legend>
          <label>
            <input
              type="radio"
              name="remaining"
              checked={mode === "AUTO"}
              onChange={() => setMode("AUTO")}
            />
            Adjust automatically
            {projected !== null &&
              (issue.remainingEstimateMinutes !== null ||
                issue.originalEstimateMinutes !== null) && (
                <span className="field-meta">
                  {" "}
                  ({formatDuration(projected)} left)
                </span>
              )}
          </label>
          <label>
            <input
              type="radio"
              name="remaining"
              checked={mode === "LEAVE"}
              onChange={() => setMode("LEAVE")}
            />
            Leave estimate unchanged
          </label>
          <label className="issue-radio-inline">
            <input
              type="radio"
              name="remaining"
              checked={mode === "SET"}
              onChange={() => setMode("SET")}
            />
            Set to
            <input
              value={remaining}
              onChange={(event) => {
                setRemaining(event.target.value);
                setMode("SET");
              }}
              placeholder="4h"
              aria-label="New remaining estimate"
            />
          </label>
        </fieldset>
        <label className="form-field">
          <span>Work description</span>
          <textarea
            value={comment}
            maxLength={2000}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What did you work on?"
          />
        </label>
        {error && (
          <p className="form-submit-error" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {error}
          </p>
        )}
        <div className="issue-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : worklog ? "Save" : "Log work"}
          </button>
        </div>
      </form>
    </IssueDialog>
  );
}
