"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import {
  SHARE_TYPE_LABELS,
  dedupeShares,
  shareKey,
  type FilterShare,
  type FilterShareType,
} from "../../data/filters";

type Person = { userId: string; name: string; email: string };
type Team = { id: string; name: string };
type Group = { id: string; name: string };

/** Names for share targets: projects, groups, teams and people in the workspace. */
export function useShareDirectory() {
  const { allProjects } = useProjects();
  const [people, setPeople] = useState<Person[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<Person[]>("/api/people")
      .then((loaded) => !cancelled && setPeople(loaded))
      .catch(() => undefined);
    void apiRequest<Team[]>("/api/teams")
      .then((loaded) => !cancelled && setTeams(loaded))
      .catch(() => undefined);
    void apiRequest<Group[]>("/api/groups")
      .then((loaded) => !cancelled && setGroups(loaded))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const label = (share: FilterShare) => {
    switch (share.type) {
      case "WORKSPACE":
        return "My organization";
      case "PROJECT":
        return `Project: ${allProjects.find((project) => project.id === share.id)?.name ?? "Unknown"}`;
      case "GROUP":
        return `Group: ${groups.find((group) => group.id === share.id)?.name ?? "Unknown"}`;
      case "TEAM":
        return `Team: ${teams.find((team) => team.id === share.id)?.name ?? "Unknown"}`;
      case "USER":
        return people.find((person) => person.userId === share.id)?.name ?? "Unknown user";
    }
  };

  return { projects: allProjects, people, teams, groups, label };
}

export type ShareDirectory = ReturnType<typeof useShareDirectory>;

/** One-line summary for tables: "Private", "My organization", "3 shares"... */
export function summarizeShares(shares: FilterShare[], directory: ShareDirectory) {
  if (shares.length === 0) return "Private";
  if (shares.length === 1) return directory.label(shares[0]);
  return `${directory.label(shares[0])} +${shares.length - 1}`;
}

/** Jira's "Add viewers / Add editors" control. */
export function ShareEditor({
  label,
  shares,
  onChange,
  directory,
  disabled,
  emptyText,
}: {
  label: string;
  shares: FilterShare[];
  onChange: (shares: FilterShare[]) => void;
  directory: ShareDirectory;
  disabled?: boolean;
  emptyText: string;
}) {
  const [type, setType] = useState<FilterShareType>("WORKSPACE");
  const [targetId, setTargetId] = useState("");

  const targets =
    type === "PROJECT"
      ? directory.projects.map((project) => ({ id: project.id, name: project.name }))
      : type === "GROUP"
        ? directory.groups.map((group) => ({ id: group.id, name: group.name }))
        : type === "TEAM"
          ? directory.teams.map((team) => ({ id: team.id, name: team.name }))
          : type === "USER"
            ? directory.people.map((person) => ({ id: person.userId, name: person.name }))
            : [];

  const add = () => {
    if (type === "WORKSPACE") {
      onChange(dedupeShares([...shares, { type }]));
      return;
    }
    if (!targetId) return;
    onChange(dedupeShares([...shares, { type, id: targetId }]));
    setTargetId("");
  };

  return (
    <fieldset className="share-editor" disabled={disabled}>
      <legend>{label}</legend>
      {shares.length === 0 ? (
        <p className="share-editor-empty">{emptyText}</p>
      ) : (
        <ul className="share-editor-list">
          {shares.map((share) => (
            <li key={shareKey(share)}>
              <span>{directory.label(share)}</span>
              {!disabled && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${directory.label(share)}`}
                  onClick={() => onChange(shares.filter((item) => shareKey(item) !== shareKey(share)))}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="share-editor-add">
          <select
            aria-label={`${label}: share with`}
            value={type}
            onChange={(event) => {
              setType(event.target.value as FilterShareType);
              setTargetId("");
            }}
          >
            {(Object.keys(SHARE_TYPE_LABELS) as FilterShareType[]).map((option) => (
              <option key={option} value={option}>
                {SHARE_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
          {type !== "WORKSPACE" && (
            <select
              aria-label={`${label}: choose ${SHARE_TYPE_LABELS[type].toLowerCase()}`}
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Choose…</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={add}
            disabled={type !== "WORKSPACE" && !targetId}
          >
            Add
          </button>
        </div>
      )}
    </fieldset>
  );
}
