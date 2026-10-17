"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Hash,
  Repeat2,
  Rocket,
  Target,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { apiRequest } from "../../IssueProvider";
import { KindIcon } from "../IssueVisuals";
import { IssueLabelChip } from "../IssueLabelChip";
import { IssuePickerPopover } from "./IssuePicker";
import { ChipMultiSelect } from "./ChipMultiSelect";
import {
  eligibleParents,
  formatAbsolute,
  initials,
  kindConversions,
  relativeTime,
} from "./issueDetailLogic";
import {
  fetchOptionalList,
  type IssueDetailController,
} from "./useIssueDetail";
import { TimeTrackingBar } from "./IssueTimeTracking";
import {
  ISSUE_ESTIMATES,
  PRIORITY_LABELS,
  formatDuration,
  parseDuration,
  type Cycle,
  type Issue,
  type IssueComponentRef,
  type IssueEstimate,
  type IssueKind,
  type IssuePriority,
  type IssueUpdates,
  type IssueVersionRef,
  type WorkspaceLabel,
  type WorkspaceMember,
} from "../../data/issues";
import {
  isEpicLevel,
  isSubtaskLevel,
  typeName,
} from "../../data/workflow";
import { useWorkflow } from "../../WorkflowProvider";

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="issue-property">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function DurationInput({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  label: string;
  onCommit: (minutes: number | null) => void;
}) {
  const initial = value ? formatDuration(value) : "";
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === initial) return;
    if (!trimmed) {
      onCommit(null);
      return;
    }
    const minutes = parseDuration(trimmed);
    if (minutes === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(minutes);
  };

  return (
    <label className="issue-inline-input">
      <span className="sr-only">{label}</span>
      <input
        value={draft}
        disabled={disabled}
        placeholder="e.g. 1d 4h"
        aria-invalid={invalid}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function EnvironmentInput({
  value,
  disabled,
  onCommit,
}: {
  value: string | null;
  disabled: boolean;
  onCommit: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <label className="issue-inline-input">
      <span className="sr-only">Environment</span>
      <textarea
        value={draft}
        disabled={disabled}
        rows={2}
        maxLength={2000}
        placeholder="Browser, OS, build..."
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim() || null;
          if (next !== (value ?? null)) onCommit(next);
        }}
      />
    </label>
  );
}

