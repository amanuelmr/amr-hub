"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Search, Trash2, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { authClient } from "../../../lib/auth-client";
import { WorkspaceLoading } from "../WorkspaceLoading";
import { IssueDialog } from "../issue/IssueDialogs";
import { MemberPicker } from "./MemberPicker";
import { PersonAvatar } from "./PersonAvatar";
import { groupByCategory, relativeTime } from "./peopleUtils";
import { DeleteTeamDialog, TeamFormDialog } from "./TeamDialogs";
import { WorkItemRow } from "./WorkItemList";
import type { PersonSummary, TeamDetail } from "./types";

type Dialog = "edit" | "delete" | "add" | null;

function AddMembersDialog({
  team,
  people,
  onClose,
  onSaved,
}: {
  team: TeamDetail;
  people: PersonSummary[];
  onClose: () => void;
  onSaved: (team: TeamDetail) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (selected.length === 0) {
      setError("Select at least one person");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await apiRequest<TeamDetail>(`/api/teams/${encodeURIComponent(team.id)}/members`, {
          method: "POST",
          body: JSON.stringify({ userIds: selected }),
        }),
      );
      onClose();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Members could not be added");
    } finally {
      setSaving(false);
    }
  };

  return (
    <IssueDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Add people to ${team.name}`}
    >
      <div className="issue-dialog-form people-team-form">
        <MemberPicker
          label="People"
          people={people}
          selectedIds={selected}
          excludeIds={team.members.map((member) => member.userId)}
          onChange={setSelected}
        />
        {error && (
          <p className="form-submit-error" role="alert">
            {error}
          </p>
        )}
        <div className="issue-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={saving} onClick={add}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </IssueDialog>
  );
}

/** Jira team page: header, members (add/remove), and the team's work. */
export function TeamView({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id ?? null;
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showDone, setShowDone] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      apiRequest<TeamDetail>(`/api/teams/${encodeURIComponent(teamId)}`, { signal }),
      apiRequest<PersonSummary[]>("/api/people", { signal }),
    ])
      .then(([teamRow, peopleRows]) => {
        setTeam(teamRow);
        setPeople(peopleRows);
      })
      .catch((loadError) => {
        if (signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Team could not be loaded");
      });
    return () => controller.abort();
  }, [teamId]);

  const removeMember = async (userId: string) => {
    if (!team) return;
    setActionError(null);
    try {
      const updated = await apiRequest<TeamDetail>(
        `/api/teams/${encodeURIComponent(team.id)}/members`,
        { method: "DELETE", body: JSON.stringify({ userIds: [userId] }) },
      );
      setTeam(updated);
    } catch (removeError) {
      setActionError(
        removeError instanceof Error ? removeError.message : "Member could not be removed",
      );
    }
  };

  if (error) {
    return (
      <div className="page people-page">
        <Link className="people-back" href="/teams">
          <ArrowLeft size={14} aria-hidden="true" /> Teams
        </Link>
        <div className="empty-state people-empty-state">
          <h2>{error === "Team not found" ? "This team doesn't exist" : "Team unavailable"}</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!team) return <WorkspaceLoading label="team" />;

  const isMember = !!currentUserId && team.members.some((member) => member.userId === currentUserId);
  const visibleWork = showDone
    ? team.work
    : team.work.filter((issue) => issue.statusCategory !== "DONE");
  const groups = groupByCategory(visibleWork);
  const doneCount = team.work.length - team.openIssueCount;

  return (
    <div className="page people-page people-team-page">
      <Link className="people-back" href="/teams">
        <ArrowLeft size={14} aria-hidden="true" /> Teams
      </Link>
      <header className="people-profile-header">
        <div className="people-profile-banner team" aria-hidden="true" />
        <div className="people-profile-identity">
          <span className="people-team-icon large" aria-hidden="true">
            <UsersRound size={36} />
          </span>
          <div className="people-profile-text">
            <h1 className="jira-page-title">{team.name}</h1>
            <p className="people-team-description">
              {team.description || "No description"}
            </p>
          </div>
          {team.canEdit && (
            <div className="jira-page-actions">
              <button
                type="button"
                className="secondary-button jira-compact-button"
                onClick={() => setDialog("edit")}
              >
                <Pencil size={14} aria-hidden="true" /> Edit
              </button>
              <button
                type="button"
                className="secondary-button jira-compact-button"
                onClick={() => setDialog("delete")}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete
              </button>
            </div>
          )}
        </div>
      </header>

      {actionError && (
        <p className="form-submit-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="people-profile-grid">
        <div className="people-profile-main">
          <section className="people-section">
            <div className="people-section-head">
              <h2 className="people-section-title">
                Team work
                <span className="people-tab-count">{team.openIssueCount}</span>
              </h2>
              <div className="people-section-actions">
                {doneCount > 0 && (
                  <label className="people-toggle">
                    <input
                      type="checkbox"
                      checked={showDone}
                      onChange={(event) => setShowDone(event.target.checked)}
                    />
                    Show done ({doneCount})
                  </label>
                )}
                <Link
                  className="text-button"
                  href={`/issues?jql=${encodeURIComponent(`team = "${team.name.replace(/"/g, '\\"')}"`)}`}
                >
                  <Search size={13} aria-hidden="true" /> View in search
                </Link>
              </div>
            </div>
            {groups.length === 0 ? (
              <p className="people-empty">
                {team.work.length === 0
                  ? "No work items are assigned to this team yet. Set the Team field on a work item to see it here."
                  : "All of this team's work is done."}
              </p>
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
                        showAssignee
                        meta={`Updated ${relativeTime(issue.updatedAt, now)}`}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="people-profile-side">
          <section className="people-section">
            <div className="people-section-head">
              <h2 className="people-section-title">
                Members
                <span className="people-tab-count">{team.members.length}</span>
              </h2>
              {team.canEdit && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDialog("add")}
                >
                  <UserPlus size={14} aria-hidden="true" /> Add people
                </button>
              )}
            </div>
            {team.members.length === 0 ? (
              <p className="people-empty">This team has no members.</p>
            ) : (
              <ul className="people-member-list">
                {team.members.map((member) => (
                  <li key={member.userId}>
                    <Link href={`/people/${member.userId}`}>
                      <PersonAvatar {...member} size={28} />
                      <span className="people-place-name">
                        {member.name}
                        <small>{member.email}</small>
                      </span>
                    </Link>
                    {team.canEdit && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={
                          member.userId === currentUserId
                            ? "Leave team"
                            : `Remove ${member.name} from team`
                        }
                        title={member.userId === currentUserId ? "Leave team" : "Remove from team"}
                        onClick={() => removeMember(member.userId)}
                      >
                        <UserMinus size={14} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!isMember && !team.canEdit && (
              <p className="people-empty">Only team members or workspace owners can change this team.</p>
            )}
          </section>
        </aside>
      </div>

      {dialog === "edit" && (
        <TeamFormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          team={team}
          people={people}
          currentUserId={currentUserId}
          onSaved={setTeam}
        />
      )}
      {dialog === "delete" && (
        <DeleteTeamDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          team={team}
          onDeleted={() => router.push("/teams")}
        />
      )}
      {dialog === "add" && (
        <AddMembersDialog
          team={team}
          people={people}
          onClose={() => setDialog(null)}
          onSaved={setTeam}
        />
      )}
    </div>
  );
}
