"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import {
  LINK_TYPE_LABELS,
  PRIORITY_LABELS,
  type IssueLinkType,
  type IssuePriority,
} from "../../data/issues";
import { isSubtaskLevel, type ProjectWorkflow } from "../../data/workflow";
import {
  ACTION_LABELS,
  AUTOMATION_FIELDS,
  AUTOMATION_TRIGGERS,
  FIELD_OPERATOR_LABELS,
  FIELD_OPERATORS,
  LINK_TYPES,
  SCHEDULE_FREQUENCIES,
  SMART_VALUES,
  TRIGGER_DESCRIPTIONS,
  TRIGGER_LABELS,
  WEEKDAY_NAMES,
  WORKSPACE_ROLES,
  type AutomationConditions,
  type AutomationSchedule,
  type AutomationTriggerType,
  type ConditionCheck,
  type FieldOperator,
  type IfConditions,
  type LeafAction,
  type LeafActionType,
} from "../../../server/automationRules";

export const PRIORITIES: IssuePriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO_PRIORITY",
];

export const LEAF_ACTION_TYPES: LeafActionType[] = [
  "EDIT_FIELDS",
  "TRANSITION",
  "ASSIGN",
  "ADD_COMMENT",
  "SET_PRIORITY",
  "ADD_LABEL",
  "SET_FLAG",
  "TRANSITION_PARENT",
  "CREATE_ISSUE",
  "CREATE_SUBTASKS",
  "CLONE_ISSUE",
  "LINK_ISSUES",
  "NOTIFY",
];

export const LEAF_ACTION_HINTS: Record<LeafActionType, string> = {
  EDIT_FIELDS:
    "Set priority, assignee, labels, due date, estimate, team or goal.",
  TRANSITION: "Move the issue to another status.",
  ASSIGN: "Assign to a member, the reporter or the initiator.",
  ADD_COMMENT: "Add a comment with smart values.",
  SET_PRIORITY: "Change the priority.",
  ADD_LABEL: "Add a label.",
  SET_FLAG: "Flag or unflag the issue.",
  TRANSITION_PARENT: "Move the parent issue to another status.",
  CREATE_ISSUE: "Create a new issue, optionally under the trigger issue.",
  CREATE_SUBTASKS: "Create one subtask per line.",
  CLONE_ISSUE: "Copy the issue and link the copy.",
  LINK_ISSUES: "Link to another issue by key or smart value.",
  NOTIFY: "Send an in-app notification.",
};

export function defaultLeafAction(
  type: LeafActionType,
  workflow: Pick<ProjectWorkflow, "statuses" | "types">,
): LeafAction {
  const firstStatus = workflow.statuses.at(-1)?.key ?? "DONE";
  const standardType =
    workflow.types.find((type) => !isSubtaskLevel(type.key) && type.level === 0)
      ?.key ?? "TASK";
  switch (type) {
    case "ASSIGN":
      return { type, mode: "REPORTER" };
    case "TRANSITION":
    case "TRANSITION_PARENT":
      return { type, status: firstStatus };
    case "SET_PRIORITY":
      return { type, priority: "HIGH" };
    case "ADD_LABEL":
      return { type, labelId: "" };
    case "ADD_COMMENT":
      return { type, body: "{{initiator}} updated {{issue.key}}" };
    case "SET_FLAG":
      return { type, flagged: true };
    case "EDIT_FIELDS":
      return { type, priority: "HIGH" };
    case "CREATE_ISSUE":
      return {
        type,
        kind: standardType,
        summary: "Follow up on {{issue.key}}",
        parent: "NONE",
      };
    case "CREATE_SUBTASKS":
      return { type, summaries: ["Design", "Build", "Test"] };
    case "CLONE_ISSUE":
      return { type, summary: "CLONE - {{issue.summary}}" };
    case "LINK_ISSUES":
      return { type, linkType: "RELATES_TO", target: "" };
    case "NOTIFY":
      return {
        type,
        recipients: ["ASSIGNEE"],
        message: "{{initiator}} needs your attention on {{issue.key}}",
      };
  }
}

