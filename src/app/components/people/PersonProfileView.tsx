"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, Clock3, FolderKanban, Mail, UsersRound } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { WorkspaceLoading } from "../WorkspaceLoading";
import { AvatarStack, PersonAvatar } from "./PersonAvatar";
import { groupByCategory, relativeTime, roleLabel } from "./peopleUtils";
import { WorkItemRow } from "./WorkItemList";
import type { PersonProfile, WorkedOnEntry } from "./types";

const REASON_LABELS: Record<WorkedOnEntry["reason"], string> = {
  created: "Created",
  commented: "Commented",
  updated: "Updated",
};

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: typeof Clock3;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="people-section">
      <h2 className="people-section-title">
        <Icon size={15} aria-hidden="true" />
        {title}
        {count !== undefined && <span className="people-tab-count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Jira profile page: header card, Worked on, Assigned work, Places, Teams. */
export function PersonProfileView({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<PersonProfile>(`/api/people/${encodeURIComponent(userId)}`, {
      signal: controller.signal,
    })
      .then(setProfile)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Profile could not be loaded");
        }
      });
    return () => controller.abort();
  }, [userId]);

  if (error) {
    return (
      <div className="page people-page">
        <Link className="people-back" href="/people">
          <ArrowLeft size={14} aria-hidden="true" /> People
        </Link>
        <div className="empty-state people-empty-state">
          <h2>{error === "Person not found" ? "This person isn't in your workspace" : "Profile unavailable"}</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!profile) return <WorkspaceLoading label="profile" />;

  const { person } = profile;
  const groups = groupByCategory(profile.assigned);

  return (
    <div className="page people-page people-profile">
      <Link className="people-back" href="/people">
        <ArrowLeft size={14} aria-hidden="true" /> People
      </Link>
      <header className="people-profile-header">
        <div className="people-profile-banner" aria-hidden="true" />
        <div className="people-profile-identity">
          <PersonAvatar {...person} size={88} />
          <div className="people-profile-text">
            <h1 className="jira-page-title">{person.name}</h1>
            <p className="people-profile-meta">
              <span>
                <Mail size={13} aria-hidden="true" />
                <a href={`mailto:${person.email}`}>{person.email}</a>
              </span>
              <span className="people-role-tag">{roleLabel(person.role)}</span>
            </p>
            {person.teams.length > 0 && (
              <p className="people-profile-teams">
                <UsersRound size={13} aria-hidden="true" />
                {person.teams.map((team, index) => (
                  <span key={team.id}>
                    {index > 0 && ", "}
                    <Link href={`/teams/${team.id}`}>{team.name}</Link>
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className="people-profile-stat">
            <strong>{person.openAssignedCount}</strong>
            <span>Assigned work</span>
          </div>
        </div>
      </header>

      <div className="people-profile-grid">
        <div className="people-profile-main">
          <Section title="Worked on" icon={Clock3} count={profile.workedOn.length}>
            {profile.workedOn.length === 0 ? (
              <p className="people-empty">
                Nothing yet. Work items {person.name} creates, comments on or updates appear here.
              </p>
            ) : (
              <ul className="people-work-list">
                {profile.workedOn.map((entry) => (
                  <WorkItemRow
                    key={entry.issue.id}
                    issue={entry.issue}
                    meta={
                      <span title={entry.detail ?? undefined}>
                        {REASON_LABELS[entry.reason]} {relativeTime(entry.at, now)}
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Assigned work items" icon={Briefcase} count={profile.assigned.length}>
            {groups.length === 0 ? (
              <p className="people-empty">No open work items are assigned to {person.name}.</p>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="people-work-group">
                  <h3>
                    {group.label} <span>{group.issues.length}</span>
                  </h3>
                  <ul className="people-work-list">
                    {group.issues.map((issue) => (
                      <WorkItemRow
                        key={issue.id}
                        issue={issue}
                        meta={`Updated ${relativeTime(issue.updatedAt, now)}`}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </Section>
        </div>

        <aside className="people-profile-side">
          <Section title="Places they work" icon={FolderKanban} count={profile.places.length}>
            {profile.places.length === 0 ? (
              <p className="people-empty">No project activity yet.</p>
            ) : (
              <ul className="people-place-list">
                {profile.places.map((place) => (
                  <li key={place.projectId}>
                    <Link href={`/projects/${place.projectId}`}>
                      <span
                        className="project-shell-avatar"
                        style={{ background: place.color ?? "var(--gray-300)" }}
                        aria-hidden="true"
                      >
                        {place.key.slice(0, 2)}
                      </span>
                      <span className="people-place-name">
                        {place.name}
                        <small>
                          {place.issueCount} work item{place.issueCount === 1 ? "" : "s"} ·{" "}
                          {relativeTime(place.lastAt, now)}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Teams" icon={UsersRound} count={profile.teams.length}>
            {profile.teams.length === 0 ? (
              <p className="people-empty">
                Not in any teams. <Link href="/teams">Browse teams</Link>
              </p>
            ) : (
              <ul className="people-place-list">
                {profile.teams.map((team) => (
                  <li key={team.id}>
                    <Link href={`/teams/${team.id}`}>
                      <span className="people-team-icon small" aria-hidden="true">
                        <UsersRound size={14} />
                      </span>
                      <span className="people-place-name">
                        {team.name}
                        <small>
                          {team.members.length} member{team.members.length === 1 ? "" : "s"}
                        </small>
                      </span>
                      <AvatarStack people={team.members} max={3} size={20} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
