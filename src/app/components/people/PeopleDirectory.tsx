"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, UsersRound } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { authClient } from "../../../lib/auth-client";
import { WorkspaceLoading } from "../WorkspaceLoading";
import { AvatarStack, PersonAvatar } from "./PersonAvatar";
import { matchesQuery, roleLabel } from "./peopleUtils";
import { TeamFormDialog } from "./TeamDialogs";
import type { PersonSummary, TeamSummary } from "./types";

export type DirectoryTab = "people" | "teams";

function PersonCard({ person }: { person: PersonSummary }) {
  return (
    <li>
      <Link className="people-card" href={`/people/${person.userId}`}>
        <PersonAvatar {...person} size={56} />
        <span className="people-card-name">{person.name}</span>
        <span className="people-card-email">{person.email}</span>
        <span className="people-role-tag">{roleLabel(person.role)}</span>
        <span className="people-card-teams">
          {person.teams.length === 0
            ? "No teams"
            : person.teams.map((team) => team.name).join(", ")}
        </span>
        <span className="people-card-count">
          {person.openAssignedCount} open work item
          {person.openAssignedCount === 1 ? "" : "s"}
        </span>
      </Link>
    </li>
  );
}

function TeamCard({ team }: { team: TeamSummary }) {
  return (
    <li>
      <Link className="people-card people-team-card" href={`/teams/${team.id}`}>
        <span className="people-team-icon" aria-hidden="true">
          <UsersRound size={22} />
        </span>
        <span className="people-card-name">{team.name}</span>
        <span className="people-card-email">
          {team.description || "No description"}
        </span>
        <AvatarStack people={team.members} />
        <span className="people-card-count">
          {team.members.length} member{team.members.length === 1 ? "" : "s"} ·{" "}
          {team.openIssueCount} open work item{team.openIssueCount === 1 ? "" : "s"}
        </span>
      </Link>
    </li>
  );
}

/** Jira "People" directory: People | Teams tabs with search and team creation. */
export function PeopleDirectory({ initialTab }: { initialTab: DirectoryTab }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const canCreate = !!activeMember && activeMember.role !== "viewer";
  const [tab, setTab] = useState<DirectoryTab>(initialTab);
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      apiRequest<PersonSummary[]>("/api/people", { signal }),
      apiRequest<TeamSummary[]>("/api/teams", { signal }),
    ])
      .then(([peopleRows, teamRows]) => {
        setPeople(peopleRows);
        setTeams(teamRows);
      })
      .catch((loadError) => {
        if (signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "People could not be loaded");
      });
    return () => controller.abort();
  }, []);

  const switchTab = (next: DirectoryTab) => {
    setTab(next);
    setQuery("");
    router.replace(next === "teams" ? "/teams" : "/people", { scroll: false });
  };

  const visiblePeople = useMemo(
    () =>
      (people ?? []).filter((person) =>
        matchesQuery(query, person.name, person.email, ...person.teams.map((team) => team.name)),
      ),
    [people, query],
  );
  const visibleTeams = useMemo(
    () =>
      (teams ?? []).filter((team) =>
        matchesQuery(query, team.name, team.description, ...team.members.map((member) => member.name)),
      ),
    [teams, query],
  );

  if (!people && !error) return <WorkspaceLoading label="people" />;

  return (
    <div className="page people-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">{tab === "teams" ? "Teams" : "People"}</h1>
        {canCreate && (
          <div className="jira-page-actions">
            <button
              type="button"
              className="primary-button jira-compact-button"
              onClick={() => setCreating(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Create team
            </button>
          </div>
        )}
      </header>

      <div className="people-tabs" role="tablist" aria-label="Directory">
        {(["people", "teams"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "people-tab active" : "people-tab"}
            onClick={() => switchTab(id)}
          >
            {id === "people" ? "People" : "Teams"}
            <span className="people-tab-count">
              {id === "people" ? (people?.length ?? 0) : (teams?.length ?? 0)}
            </span>
          </button>
        ))}
      </div>

      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={tab === "people" ? "Search people" : "Search teams"}
            aria-label={tab === "people" ? "Search people" : "Search teams"}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {tab === "people" ? (
        visiblePeople.length === 0 ? (
          <p className="people-empty">
            {query ? "No people match your search." : "No one is in this workspace yet."}
          </p>
        ) : (
          <ul className="people-grid" aria-label="People">
            {visiblePeople.map((person) => (
              <PersonCard key={person.userId} person={person} />
            ))}
          </ul>
        )
      ) : visibleTeams.length === 0 ? (
        <div className="empty-state people-empty-state">
          <UsersRound size={24} aria-hidden="true" />
          <h2>{query ? "No teams match your search" : "No teams yet"}</h2>
          {!query && (
            <p>Teams group the people who work together so you can track the work they own.</p>
          )}
          {!query && canCreate && (
            <button type="button" className="secondary-button" onClick={() => setCreating(true)}>
              <Plus size={15} aria-hidden="true" />
              Create team
            </button>
          )}
        </div>
      ) : (
        <ul className="people-grid" aria-label="Teams">
          {visibleTeams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </ul>
      )}

      {creating && (
        <TeamFormDialog
          open
          onOpenChange={setCreating}
          people={people ?? []}
          currentUserId={session?.user.id ?? null}
          onSaved={(team) => router.push(`/teams/${team.id}`)}
        />
      )}
    </div>
  );
}