/** Lists problems that would make the server reject (or ignore) an action. */
export function leafActionProblem(action: LeafAction): string | null {
  switch (action.type) {
    case "ADD_LABEL":
      return action.labelId ? null : "Choose a label for “Add label”.";
    case "ASSIGN":
      return action.mode === "MEMBER" && !action.memberId
        ? "Choose who to assign the issue to."
        : null;
    case "ADD_COMMENT":
      return action.body.trim() ? null : "Write the comment text.";
    case "CREATE_ISSUE":
      return action.summary.trim() ? null : "Give the new issue a summary.";
    case "CREATE_SUBTASKS":
      return action.summaries.some((summary) => summary.trim())
        ? null
        : "Add at least one subtask summary.";
    case "LINK_ISSUES":
      return action.target.trim() ? null : "Enter the issue to link to.";
    case "NOTIFY":
      if (!action.message.trim()) return "Write the notification message.";
      return action.recipients?.length || action.memberIds?.length
        ? null
        : "Choose who gets the notification.";
    case "EDIT_FIELDS":
      return Object.entries(action).some(
        ([key, value]) => key !== "type" && value !== undefined,
      )
        ? null
        : "Choose at least one field to edit.";
    default:
      return null;
  }
}

export function toggle<T>(values: T[] | undefined, value: T) {
  const current = values ?? [];
  return current.includes(value)
    ? current.filter((candidate) => candidate !== value)
    : [...current, value];
}

