"use client";

import { isDoneStatus } from "../../data/workflow";

import { FormEvent, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleAlert, X } from "lucide-react";
import type { Cycle, Issue } from "../../data/issues";
import { addDaysToDateInput, pointBreakdown, toDateInput } from "./boardModel";

function PlanningDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="save-view-dialog planning-dialog">
          <header>
            <div>
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p>{description}</p>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="form-submit-error" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {error}
    </p>
  );
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function DialogFooter({
  onCancel,
  submitLabel,
  isSubmitting,
  danger = false,
}: {
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  danger?: boolean;
}) {
  return (
    <footer>
      <button className="secondary-button" type="button" onClick={onCancel}>
        Cancel
      </button>
      <button
        className={danger ? "danger-button" : "primary-button"}
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </button>
    </footer>
  );
}

const DURATIONS = [
  { value: "1", label: "1 week" },
  { value: "2", label: "2 weeks" },
  { value: "3", label: "3 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "custom", label: "Custom" },
];

export function StartSprintDialog({
  sprint,
  issueCount,
  open,
  onOpenChange,
  onStart,
}: {
  sprint: Cycle;
  issueCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (fields: {
    name: string;
    goal: string | null;
    startDate: string;
    endDate: string;
  }) => Promise<unknown>;
}) {
  const today = toDateInput(new Date());
  const [name, setName] = useState(sprint.name);
  const [duration, setDuration] = useState("2");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysToDateInput(today, 13));
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyDuration = (nextDuration: string, nextStart: string) => {
    if (nextDuration !== "custom" && nextStart) {
      setEndDate(addDaysToDateInput(nextStart, Number(nextDuration) * 7 - 1));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2 || !startDate || !endDate) {
      setError("Add a sprint name and both dates.");
      return;
    }
    if (startDate >= endDate) {
      setError("The end date must be after the start date.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onStart({
        name: name.trim(),
        goal: goal.trim() || null,
        startDate,
        endDate,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(errorText(submitError, "The sprint could not be started"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start sprint"
      description={`${issueCount} ${issueCount === 1 ? "issue" : "issues"} will be included in this sprint.`}
    >
      <form onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Sprint name</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>Duration</span>
          <select
            value={duration}
            onChange={(event) => {
              setDuration(event.target.value);
              applyDuration(event.target.value, startDate);
            }}
          >
            {DURATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="planning-dialog-grid">
          <label className="form-field">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                applyDuration(duration, event.target.value);
              }}
            />
          </label>
          <label className="form-field">
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              disabled={duration !== "custom"}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <label className="form-field">
          <span>Sprint goal</span>
          <textarea
            value={goal}
            maxLength={500}
            rows={3}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        <FormError error={error} />
        <DialogFooter
          onCancel={() => onOpenChange(false)}
          submitLabel="Start"
          isSubmitting={isSubmitting}
        />
      </form>
    </PlanningDialog>
  );
}

export function CompleteSprintDialog({
  sprint,
  issues,
  futureSprints,
  open,
  onOpenChange,
  onComplete,
}: {
  sprint: Cycle;
  issues: Issue[];
  futureSprints: Cycle[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (destination: {
    destination: "BACKLOG" | "SPRINT" | "NEW_SPRINT";
    sprintId?: string;
  }) => Promise<unknown>;
}) {
  const [target, setTarget] = useState("BACKLOG");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const completed = issues.filter((issue) => isDoneStatus(issue.status));
  const open_ = issues.filter((issue) => !isDoneStatus(issue.status));
  const points = pointBreakdown(issues);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onComplete(
        target === "BACKLOG" || target === "NEW_SPRINT"
          ? { destination: target }
          : { destination: "SPRINT", sprintId: target },
      );
      onOpenChange(false);
    } catch (submitError) {
      setError(errorText(submitError, "The sprint could not be completed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Complete ${sprint.name}`}
      description="Wrap up the sprint and decide where unfinished work goes."
    >
      <form onSubmit={handleSubmit}>
        <div className="planning-complete-stats">
          <div>
            <strong>{completed.length}</strong>
            <span>completed issues</span>
          </div>
          <div>
            <strong>{open_.length}</strong>
            <span>open issues</span>
          </div>
          <div>
            <strong>
              {points.done} / {points.total}
            </strong>
            <span>points done</span>
          </div>
        </div>
        {open_.length > 0 ? (
          <label className="form-field">
            <span>Move open issues to</span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="BACKLOG">Backlog</option>
              {futureSprints.map((future) => (
                <option key={future.id} value={future.id}>
                  {future.name}
                </option>
              ))}
              <option value="NEW_SPRINT">New sprint</option>
            </select>
          </label>
        ) : (
          <p className="field-meta">Every issue in this sprint is done.</p>
        )}
        <FormError error={error} />
        <DialogFooter
          onCancel={() => onOpenChange(false)}
          submitLabel="Complete sprint"
          isSubmitting={isSubmitting}
        />
      </form>
    </PlanningDialog>
  );
}

export function EditSprintDialog({
  sprint,
  open,
  onOpenChange,
  onSave,
}: {
  sprint: Cycle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: {
    name: string;
    goal: string | null;
    startDate: string;
    endDate: string;
    capacity: number;
  }) => Promise<unknown>;
}) {
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [startDate, setStartDate] = useState(toDateInput(sprint.startDate));
  const [endDate, setEndDate] = useState(toDateInput(sprint.endDate));
  const [capacity, setCapacity] = useState(sprint.capacity);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2 || !startDate || !endDate || startDate >= endDate) {
      setError("Add a name and a valid date range.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        goal: goal.trim() || null,
        startDate,
        endDate,
        capacity,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(errorText(submitError, "The sprint could not be saved"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit sprint"
      description="Update the sprint name, goal and dates."
    >
      <form onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Sprint name</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <div className="planning-dialog-grid">
          <label className="form-field">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <label className="form-field">
          <span>Capacity (points)</span>
          <input
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(event) => setCapacity(Number(event.target.value) || 1)}
          />
        </label>
        <label className="form-field">
          <span>Sprint goal</span>
          <textarea
            value={goal}
            maxLength={500}
            rows={3}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        <FormError error={error} />
        <DialogFooter
          onCancel={() => onOpenChange(false)}
          submitLabel="Save"
          isSubmitting={isSubmitting}
        />
      </form>
    </PlanningDialog>
  );
}

export function DeleteSprintDialog({
  sprint,
  issueCount,
  open,
  onOpenChange,
  onDelete,
}: {
  sprint: Cycle;
  issueCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (submitError) {
      setError(errorText(submitError, "The sprint could not be deleted"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlanningDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${sprint.name}?`}
      description={
        issueCount > 0
          ? `${issueCount} ${issueCount === 1 ? "issue" : "issues"} will move to the backlog.`
          : "This sprint has no issues."
      }
    >
      <form onSubmit={handleSubmit}>
        <FormError error={error} />
        <DialogFooter
          onCancel={() => onOpenChange(false)}
          submitLabel="Delete sprint"
          isSubmitting={isSubmitting}
          danger
        />
      </form>
    </PlanningDialog>
  );
}
