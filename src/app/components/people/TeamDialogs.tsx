"use client";

import { FormEvent, useState } from "react";
import { CircleAlert } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { IssueDialog } from "../issue/IssueDialogs";
import { MemberPicker, type PickablePerson } from "./MemberPicker";
import type { TeamDetail, TeamSummary } from "./types";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-submit-error" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {message}
    </p>
  );
}

/** Create a team (team = undefined) or edit its name, description and members. */
export function TeamFormDialog({
  open,
  onOpenChange,
  team,
  people,
  currentUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: TeamSummary;
  people: PickablePerson[];
  currentUserId: string | null;
  onSaved: (team: TeamDetail) => void;
}) {
  const editing = !!team;
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(
    team ? team.members.map((member) => member.userId) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        memberUserIds: memberIds,
      };
      const saved = await apiRequest<TeamDetail>(
        editing ? `/api/teams/${encodeURIComponent(team.id)}` : "/api/teams",
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      onSaved(saved);
      onOpenChange(false);
    } catch (saveError) {
      setError(errorText(saveError, "Team could not be saved"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IssueDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit team" : "Create a team"}
      description={
        editing
          ? undefined
          : "Bring people together to track the work they own. You'll be added as a member."
      }
    >
      <form className="issue-dialog-form people-team-form" onSubmit={submit}>
        <label className="form-field">
          <span>Team name</span>
          <input
            value={name}
            maxLength={80}
            autoFocus
            required
            placeholder="e.g. Platform"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Description</span>
          <textarea
            value={description}
            maxLength={1000}
            rows={3}
            placeholder="What does this team work on?"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <MemberPicker
          label={editing ? "Members" : "Add members"}
          people={people}
          selectedIds={memberIds}
          excludeIds={editing || !currentUserId ? [] : [currentUserId]}
          onChange={setMemberIds}
        />
        <FormError message={error} />
        <div className="issue-dialog-actions">
          <button className="secondary-button" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </IssueDialog>
  );
}

export function DeleteTeamDialog({
  open,
  onOpenChange,
  team,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamSummary;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/teams/${encodeURIComponent(team.id)}`, { method: "DELETE" });
      onOpenChange(false);
      onDeleted();
    } catch (deleteError) {
      setError(errorText(deleteError, "Team could not be deleted"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <IssueDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${team.name}?`}
      description="Work items assigned to this team keep their details but lose the team value."
    >
      <div className="issue-dialog-form">
        <FormError message={error} />
        <div className="issue-dialog-actions">
          <button className="secondary-button" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="danger-button" type="button" disabled={deleting} onClick={remove}>
            {deleting ? "Deleting…" : "Delete team"}
          </button>
        </div>
      </div>
    </IssueDialog>
  );
}