export function SmartValueHint() {
  return (
    <details className="au-smart-hint">
      <summary>Smart values</summary>
      <p>
        {SMART_VALUES.map((value) => (
          <code key={value}>{value}</code>
        ))}
      </p>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Lookup data (versions, teams, goals)                                 */
/* ------------------------------------------------------------------ */

type Option = { id: string; name: string };

export function useAutomationLookups(projectId: string) {
  const [versions, setVersions] = useState<Option[]>([]);
  const [teams, setTeams] = useState<Option[]>([]);
  const [goals, setGoals] = useState<Option[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    apiRequest<Option[]>(
      `/api/projects/${encodeURIComponent(projectId)}/versions`,
      { signal },
    )
      .then((items) => setVersions(Array.isArray(items) ? items : []))
      .catch(() => undefined);
    apiRequest<Option[] | { teams: Option[] }>("/api/teams", { signal })
      .then((items) =>
        setTeams(Array.isArray(items) ? items : (items.teams ?? [])),
      )
      .catch(() => undefined);
    apiRequest<{ goals: Option[] }>("/api/goals", { signal })
      .then((items) => setGoals(items.goals ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);

  return { versions, teams, goals };
}

export type Lookups = ReturnType<typeof useAutomationLookups>;

/* ------------------------------------------------------------------ */
/* Trigger                                                              */
/* ------------------------------------------------------------------ */

export function TriggerEditor({
  trigger,
  conditions,
  schedule,
  workflow,
  disabled,
  onTrigger,
  onConditions,
  onSchedule,
}: {
  trigger: AutomationTriggerType;
  conditions: AutomationConditions;
  schedule: AutomationSchedule | null;
  workflow: Pick<ProjectWorkflow, "statuses">;
  disabled: boolean;
  onTrigger: (trigger: AutomationTriggerType) => void;
  onConditions: (conditions: AutomationConditions) => void;
  onSchedule: (schedule: AutomationSchedule | null) => void;
}) {
  const [customField, setCustomField] = useState("");
  return (
    <fieldset className="au-fieldset" disabled={disabled}>
      <div className="au-trigger-grid" role="radiogroup" aria-label="Trigger">
        {AUTOMATION_TRIGGERS.map((value) => (
          <label
            key={value}
            className={
              value === trigger
                ? "au-trigger-option selected"
                : "au-trigger-option"
            }
          >
            <input
              type="radio"
              name="automation-trigger"
              checked={value === trigger}
              onChange={() => onTrigger(value)}
            />
            <strong>{TRIGGER_LABELS[value]}</strong>
            <span>{TRIGGER_DESCRIPTIONS[value]}</span>
          </label>
        ))}
      </div>

      {trigger === "STATUS_CHANGED" && (
        <div className="pa-form-row">
          {(["fromStatus", "toStatus"] as const).map((key) => (
            <label className="form-field" key={key}>
              <span>{key === "fromStatus" ? "From status" : "To status"}</span>
              <select
                value={conditions[key] ?? ""}
                onChange={(event) =>
                  onConditions({
                    ...conditions,
                    [key]: event.target.value || null,
                  })
                }
              >
                <option value="">Any status</option>
                {workflow.statuses.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {trigger === "FIELD_CHANGED" && (
        <div className="au-stack">
          <span className="au-label">Fields to monitor for changes</span>
          <div
            className="pa-chip-group"
            role="group"
            aria-label="Fields to monitor"
          >
            {AUTOMATION_FIELDS.filter((field) => field.key !== "reporter").map(
              (field) => (
                <label className="pa-check-chip" key={field.key}>
                  <input
                    type="checkbox"
                    checked={conditions.fields?.includes(field.key) ?? false}
                    onChange={() =>
                      onConditions({
                        ...conditions,
                        fields: toggle(conditions.fields, field.key),
                      })
                    }
                  />
                  {field.label}
                </label>
              ),
            )}
          </div>
          {(conditions.fields ?? [])
            .filter(
              (field) =>
                !AUTOMATION_FIELDS.some((known) => known.key === field),
            )
            .map((field) => (
              <span className="au-token" key={field}>
                {field}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Stop monitoring ${field}`}
                  onClick={() =>
                    onConditions({
                      ...conditions,
                      fields: toggle(conditions.fields, field),
                    })
                  }
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
          <div className="au-inline">
            <input
              aria-label="Custom field id"
              placeholder="Custom field id, e.g. cf:severity"
              value={customField}
              maxLength={120}
              onChange={(event) => setCustomField(event.target.value)}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!customField.trim()}
              onClick={() => {
                const key = customField.trim();
                if (!conditions.fields?.includes(key)) {
                  onConditions({
                    ...conditions,
                    fields: [...(conditions.fields ?? []), key],
                  });
                }
                setCustomField("");
              }}
            >
              Add field
            </button>
          </div>
          <span className="field-meta">
            No fields selected = any field change.
          </span>
        </div>
      )}

      {trigger === "SCHEDULED" && (
        <ScheduleEditor
          schedule={schedule ?? { frequency: "DAILY", time: "09:00" }}
          onChange={onSchedule}
        />
      )}
    </fieldset>
  );
}

function ScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: AutomationSchedule;
  onChange: (schedule: AutomationSchedule) => void;
}) {
  return (
    <div className="au-stack">
      <div className="pa-form-row">
        <label className="form-field">
          <span>Run</span>
          <select
            value={schedule.frequency}
            onChange={(event) =>
              onChange({
                ...schedule,
                frequency: event.target
                  .value as AutomationSchedule["frequency"],
              })
            }
          >
            {SCHEDULE_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {frequency === "HOURLY"
                  ? "Every hour"
                  : frequency === "DAILY"
                    ? "Every day"
                    : "Every week"}
              </option>
            ))}
          </select>
        </label>
        {schedule.frequency === "WEEKLY" && (
          <label className="form-field">
            <span>On</span>
            <select
              value={schedule.dayOfWeek ?? 1}
              onChange={(event) =>
                onChange({ ...schedule, dayOfWeek: Number(event.target.value) })
              }
            >
              {WEEKDAY_NAMES.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-field">
          <span>
            {schedule.frequency === "HOURLY" ? "At minute (HH:MM)" : "At (UTC)"}
          </span>
          <input
            type="time"
            value={schedule.time ?? "09:00"}
            onChange={(event) =>
              onChange({ ...schedule, time: event.target.value })
            }
          />
        </label>
      </div>
      <label className="form-field">
        <span>Run on issues matching JQL (optional)</span>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder="e.g. duedate < now() AND statusCategory != Done"
          value={schedule.jql ?? ""}
          onChange={(event) =>
            onChange({ ...schedule, jql: event.target.value || undefined })
          }
        />
        <span className="field-meta">
          Leave empty to run the actions once without an issue (for example, to
          create an issue).
        </span>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conditions                                                           */
/* ------------------------------------------------------------------ */

export function BasicConditionsEditor({
  conditions,
  workflow,
  disabled,
  onChange,
}: {
  conditions: IfConditions;
  workflow: Pick<ProjectWorkflow, "types">;
  disabled: boolean;
  onChange: (conditions: IfConditions) => void;
}) {
  const { labels } = useIssues();
  return (
    <fieldset className="au-fieldset" disabled={disabled}>
      <div className="pa-chip-group" role="group" aria-label="Work type is">
        <span className="pa-chip-label">Work type is</span>
        {workflow.types.map(({ key, name }) => (
          <label className="pa-check-chip" key={key}>
            <input
              type="checkbox"
              checked={conditions.issueTypes?.includes(key) ?? false}
              onChange={() =>
                onChange({
                  ...conditions,
                  issueTypes: toggle(conditions.issueTypes, key),
                })
              }
            />
            {name}
          </label>
        ))}
      </div>
      <div className="pa-chip-group" role="group" aria-label="Priority is">
        <span className="pa-chip-label">Priority is</span>
        {PRIORITIES.map((priority) => (
          <label className="pa-check-chip" key={priority}>
            <input
              type="checkbox"
              checked={conditions.priorities?.includes(priority) ?? false}
              onChange={() =>
                onChange({
                  ...conditions,
                  priorities: toggle(conditions.priorities, priority),
                })
              }
            />
            {PRIORITY_LABELS[priority]}
          </label>
        ))}
      </div>
      {labels.length > 0 && (
        <div className="pa-chip-group" role="group" aria-label="Label includes">
          <span className="pa-chip-label">Label includes</span>
          {labels.map((label) => (
            <label className="pa-check-chip" key={label.id}>
              <input
                type="checkbox"
                checked={conditions.labelIds?.includes(label.id) ?? false}
                onChange={() =>
                  onChange({
                    ...conditions,
                    labelIds: toggle(conditions.labelIds, label.id),
                  })
                }
              />
              {label.name}
            </label>
          ))}
        </div>
      )}
      <label className="pa-checkbox">
        <input
          type="checkbox"
          checked={conditions.assigneeEmpty ?? false}
          onChange={(event) =>
            onChange({
              ...conditions,
              assigneeEmpty: event.target.checked || undefined,
            })
          }
        />
        Assignee is empty
      </label>
      <label className="pa-checkbox">
        <input
          type="checkbox"
          checked={conditions.allSubtasksDone ?? false}
          onChange={(event) =>
            onChange({
              ...conditions,
              allSubtasksDone: event.target.checked || undefined,
            })
          }
        />
        All sibling subtasks are done
      </label>
    </fieldset>
  );
}

export function defaultCheck(type: ConditionCheck["type"]): ConditionCheck {
  if (type === "FIELD")
    return { type, field: "priority", operator: "EQUALS", value: "HIGH" };
  if (type === "JQL") return { type, jql: "statusCategory != Done" };
  return { type, subject: "INITIATOR", operator: "IN_ROLE", roles: ["owner"] };
}

export const CHECK_LABELS: Record<ConditionCheck["type"], string> = {
  FIELD: "Issue fields condition",
  JQL: "JQL condition",
  USER: "User condition",
};

export function CheckEditor({
  check,
  disabled,
  onChange,
}: {
  check: ConditionCheck;
  disabled: boolean;
  onChange: (check: ConditionCheck) => void;
}) {
  const { members } = useIssues();
  if (check.type === "JQL") {
    return (
      <fieldset className="au-fieldset" disabled={disabled}>
        <label className="form-field">
          <span>Issue matches JQL</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={check.jql}
            onChange={(event) =>
              onChange({ ...check, jql: event.target.value })
            }
          />
          <span className="field-meta">
            Example: type = Bug AND priority in (High, Highest)
          </span>
        </label>
      </fieldset>
    );
  }
  if (check.type === "FIELD") {
    const noValue =
      check.operator === "IS_EMPTY" || check.operator === "IS_NOT_EMPTY";
    const known = AUTOMATION_FIELDS.some((field) => field.key === check.field);
    return (
      <fieldset className="au-fieldset" disabled={disabled}>
        <div className="pa-form-row">
          <label className="form-field">
            <span>Field</span>
            <select
              value={known ? check.field : "__custom"}
              onChange={(event) =>
                onChange({
                  ...check,
                  field:
                    event.target.value === "__custom"
                      ? "cf:"
                      : event.target.value,
                })
              }
            >
              {AUTOMATION_FIELDS.filter(
                (field) => field.key !== "customFields",
              ).map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
              <option value="__custom">Custom field…</option>
            </select>
          </label>
          <label className="form-field">
            <span>Condition</span>
            <select
              value={check.operator}
              onChange={(event) =>
                onChange({
                  ...check,
                  operator: event.target.value as FieldOperator,
                })
              }
            >
              {FIELD_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {FIELD_OPERATOR_LABELS[operator]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!known && (
          <label className="form-field">
            <span>Custom field id</span>
            <input
              value={check.field}
              maxLength={120}
              onChange={(event) =>
                onChange({ ...check, field: event.target.value })
              }
            />
          </label>
        )}
        {!noValue &&
          (check.field === "priority" ? (
            <label className="form-field">
              <span>Value</span>
              <select
                value={check.value ?? ""}
                onChange={(event) =>
                  onChange({ ...check, value: event.target.value })
                }
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </label>
          ) : check.field === "assigneeId" || check.field === "reporter" ? (
            <label className="form-field">
              <span>Value</span>
              <select
                value={check.value ?? ""}
                onChange={(event) =>
                  onChange({ ...check, value: event.target.value })
                }
              >
                <option value="">Choose a person</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="form-field">
              <span>Value</span>
              <input
                value={check.value ?? ""}
                maxLength={500}
                placeholder="Name, key or text (case-insensitive)"
                onChange={(event) =>
                  onChange({ ...check, value: event.target.value })
                }
              />
            </label>
          ))}
      </fieldset>
    );
  }

  const byIdentity = check.operator === "IS" || check.operator === "IS_NOT";
  return (
    <fieldset className="au-fieldset" disabled={disabled}>
      <div className="pa-form-row">
        <label className="form-field">
          <span>User</span>
          <select
            value={check.subject ?? "INITIATOR"}
            onChange={(event) =>
              onChange({
                ...check,
                subject: event.target.value as
                  "INITIATOR" | "ASSIGNEE" | "REPORTER",
              })
            }
          >
            <option value="INITIATOR">Initiator</option>
            <option value="ASSIGNEE">Assignee</option>
            <option value="REPORTER">Reporter</option>
          </select>
        </label>
        <label className="form-field">
          <span>Check</span>
          <select
            value={check.operator}
            onChange={(event) =>
              onChange({
                ...check,
                operator: event.target.value as
                  "IN_ROLE" | "NOT_IN_ROLE" | "IS" | "IS_NOT",
              })
            }
          >
            <option value="IN_ROLE">is in role</option>
            <option value="NOT_IN_ROLE">is not in role</option>
            <option value="IS">is one of</option>
            <option value="IS_NOT">is not one of</option>
          </select>
        </label>
      </div>
      <div
        className="pa-chip-group"
        role="group"
        aria-label={byIdentity ? "People" : "Roles"}
      >
        {byIdentity
          ? members.map((member) => (
              <label className="pa-check-chip" key={member.id}>
                <input
                  type="checkbox"
                  checked={check.memberIds?.includes(member.id) ?? false}
                  onChange={() =>
                    onChange({
                      ...check,
                      memberIds: toggle(check.memberIds, member.id),
                    })
                  }
                />
                {member.name}
              </label>
            ))
          : WORKSPACE_ROLES.map((role) => (
              <label className="pa-check-chip" key={role}>
                <input
                  type="checkbox"
                  checked={check.roles?.includes(role) ?? false}
                  onChange={() =>
                    onChange({ ...check, roles: toggle(check.roles, role) })
                  }
                />
                {role[0].toUpperCase() + role.slice(1)}
              </label>
            ))}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

function AssigneeSelect({
  mode,
  memberId,
  onChange,
  allowKeep = false,
}: {
  mode: "MEMBER" | "REPORTER" | "INITIATOR" | "UNASSIGN" | undefined;
  memberId?: string | null;
  onChange: (
    value: {
      mode: "MEMBER" | "REPORTER" | "INITIATOR" | "UNASSIGN";
      memberId?: string;
    } | null,
  ) => void;
  allowKeep?: boolean;
}) {
  const { members } = useIssues();
  const value =
    mode === undefined ? "" : mode === "MEMBER" ? (memberId ?? "") : mode;
  return (
    <select
      aria-label="Assignee"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return onChange(null);
        onChange(
          next === "REPORTER" || next === "INITIATOR" || next === "UNASSIGN"
            ? { mode: next }
            : { mode: "MEMBER", memberId: next },
        );
      }}
    >
      {allowKeep && <option value="">Don’t change</option>}
      {!allowKeep && mode === "MEMBER" && !memberId && (
        <option value="">Choose a member</option>
      )}
      <option value="REPORTER">Reporter</option>
      <option value="INITIATOR">Initiator (who triggered the rule)</option>
      <option value="UNASSIGN">Unassigned</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({
  value,
  workflow,
  onChange,
}: {
  value: string;
  workflow: Pick<ProjectWorkflow, "statuses">;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label="Status"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {!workflow.statuses.some((status) => status.key === value) && (
        <option value={value}>{value} (removed)</option>
      )}
      {workflow.statuses.map((status) => (
        <option key={status.key} value={status.key}>
          {status.name}
        </option>
      ))}
    </select>
  );
}

function OptionalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: Option[];
  onChange: (value: string | null | undefined) => void;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select
        value={
          value === undefined ? "__keep" : value === null ? "__clear" : value
        }
        onChange={(event) => {
          const next = event.target.value;
          onChange(
            next === "__keep" ? undefined : next === "__clear" ? null : next,
          );
        }}
      >
        <option value="__keep">Don’t change</option>
        <option value="__clear">Clear</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function EditFieldsEditor({
  action,
  lookups,
  onChange,
}: {
  action: Extract<LeafAction, { type: "EDIT_FIELDS" }>;
  lookups: Lookups;
  onChange: (action: LeafAction) => void;
}) {
  const { labels } = useIssues();
  const set = (patch: Partial<typeof action>) => {
    const next = { ...action, ...patch } as Record<string, unknown>;
    for (const key of Object.keys(next))
      if (next[key] === undefined) delete next[key];
    onChange(next as typeof action);
  };
  return (
    <div className="au-stack">
      <div className="pa-form-row">
        <label className="form-field">
          <span>Priority</span>
          <select
            value={action.priority ?? ""}
            onChange={(event) =>
              set({
                priority: (event.target.value || undefined) as
                  IssuePriority | undefined,
              })
            }
          >
            <option value="">Don’t change</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Assignee</span>
          <AssigneeSelect
            allowKeep
            mode={action.assignee?.mode}
            memberId={action.assignee?.memberId}
            onChange={(assignee) => set({ assignee: assignee ?? undefined })}
          />
        </label>
      </div>
      <div className="pa-form-row">
        <label className="form-field">
          <span>Due date</span>
          <input
            placeholder="Don’t change"
            value={action.dueDate ?? ""}
            maxLength={20}
            onChange={(event) =>
              set({ dueDate: event.target.value || undefined })
            }
          />
          <span className="field-meta">+3d, -1w, +1m, today or YYYY-MM-DD</span>
        </label>
        <label className="form-field">
          <span>Story point estimate</span>
          <input
            type="number"
            min={0}
            max={1000}
            placeholder="Don’t change"
            value={action.estimate ?? ""}
            onChange={(event) =>
              set({
                estimate:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      {labels.length > 0 && (
        <div className="au-stack">
          <div className="au-inline">
            <span className="au-label">Labels</span>
            <select
              aria-label="Label edit mode"
              value={action.labels?.mode ?? ""}
              onChange={(event) =>
                set({
                  labels: event.target.value
                    ? {
                        mode: event.target.value as "ADD" | "REMOVE" | "SET",
                        labelIds: action.labels?.labelIds ?? [],
                      }
                    : undefined,
                })
              }
            >
              <option value="">Don’t change</option>
              <option value="ADD">Add</option>
              <option value="REMOVE">Remove</option>
              <option value="SET">Set to exactly</option>
            </select>
          </div>
          {action.labels && (
            <div className="pa-chip-group" role="group" aria-label="Labels">
              {labels.map((label) => (
                <label className="pa-check-chip" key={label.id}>
                  <input
                    type="checkbox"
                    checked={
                      action.labels?.labelIds.includes(label.id) ?? false
                    }
                    onChange={() =>
                      set({
                        labels: {
                          mode: action.labels!.mode,
                          labelIds: toggle(action.labels!.labelIds, label.id),
                        },
                      })
                    }
                  />
                  {label.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="pa-form-row">
        <OptionalSelect
          label="Team"
          value={action.teamId}
          options={lookups.teams}
          onChange={(teamId) => set({ teamId })}
        />
        <OptionalSelect
          label="Goal"
          value={action.goalId}
          options={lookups.goals}
          onChange={(goalId) => set({ goalId })}
        />
      </div>
      <OptionalSelect
        label="Fix version"
        value={action.fixVersionId}
        options={lookups.versions}
        onChange={(fixVersionId) => set({ fixVersionId })}
      />
      <label className="form-field">
        <span>Summary</span>
        <input
          placeholder="Don’t change"
          maxLength={255}
          value={action.summary ?? ""}
          onChange={(event) =>
            set({ summary: event.target.value || undefined })
          }
        />
      </label>
    </div>
  );
}

export function LeafActionEditor({
  action,
  workflow,
  lookups,
  disabled,
  onChange,
}: {
  action: LeafAction;
  workflow: Pick<ProjectWorkflow, "statuses" | "types">;
  lookups: Lookups;
  disabled: boolean;
  onChange: (action: LeafAction) => void;
}) {
  const { members, labels } = useIssues();
  const body = (() => {
    switch (action.type) {
      case "ASSIGN":
        return (
          <label className="form-field">
            <span>Assign to</span>
            <AssigneeSelect
              mode={action.mode}
              memberId={action.memberId}
              onChange={(value) =>
                value && onChange({ type: "ASSIGN", ...value })
              }
            />
          </label>
        );
      case "TRANSITION":
      case "TRANSITION_PARENT":
        return (
          <label className="form-field">
            <span>Destination status</span>
            <StatusSelect
              value={action.status}
              workflow={workflow}
              onChange={(status) => onChange({ ...action, status })}
            />
          </label>
        );
      case "SET_PRIORITY":
        return (
          <label className="form-field">
            <span>Priority</span>
            <select
              value={action.priority}
              onChange={(event) =>
                onChange({
                  ...action,
                  priority: event.target.value as IssuePriority,
                })
              }
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
        );
      case "ADD_LABEL":
        return (
          <label className="form-field">
            <span>Label</span>
            <select
              value={action.labelId}
              onChange={(event) =>
                onChange({ ...action, labelId: event.target.value })
              }
            >
              <option value="">Choose a label</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </label>
        );
      case "ADD_COMMENT":
        return (
          <label className="form-field">
            <span>Comment</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={action.body}
              onChange={(event) =>
                onChange({ ...action, body: event.target.value })
              }
            />
            <SmartValueHint />
          </label>
        );
      case "SET_FLAG":
        return (
          <label className="form-field">
            <span>Flag</span>
            <select
              value={action.flagged ? "true" : "false"}
              onChange={(event) =>
                onChange({ ...action, flagged: event.target.value === "true" })
              }
            >
              <option value="true">Add flag</option>
              <option value="false">Remove flag</option>
            </select>
          </label>
        );
      case "EDIT_FIELDS":
        return (
          <EditFieldsEditor
            action={action}
            lookups={lookups}
            onChange={onChange}
          />
        );
      case "CREATE_ISSUE":
        return (
          <div className="au-stack">
            <div className="pa-form-row">
              <label className="form-field">
                <span>Work type</span>
                <select
                  value={action.kind}
                  onChange={(event) =>
                    onChange({ ...action, kind: event.target.value })
                  }
                >
                  {workflow.types.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Parent</span>
                <select
                  value={action.parent ?? "NONE"}
                  onChange={(event) =>
                    onChange({
                      ...action,
                      parent: event.target.value as "NONE" | "TRIGGER",
                    })
                  }
                >
                  <option value="NONE">No parent</option>
                  <option value="TRIGGER">Trigger issue</option>
                </select>
              </label>
            </div>
            <label className="form-field">
              <span>Summary</span>
              <input
                maxLength={255}
                value={action.summary}
                onChange={(event) =>
                  onChange({ ...action, summary: event.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                rows={2}
                value={action.description ?? ""}
                onChange={(event) =>
                  onChange({
                    ...action,
                    description: event.target.value || undefined,
                  })
                }
              />
            </label>
            <div className="pa-form-row">
              <label className="form-field">
                <span>Priority</span>
                <select
                  value={action.priority ?? "MEDIUM"}
                  onChange={(event) =>
                    onChange({
                      ...action,
                      priority: event.target.value as IssuePriority,
                    })
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Assignee</span>
                <select
                  value={action.assigneeId ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...action,
                      assigneeId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SmartValueHint />
          </div>
        );
      case "CREATE_SUBTASKS":
        return (
          <label className="form-field">
            <span>Subtask summaries (one per line)</span>
            <textarea
              rows={4}
              value={action.summaries.join("\n")}
              onChange={(event) =>
                onChange({
                  ...action,
                  summaries: event.target.value.split("\n").slice(0, 20),
                })
              }
            />
            <SmartValueHint />
          </label>
        );
      case "CLONE_ISSUE":
        return (
          <label className="form-field">
            <span>Summary of the copy</span>
            <input
              maxLength={255}
              value={action.summary ?? ""}
              placeholder="CLONE - {{issue.summary}}"
              onChange={(event) =>
                onChange({
                  ...action,
                  summary: event.target.value || undefined,
                })
              }
            />
          </label>
        );
      case "LINK_ISSUES":
        return (
          <div className="pa-form-row">
            <label className="form-field">
              <span>This issue</span>
              <select
                value={action.linkType}
                onChange={(event) =>
                  onChange({
                    ...action,
                    linkType: event.target.value as IssueLinkType,
                  })
                }
              >
                {LINK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {LINK_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Issue</span>
              <input
                maxLength={200}
                placeholder="WEB-12 or {{issue.parent.key}}"
                value={action.target}
                onChange={(event) =>
                  onChange({ ...action, target: event.target.value })
                }
              />
            </label>
          </div>
        );
      case "NOTIFY":
        return (
          <div className="au-stack">
            <div className="pa-chip-group" role="group" aria-label="Recipients">
              <span className="pa-chip-label">Send to</span>
              {(
                [
                  ["ASSIGNEE", "Assignee"],
                  ["REPORTER", "Reporter"],
                  ["WATCHERS", "Watchers"],
                  ["INITIATOR", "Initiator"],
                ] as const
              ).map(([value, label]) => (
                <label className="pa-check-chip" key={value}>
                  <input
                    type="checkbox"
                    checked={action.recipients?.includes(value) ?? false}
                    onChange={() =>
                      onChange({
                        ...action,
                        recipients: toggle(action.recipients, value),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div
              className="pa-chip-group"
              role="group"
              aria-label="Specific people"
            >
              <span className="pa-chip-label">People</span>
              {members.map((member) => (
                <label className="pa-check-chip" key={member.id}>
                  <input
                    type="checkbox"
                    checked={action.memberIds?.includes(member.id) ?? false}
                    onChange={() =>
                      onChange({
                        ...action,
                        memberIds: toggle(action.memberIds, member.id),
                      })
                    }
                  />
                  {member.name}
                </label>
              ))}
            </div>
            <label className="form-field">
              <span>Title (optional)</span>
              <input
                maxLength={200}
                value={action.subject ?? ""}
                placeholder="Automation: {{issue.key}}"
                onChange={(event) =>
                  onChange({
                    ...action,
                    subject: event.target.value || undefined,
                  })
                }
              />
            </label>
            <label className="form-field">
              <span>Message</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={action.message}
                onChange={(event) =>
                  onChange({ ...action, message: event.target.value })
                }
              />
              <SmartValueHint />
            </label>
          </div>
        );
    }
  })();
  return (
    <fieldset className="au-fieldset" disabled={disabled}>
      {body}
    </fieldset>
  );
}

/** A compact list of leaf actions (inside If/else and branches). */
export function NestedActionList({
  label,
  actions,
  workflow,
  lookups,
  disabled,
  onChange,
}: {
  label: string;
  actions: LeafAction[];
  workflow: Pick<ProjectWorkflow, "statuses" | "types">;
  lookups: Lookups;
  disabled: boolean;
  onChange: (actions: LeafAction[]) => void;
}) {
  const [adding, setAdding] = useState<LeafActionType | "">("");
  return (
    <div className="au-nested">
      <span className="au-label">{label}</span>
      {actions.length === 0 && <p className="pa-muted">No actions.</p>}
      <ol className="au-nested-list">
        {actions.map((action, index) => (
          <li key={index}>
            <div className="au-nested-head">
              <strong>{ACTION_LABELS[action.type]}</strong>
              {!disabled && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${ACTION_LABELS[action.type]}`}
                  onClick={() =>
                    onChange(
                      actions.filter((_, position) => position !== index),
                    )
                  }
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </div>
            <LeafActionEditor
              action={action}
              workflow={workflow}
              lookups={lookups}
              disabled={disabled}
              onChange={(next) =>
                onChange(
                  actions.map((existing, position) =>
                    position === index ? next : existing,
                  ),
                )
              }
            />
          </li>
        ))}
      </ol>
      {!disabled && actions.length < 10 && (
        <div className="au-inline">
          <select
            aria-label={`Add action to ${label}`}
            value={adding}
            onChange={(event) =>
              setAdding(event.target.value as LeafActionType | "")
            }
          >
            <option value="">Choose an action…</option>
            {LEAF_ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACTION_LABELS[type]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button"
            disabled={!adding}
            onClick={() => {
              if (!adding) return;
              onChange([...actions, defaultLeafAction(adding, workflow)]);
              setAdding("");
            }}
          >
            <Plus size={13} aria-hidden="true" /> Add
          </button>
        </div>
      )}
    </div>
  );
}