export function IssueDetailsPanel({
  issue,
  allIssues,
  labels,
  cycles,
  members,
  currentMemberId,
  readOnly,
  controller,
  onLogWork,
}: {
  issue: Issue;
  allIssues: Issue[];
  labels: WorkspaceLabel[];
  cycles: Cycle[];
  members: WorkspaceMember[];
  currentMemberId: string | null;
  readOnly: boolean;
  controller: IssueDetailController;
  onLogWork: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const workflow = useWorkflow(issue.projectId);
  const [versions, setVersions] = useState<IssueVersionRef[] | null>(null);
  const [components, setComponents] = useState<IssueComponentRef[] | null>(
    null,
  );
  const [teams, setTeams] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [goals, setGoals] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const update = (updates: IssueUpdates) => void controller.patch(updates);

  useEffect(() => {
    let cancelled = false;
    void fetchOptionalList<{ id: string; name: string }>("/api/teams").then(
      (loaded) => !cancelled && setTeams(loaded),
    );
    apiRequest<{ goals: { id: string; name: string }[] }>("/api/goals")
      .then((loaded) => !cancelled && setGoals(loaded.goals))
      .catch(() => !cancelled && setGoals(null));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const base = `/api/projects/${encodeURIComponent(issue.projectId)}`;
    void fetchOptionalList<IssueVersionRef>(`${base}/versions`).then(
      (loaded) => !cancelled && setVersions(loaded),
    );
    void fetchOptionalList<IssueComponentRef>(`${base}/components`).then(
      (loaded) => !cancelled && setComponents(loaded),
    );
    return () => {
      cancelled = true;
    };
  }, [issue.projectId]);

  const projectCycles = cycles.filter(
    (cycle) =>
      cycle.projectId === issue.projectId &&
      (cycle.state !== "CLOSED" || cycle.id === issue.cycleId),
  );
  const parentCandidates = eligibleParents(issue, allIssues);
  const kinds = kindConversions(
    issue,
    workflow.types.map((type) => type.key),
  );
  const componentIds = issue.components.map((component) => component.id);

  const changeKind = (kind: IssueKind) => {
    if (kind === issue.kind) return;
    update(
      isSubtaskLevel(issue.kind) && !isSubtaskLevel(kind)
        ? { kind, parentId: null }
        : { kind },
    );
  };

  return (
    <aside
      className="panel properties-panel issue-details"
      aria-label="Details"
    >
      <button
        className="issue-details-toggle"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? (
          <ChevronDown size={15} aria-hidden="true" />
        ) : (
          <ChevronRight size={15} aria-hidden="true" />
        )}
        <h2>Details</h2>
      </button>

      {isOpen && (
        <div className="property-list">
          <DetailField label="Assignee">
            <div className="issue-assignee-field">
              <label className="editable-property property-person">
                <span className="avatar avatar-small">
                  {issue.assignee ? initials(issue.assignee.name) : "?"}
                </span>
                <span className="sr-only">Assignee</span>
                <select
                  value={issue.assignee?.id ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({ assigneeId: event.target.value || null })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              {!readOnly &&
                currentMemberId &&
                issue.assignee?.id !== currentMemberId && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => update({ assigneeId: currentMemberId })}
                  >
                    Assign to me
                  </button>
                )}
            </div>
          </DetailField>

          <DetailField label="Reporter">
            <span className="property-person">
              <span className="avatar avatar-small">
                {issue.creator ? initials(issue.creator.name) : "?"}
              </span>
              {issue.creator?.name ?? "Unknown"}
            </span>
          </DetailField>

          <DetailField label="Labels">
            <ChipMultiSelect
              label="Labels"
              options={labels}
              selectedIds={issue.labels.map((label) => label.id)}
              disabled={readOnly}
              renderChip={(label) => <IssueLabelChip label={label} compact />}
              onChange={(labelIds) => update({ labelIds })}
            />
          </DetailField>

          {!isEpicLevel(issue.kind) && (
            <DetailField label="Parent">
              <IssuePickerPopover
                disabled={readOnly}
                candidates={parentCandidates}
                onSelect={(parent) => update({ parentId: parent.id })}
                onClear={
                  issue.parentId && !isSubtaskLevel(issue.kind)
                    ? () => update({ parentId: null })
                    : undefined
                }
                clearLabel="Remove parent"
                trigger={
                  issue.parent ? (
                    <span className="property-kind">
                      <KindIcon
                        kind={issue.parent.kind}
                        projectId={issue.projectId}
                      />
                      <span className="issue-field-text">
                        {issue.parent.id} {issue.parent.title}
                      </span>
                    </span>
                  ) : (
                    <span className="field-meta">
                      {isSubtaskLevel(issue.kind) ? "Choose parent" : "Add epic"}
                    </span>
                  )
                }
              />
            </DetailField>
          )}

          <DetailField label="Sprint">
            <label className="editable-property">
              <Repeat2 size={14} aria-hidden="true" />
              <span className="sr-only">Sprint</span>
              <select
                value={issue.cycleId ?? ""}
                disabled={readOnly}
                onChange={(event) =>
                  update({ cycleId: event.target.value || null })
                }
              >
                <option value="">None</option>
                {projectCycles.map((cycle) => (
                  <option value={cycle.id} key={cycle.id}>
                    {cycle.name}
                    {cycle.state === "ACTIVE" ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </DetailField>

          {teams && (
            <DetailField label="Team">
              <label className="editable-property">
                <UsersRound size={14} aria-hidden="true" />
                <span className="sr-only">Team</span>
                <select
                  value={issue.team?.id ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({ teamId: event.target.value || null })
                  }
                >
                  <option value="">None</option>
                  {teams.map((team) => (
                    <option value={team.id} key={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {issue.team && (
                <Link className="issue-detail-sublink" href={`/teams/${issue.team.id}`}>
                  View team
                </Link>
              )}
            </DetailField>
          )}

          {goals && (
            <DetailField label="Goal">
              <label className="editable-property">
                <Target size={14} aria-hidden="true" />
                <span className="sr-only">Goal</span>
                <select
                  value={issue.goal?.id ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({ goalId: event.target.value || null })
                  }
                >
                  <option value="">None</option>
                  {goals.map((goal) => (
                    <option value={goal.id} key={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              {issue.goal && (
                <Link className="issue-detail-sublink" href={`/goals/${issue.goal.id}`}>
                  View goal
                </Link>
              )}
            </DetailField>
          )}

          {versions && (
            <DetailField label="Fix versions">
              <label className="editable-property">
                <Rocket size={14} aria-hidden="true" />
                <span className="sr-only">Fix version</span>
                <select
                  value={issue.fixVersion?.id ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({ fixVersionId: event.target.value || null })
                  }
                >
                  <option value="">None</option>
                  {versions
                    .filter(
                      (version) =>
                        version.status !== "ARCHIVED" ||
                        version.id === issue.fixVersion?.id,
                    )
                    .map((version) => (
                      <option value={version.id} key={version.id}>
                        {version.name}
                      </option>
                    ))}
                </select>
              </label>
            </DetailField>
          )}

          {components && (
            <DetailField label="Components">
              <ChipMultiSelect
                label="Components"
                options={components}
                selectedIds={componentIds}
                disabled={readOnly}
                onChange={(ids) => update({ componentIds: ids })}
              />
            </DetailField>
          )}

          <DetailField label="Story point estimate">
            <label className="editable-property">
              <Hash size={14} aria-hidden="true" />
              <span className="sr-only">Story points</span>
              <select
                value={issue.estimate ?? ""}
                disabled={readOnly}
                onChange={(event) =>
                  update({
                    estimate:
                      event.target.value === ""
                        ? null
                        : (Number(event.target.value) as IssueEstimate),
                  })
                }
              >
                <option value="">None</option>
                {ISSUE_ESTIMATES.map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </DetailField>

          <DetailField label="Priority">
            <label className="editable-property">
              <span
                className={`property-dot priority-${issue.priority.toLowerCase()}`}
              />
              <span className="sr-only">Priority</span>
              <select
                value={issue.priority}
                disabled={readOnly}
                onChange={(event) =>
                  update({ priority: event.target.value as IssuePriority })
                }
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </DetailField>

          <DetailField label="Start date">
            <label className="editable-date">
              <CalendarDays size={14} aria-hidden="true" />
              <span className="sr-only">Start date</span>
              <input
                type="date"
                value={issue.startDate?.slice(0, 10) ?? ""}
                disabled={readOnly}
                onChange={(event) =>
                  update({ startDate: event.target.value || null })
                }
              />
            </label>
          </DetailField>

          <DetailField label="Due date">
            <label className="editable-date">
              <CalendarDays size={14} aria-hidden="true" />
              <span className="sr-only">Due date</span>
              <input
                type="date"
                value={issue.dueDate?.slice(0, 10) ?? ""}
                disabled={readOnly}
                onChange={(event) =>
                  update({ dueDate: event.target.value || null })
                }
              />
            </label>
          </DetailField>

          <DetailField label="Original estimate">
            <DurationInput
              key={`original-${issue.originalEstimateMinutes}`}
              label="Original estimate"
              value={issue.originalEstimateMinutes}
              disabled={readOnly}
              onCommit={(minutes) =>
                update({
                  originalEstimateMinutes: minutes,
                  ...(issue.remainingEstimateMinutes === null &&
                  issue.timeSpentMinutes === 0
                    ? { remainingEstimateMinutes: minutes }
                    : {}),
                })
              }
            />
          </DetailField>

          <DetailField label="Time tracking">
            <button
              className="issue-time-tracking-trigger"
              type="button"
              disabled={readOnly}
              onClick={onLogWork}
              aria-label="Log work"
            >
              <Clock3 size={14} aria-hidden="true" />
              <TimeTrackingBar issue={issue} />
            </button>
          </DetailField>

          {issue.kind === "BUG" && (
            <DetailField label="Environment">
              <EnvironmentInput
                key={issue.environment ?? ""}
                value={issue.environment}
                disabled={readOnly}
                onCommit={(environment) => update({ environment })}
              />
            </DetailField>
          )}
        </div>
      )}
      {isOpen && (
        <div className="issue-more-fields">
          <button
            className="issue-details-toggle issue-more-toggle"
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((current) => !current)}
          >
            {moreOpen ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
            <span>More fields</span>
            <small>Issue type, Remaining estimate</small>
          </button>
          {moreOpen && (
            <div className="property-list">
              <DetailField label="Issue type">
                <label className="editable-property property-kind">
                  <KindIcon kind={issue.kind} projectId={issue.projectId} />
                  <span className="sr-only">Issue type</span>
                  <select
                    value={issue.kind}
                    disabled={readOnly}
                    onChange={(event) =>
                      changeKind(event.target.value as IssueKind)
                    }
                  >
                    {kinds.map((kind) => (
                      <option value={kind} key={kind}>
                        {typeName(kind, workflow.types)}
                      </option>
                    ))}
                  </select>
                </label>
              </DetailField>

              <DetailField label="Remaining estimate">
                <DurationInput
                  key={`remaining-${issue.remainingEstimateMinutes}`}
                  label="Remaining estimate"
                  value={issue.remainingEstimateMinutes}
                  disabled={readOnly}
                  onCommit={(minutes) =>
                    update({ remainingEstimateMinutes: minutes })
                  }
                />
              </DetailField>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function MetaTime({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}{" "}
      <time dateTime={value} title={formatAbsolute(value)}>
        {relativeTime(value)}
      </time>
    </span>
  );
}

/** Jira's footer under the Details box: Created / Updated / Resolved. */
export function IssueMetaFooter({ issue }: { issue: Issue }) {
  return (
    <p className="issue-meta-footer">
      <MetaTime label="Created" value={issue.createdAt} />
      <MetaTime label="Updated" value={issue.updatedAt} />
      {issue.resolvedAt && (
        <MetaTime label="Resolved" value={issue.resolvedAt} />
      )}
    </p>
  );
}
