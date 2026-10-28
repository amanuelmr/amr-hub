"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Globe2, Lock, LockKeyhole, Trash2, UserPlus } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import {
  PROJECT_ACCESS_LABELS,
  PROJECT_ACCESS_LEVELS,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
  type Project,
  type ProjectAccessLevel,
  type ProjectMemberEntry,
  type ProjectRole,
} from "../../../data/projects";
import { AdminDialog, PersonAvatar, errorMessage } from "./adminUi";

type AccessSettingsPayload = {
  accessLevel: ProjectAccessLevel;
  leadUserId: string | null;
  members: ProjectMemberEntry[];
};

type WorkspaceMember = { id: string; userId: string; name: string; email: string };

const LEVEL_ICONS = { OPEN: Globe2, LIMITED: LockKeyhole, PRIVATE: Lock } as const;

export function AccessSettings({ project }: { project: Project }) {
  const { refreshProjects } = useProjects();
  const url = `/api/projects/${encodeURIComponent(project.id)}/access`;
  const [access, setAccess] = useState<AccessSettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingLevel, setSavingLevel] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<AccessSettingsPayload>(url, { signal: controller.signal })
      .then((loaded) => {
        setAccess(loaded);
        setError(null);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(loadError, "Access could not be loaded"));
        }
      });
    return () => controller.abort();
  }, [url]);

  const mutate = async (init: RequestInit, success: string, target = url) => {
    setError(null);
    setNotice(null);
    try {
      setAccess(await apiRequest<AccessSettingsPayload>(target, init));
      setNotice(success);
      await refreshProjects();
      return true;
    } catch (mutationError) {
      setError(errorMessage(mutationError, "Access could not be updated"));
      return false;
    }
  };

  const changeLevel = async (accessLevel: ProjectAccessLevel) => {
    if (!access || access.accessLevel === accessLevel) return;
    setSavingLevel(true);
    await mutate(
      { method: "PATCH", body: JSON.stringify({ accessLevel }) },
      `Access changed to ${PROJECT_ACCESS_LABELS[accessLevel].label}`,
    );
    setSavingLevel(false);
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const members = access?.members ?? [];
    if (!term) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term),
    );
  }, [access, query]);

  if (!access) {
    return error ? (
      <p className="form-submit-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="pa-muted">Loading access…</p>
    );
  }

  return (
    <div className="pa-settings-form pac-access">
      <section className="pa-fieldset" aria-labelledby="pac-level-title">
        <div>
          <h3 className="pa-section-title" id="pac-level-title">
            Project access
          </h3>
          <p className="pa-muted">
            Choose who can find, view and edit work in this project. Workspace
            owners always have access.
          </p>
        </div>
        <div className="pac-levels" role="radiogroup" aria-label="Access level">
          {PROJECT_ACCESS_LEVELS.map((level) => {
            const Icon = LEVEL_ICONS[level];
            const selected = access.accessLevel === level;
            return (
              <label
                key={level}
                className={selected ? "pac-level is-selected" : "pac-level"}
              >
                <input
                  type="radio"
                  name="project-access"
                  value={level}
                  checked={selected}
                  disabled={savingLevel}
                  onChange={() => void changeLevel(level)}
                />
                <Icon size={18} aria-hidden="true" />
                <span>
                  <strong>{PROJECT_ACCESS_LABELS[level].label}</strong>
                  <small>{PROJECT_ACCESS_LABELS[level].description}</small>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="pa-fieldset" aria-labelledby="pac-people-title">
        <div className="pa-section-header">
          <div>
            <h3 className="pa-section-title" id="pac-people-title">
              People
            </h3>
            <p className="pa-muted">
              {access.accessLevel === "OPEN"
                ? "Everyone in the workspace can work here. Roles below add admin rights or limit someone to viewing."
                : "Only the people listed here can edit work. The project lead is always an administrator."}
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus size={15} aria-hidden="true" />
            Add people
          </button>
        </div>

        {(error || notice) && (
          <p
            className={error ? "form-submit-error" : "pa-success"}
            role={error ? "alert" : "status"}
          >
            {error ?? notice}
          </p>
        )}

        <input
          className="pa-search"
          type="search"
          placeholder="Search people"
          aria-label="Search people with access"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {filtered.length === 0 ? (
          <p className="pa-muted">
            {access.members.length === 0
              ? "No one has been added to this project yet."
              : "No people match your search."}
          </p>
        ) : (
          <ul className="pac-people" aria-label="People with access">
            {filtered.map((member) => (
              <li key={member.userId} className="pac-person">
                <PersonAvatar name={member.name} />
                <span className="pac-person-name">
                  <strong>
                    {member.name}
                    {member.isLead && <span className="pac-tag">Lead</span>}
                    {member.workspaceRole === "viewer" && (
                      <span className="pac-tag" title="Workspace viewers can't edit">
                        Workspace viewer
                      </span>
                    )}
                  </strong>
                  <small>{member.email}</small>
                </span>
                <select
                  className="pac-role"
                  aria-label={`Role for ${member.name}`}
                  value={member.role}
                  onChange={(event) =>
                    void mutate(
                      {
                        method: "PATCH",
                        body: JSON.stringify({
                          userId: member.userId,
                          role: event.target.value,
                        }),
                      },
                      `${member.name} is now ${PROJECT_ROLE_LABELS[event.target.value as ProjectRole].label}`,
                    )
                  }
                >
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {PROJECT_ROLE_LABELS[role].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${member.name}`}
                  title="Remove"
                  onClick={() => {
                    if (!window.confirm(`Remove ${member.name} from ${project.name}?`)) return;
                    void mutate(
                      { method: "DELETE" },
                      `${member.name} was removed`,
                      `${url}?userId=${encodeURIComponent(member.userId)}`,
                    );
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {addOpen && (
        <AddPeopleDialog
          projectName={project.name}
          existing={new Set(access.members.map((member) => member.userId))}
          onClose={() => setAddOpen(false)}
          onAdd={async (userIds, role) => {
            const ok = await mutate(
              { method: "POST", body: JSON.stringify({ userIds, role }) },
              `${userIds.length} ${userIds.length === 1 ? "person" : "people"} added`,
            );
            if (ok) setAddOpen(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function AddPeopleDialog({
  projectName,
  existing,
  onClose,
  onAdd,
}: {
  projectName: string;
  existing: Set<string>;
  onClose: () => void;
  onAdd: (userIds: string[], role: ProjectRole) => Promise<boolean>;
}) {
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [groups, setGroups] = useState<
    { id: string; name: string; members: { userId: string }[] }[]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<ProjectRole>("MEMBER");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<WorkspaceMember[]>("/api/members", { signal: controller.signal })
      .then(setMembers)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(loadError, "Workspace members could not be loaded"));
        }
      });
    apiRequest<{ id: string; name: string; members: { userId: string }[] }[]>("/api/groups", {
      signal: controller.signal,
    })
      .then(setGroups)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Picking a group selects everyone in it who isn't in the project yet.
  const addGroup = (groupId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const ids = group.members.map((member) => member.userId).filter((id) => !existing.has(id));
    setSelected((current) => [...new Set([...current, ...ids])]);
  };

  const candidates = (members ?? []).filter((member) => {
    if (existing.has(member.userId)) return false;
    const term = query.trim().toLowerCase();
    return (
      !term ||
      member.name.toLowerCase().includes(term) ||
      member.email.toLowerCase().includes(term)
    );
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected.length === 0) {
      setError("Choose at least one person.");
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onAdd(selected, role);
    if (!ok) setSaving(false);
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add people"
      description={`Give workspace members a role in ${projectName}.`}
    >
      <form className="pa-form" onSubmit={submit} noValidate>
        <label className="form-field">
          <span>Names or emails</span>
          <input
            type="search"
            value={query}
            placeholder="Search workspace members"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {groups.length > 0 && (
          <label className="form-field">
            <span>Add a group</span>
            <select value="" onChange={(event) => addGroup(event.target.value)}>
              <option value="">Choose a group to select its members…</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.members.length})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="pac-picker" role="group" aria-label="Workspace members">
          {members === null ? (
            <p className="pa-muted">Loading members…</p>
          ) : candidates.length === 0 ? (
            <p className="pa-muted">Everyone matching is already in this project.</p>
          ) : (
            candidates.map((member) => (
              <label key={member.userId} className="pac-pick">
                <input
                  type="checkbox"
                  checked={selected.includes(member.userId)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, member.userId]
                        : current.filter((id) => id !== member.userId),
                    )
                  }
                />
                <PersonAvatar name={member.name} />
                <span className="pac-person-name">
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </span>
              </label>
            ))
          )}
        </div>
        <label className="form-field">
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
            {PROJECT_ROLES.map((value) => (
              <option key={value} value={value}>
                {PROJECT_ROLE_LABELS[value].label}
              </option>
            ))}
          </select>
          <small className="pa-muted">{PROJECT_ROLE_LABELS[role].description}</small>
        </label>
        {error && (
          <p className="form-submit-error" role="alert">
            {error}
          </p>
        )}
        <div className="pa-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
