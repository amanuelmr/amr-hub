"use client";

import { FormEvent, useState } from "react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { AdminDialog } from "../../projects/[projectId]/settings/adminUi";
import { RichTextEditor } from "../RichTextEditor";
import type { GoalPerson, GoalSummary } from "./goalModel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: GoalPerson[];
  goals: GoalSummary[];
  defaultParentId?: string | null;
  defaultOwnerId?: string | null;
  onCreated: (goal: GoalSummary) => void;
};

export function CreateGoalDialog(props: Props) {
  return (
    <AdminDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.defaultParentId ? "Create sub-goal" : "Create goal"}
      description="Goals describe the outcomes your work items deliver."
      wide
    >
      {props.open && <CreateGoalForm {...props} />}
    </AdminDialog>
  );
}

function CreateGoalForm({
  onOpenChange,
  people,
  goals,
  defaultParentId,
  defaultOwnerId,
  onCreated,
}: Props) {
  const { members } = useIssues();
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId ?? "");
  const [targetDate, setTargetDate] = useState("");
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Give the goal a name.");
      return;
    }
    setNameError(null);
    setIsSaving(true);
    setError(null);
    try {
      const goal = await apiRequest<GoalSummary>("/api/goals", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ownerId: ownerId || null,
          targetDate: targetDate || null,
          parentId: parentId || null,
          description,
        }),
      });
      onCreated(goal);
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Goal could not be created",
      );
      setIsSaving(false);
    }
  };

  return (
    <form className="pa-form gf-goal-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field">
        <span>Name (required)</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={255}
          placeholder="e.g. Reach 10k weekly active teams"
          aria-invalid={Boolean(nameError)}
          autoFocus
        />
        {nameError && (
          <small className="gf-field-error" role="alert">
            {nameError}
          </small>
        )}
      </label>
      <div className="gf-form-grid">
        <label className="form-field">
          <span>Owner</span>
          <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">No owner</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </label>
      </div>
      <label className="form-field">
        <span>Parent goal</span>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">None</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-field">
        <span>Description</span>
        <div className="gf-editor">
          <RichTextEditor
            value={description}
            onChange={setDescription}
            members={members}
            placeholder="What does success look like, and why does it matter?"
          />
        </div>
      </div>
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <div className="pa-dialog-actions">
        <button className="secondary-button" type="button" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}
