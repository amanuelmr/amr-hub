"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { useIssues } from "../../IssueProvider";
import { AdminHeader, AdminNotice, OwnerOnly } from "./AdminShell";
import { adminRequest } from "./adminClient";

type Group = {
  id: string;
  name: string;
  description: string | null;
  members: { userId: string; name: string; email: string }[];
};

type Draft = { id: string | null; name: string; description: string; memberIds: string[] };

const EMPTY_DRAFT: Draft = { id: null, name: "", description: "", memberIds: [] };

/** Workspace groups: named sets of people for sharing and project access. */
export function GroupsView() {
  return (
    <>
      <AdminHeader
        title="Groups"
        description="Named sets of people. Share filters and dashboards with a group, or add a whole group to a project at once."
      />
      <OwnerOnly what="manage groups">
        <GroupsManager />
      </OwnerOnly>
    </>
  );
}

function GroupsManager() {
  const { members } = useIssues();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Group | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await adminRequest<Group[]>("/api/groups"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Groups could not be loaded");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const people = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase();
    return members
      .filter((member) => member.userId)
      .filter(
        (member) =>
          !needle ||
          member.name.toLowerCase().includes(needle) ||
          member.email.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, memberQuery]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      setError("Give the group a name of at least 2 characters.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        memberIds: draft.memberIds,
      });
      await adminRequest<Group>(draft.id ? `/api/groups/${draft.id}` : "/api/groups", {
        method: draft.id ? "PATCH" : "POST",
        body,
      });
      setNotice(draft.id ? "Group saved." : "Group created.");
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Group could not be saved");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (group: Group) => {
    setError(null);
    try {
      await adminRequest(`/api/groups/${group.id}`, { method: "DELETE" });
      setNotice(`${group.name} was deleted.`);
      setConfirmDelete(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Group could not be deleted");
    }
  };

  const toggleMember = (userId: string) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            memberIds: current.memberIds.includes(userId)
              ? current.memberIds.filter((id) => id !== userId)
              : [...current.memberIds, userId],
          }
        : current,
    );

  return (
    <div className="admin-stack">
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {notice && !error && <AdminNotice tone="success">{notice}</AdminNotice>}

      {draft ? (
        <form className="admin-card admin-form" onSubmit={(event) => void save(event)} noValidate>
          <h2>{draft.id ? "Edit group" : "Create group"}</h2>
          <div className="admin-form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                value={draft.name}
                maxLength={80}
                autoFocus
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Description</span>
              <input
                value={draft.description}
                maxLength={500}
                placeholder="What the group is for"
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
          </div>
          <fieldset className="admin-fieldset">
            <legend>
              Members <span className="admin-muted">({draft.memberIds.length} selected)</span>
            </legend>
            <label className="admin-group-search">
              <Search size={14} aria-hidden="true" />
              <input
                value={memberQuery}
                placeholder="Search people"
                aria-label="Search people"
                onChange={(event) => setMemberQuery(event.target.value)}
              />
            </label>
            <div className="admin-checkbox-grid">
              {people.map((person) => (
                <label key={person.userId} className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.memberIds.includes(person.userId!)}
                    onChange={() => toggleMember(person.userId!)}
                  />
                  <span>
                    {person.name}
                    <small className="admin-muted"> {person.email}</small>
                  </span>
                </label>
              ))}
              {people.length === 0 && <p className="admin-muted">No people match.</p>}
            </div>
          </fieldset>
          <div className="admin-form-actions">
            <button type="button" className="secondary-button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSaving}>
              {isSaving ? "Saving…" : draft.id ? "Save group" : "Create group"}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setNotice(null);
              setMemberQuery("");
              setDraft(EMPTY_DRAFT);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Create group
          </button>
        </div>
      )}

      {groups === null ? (
        <p className="admin-muted">Loading groups…</p>
      ) : groups.length === 0 ? (
        <div className="admin-empty">
          <UsersRound size={22} aria-hidden="true" />
          <h2>No groups yet</h2>
          <p>Create a group to share filters and dashboards with a set of people.</p>
        </div>
      ) : (
        <ul className="admin-card-list">
          {groups.map((group) => (
            <li key={group.id} className="admin-card admin-group">
              <div className="admin-group-main">
                <h2>{group.name}</h2>
                {group.description && <p className="admin-muted">{group.description}</p>}
                <p className="admin-group-people">
                  {group.members.length === 0
                    ? "No members"
                    : `${group.members.length} ${group.members.length === 1 ? "member" : "members"}: ${group.members
                        .slice(0, 6)
                        .map((member) => member.name)
                        .join(", ")}${group.members.length > 6 ? "…" : ""}`}
                </p>
              </div>
              {confirmDelete?.id === group.id ? (
                <div className="admin-confirm">
                  <span>Delete {group.name}? Shares with it stop working.</span>
                  <button type="button" className="secondary-button" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </button>
                  <button type="button" className="danger-button" onClick={() => void remove(group)}>
                    Delete
                  </button>
                </div>
              ) : (
                <div className="admin-group-actions">
                  <button
                    type="button"
                    className="admin-icon-button"
                    aria-label={`Edit ${group.name}`}
                    onClick={() => {
                      setNotice(null);
                      setMemberQuery("");
                      setDraft({
                        id: group.id,
                        name: group.name,
                        description: group.description ?? "",
                        memberIds: group.members.map((member) => member.userId),
                      });
                    }}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button"
                    aria-label={`Delete ${group.name}`}
                    onClick={() => setConfirmDelete(group)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
