"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { apiRequest, useIssues } from "../../../IssueProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import {
  PRIORITY_LABELS,
  type IssuePriority,
  type IssueStatus,
} from "../../../data/issues";
import { useWorkflow } from "../../../WorkflowProvider";

/** The current project's workflow (settings always render under /projects/[id]). */
function useProjectWorkflow() {
  const params = useParams<{ projectId: string }>();
  return useWorkflow(params.projectId);
}
import {
  ACTION_LABELS,
  AUTOMATION_TEMPLATES,
  AUTOMATION_TRIGGERS,
  describeConditions,
  TRIGGER_LABELS,
  type AutomationAction,
  type AutomationActionType,
  type AutomationConditions,
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationTriggerType,
} from "../../../../server/automationRules";
import {
  AdminDialog,
  errorMessage,
  formatDay,
  useProjectResource,
} from "./adminUi";

const PRIORITIES: IssuePriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO_PRIORITY",
];

function defaultAction(type: AutomationActionType): AutomationAction {
  switch (type) {
    case "ASSIGN":
      return { type, mode: "REPORTER" };
    case "TRANSITION":
    case "TRANSITION_PARENT":
      return { type, status: "DONE" };
    case "SET_PRIORITY":
      return { type, priority: "HIGH" };
    case "ADD_LABEL":
      return { type, labelId: "" };
    case "ADD_COMMENT":
      return { type, body: "{{actor}} updated {{issue.key}}" };
    case "SET_FLAG":
      return { type, flagged: true };
  }
}

function toggle<T>(values: T[] | undefined, value: T) {
  const current = values ?? [];
  return current.includes(value)
    ? current.filter((candidate) => candidate !== value)
    : [...current, value];
}

function ActionEditor({
  action,
  onChange,
}: {
  action: AutomationAction;
  onChange: (action: AutomationAction) => void;
}) {
  const { members, labels } = useIssues();
  const workflow = useProjectWorkflow();

  switch (action.type) {
    case "ASSIGN":
      return (
        <select
          aria-label="Assignee"
          value={
            action.mode === "MEMBER" ? (action.memberId ?? "") : action.mode
          }
          onChange={(event) => {
            const value = event.target.value;
            onChange(
              value === "REPORTER" || value === "UNASSIGN"
                ? { type: "ASSIGN", mode: value }
                : { type: "ASSIGN", mode: "MEMBER", memberId: value },
            );
          }}
        >
          <option value="REPORTER">Reporter</option>
          <option value="UNASSIGN">Unassign</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      );
    case "TRANSITION":
    case "TRANSITION_PARENT":
      return (
        <select
          aria-label="Status"
          value={action.status}
          onChange={(event) =>
            onChange({ ...action, status: event.target.value as IssueStatus })
          }
        >
          {!workflow.statuses.some((status) => status.key === action.status) && (
            <option value={action.status}>{action.status} (removed)</option>
          )}
          {workflow.statuses.map((status) => (
            <option key={status.key} value={status.key}>
              {status.name}
            </option>
          ))}
        </select>
      );
    case "SET_PRIORITY":
      return (
        <select
          aria-label="Priority"
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
      );
    case "ADD_LABEL":
      return (
        <select
          aria-label="Label"
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
      );
    case "ADD_COMMENT":
      return (
        <div className="pa-comment-action">
          <textarea
            aria-label="Comment text"
            rows={2}
            maxLength={2000}
            value={action.body}
            onChange={(event) =>
              onChange({ ...action, body: event.target.value })
            }
          />
          <span className="field-meta">
            Placeholders: {"{{issue.key}}"} {"{{issue.summary}}"} {"{{actor}}"}
          </span>
        </div>
      );
    case "SET_FLAG":
      return (
        <select
          aria-label="Flag"
          value={action.flagged ? "true" : "false"}
          onChange={(event) =>
            onChange({ ...action, flagged: event.target.value === "true" })
          }
        >
          <option value="true">Add flag</option>
          <option value="false">Remove flag</option>
        </select>
      );
  }
}

function RuleBuilder({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: AutomationRuleInput;
  onSubmit: (rule: AutomationRuleInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { labels } = useIssues();
  const workflow = useProjectWorkflow();
  const [name, setName] = useState(initial.name);
  const [trigger, setTrigger] = useState<AutomationTriggerType>(
    initial.trigger,
  );
  const [conditions, setConditions] = useState<AutomationConditions>(
    initial.conditions,
  );
  const [actions, setActions] = useState<AutomationAction[]>(initial.actions);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Give the rule a name.");
      return;
    }
    if (actions.length === 0) {
      setError("Add at least one action.");
      return;
    }
    if (
      actions.some((action) => action.type === "ADD_LABEL" && !action.labelId)
    ) {
      setError("Choose a label for every “Add label” action.");
      return;
    }
    const cleaned: AutomationConditions =
      trigger === "STATUS_CHANGED"
        ? conditions
        : { ...conditions, fromStatus: undefined, toStatus: undefined };
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        enabled: initial.enabled,
        trigger,
        conditions: JSON.parse(JSON.stringify(cleaned)) as AutomationConditions,
        actions,
      });
    } catch (submitError) {
      setError(errorMessage(submitError, "Rule could not be saved"));
      setIsSaving(false);
    }
  };

  return (
    <form
      className="pa-form pa-rule-builder"
      onSubmit={handleSubmit}
      noValidate
    >
      <label className="form-field">
        <span>Rule name</span>
        <input
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <section className="pa-rule-step">
        <h4>
          <span className="pa-step-tag pa-step-when">When</span> Trigger
        </h4>
        <select
          aria-label="Trigger"
          value={trigger}
          onChange={(event) =>
            setTrigger(event.target.value as AutomationTriggerType)
          }
        >
          {AUTOMATION_TRIGGERS.map((value) => (
            <option key={value} value={value}>
              {TRIGGER_LABELS[value]}
            </option>
          ))}
        </select>
        {trigger === "STATUS_CHANGED" && (
          <div className="pa-form-row">
            <label className="form-field">
              <span>From status</span>
              <select
                value={conditions.fromStatus ?? ""}
                onChange={(event) =>
                  setConditions((current) => ({
                    ...current,
                    fromStatus: (event.target.value ||
                      null) as IssueStatus | null,
                  }))
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
            <label className="form-field">
              <span>To status</span>
              <select
                value={conditions.toStatus ?? ""}
                onChange={(event) =>
                  setConditions((current) => ({
                    ...current,
                    toStatus: (event.target.value ||
                      null) as IssueStatus | null,
                  }))
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
          </div>
        )}
      </section>

      <section className="pa-rule-step">
        <h4>
          <span className="pa-step-tag pa-step-if">If</span> Conditions
        </h4>
        <div className="pa-chip-group" role="group" aria-label="Issue type is">
          <span className="pa-chip-label">Issue type is</span>
          {workflow.types.map(({ key: kind, name: kindName }) => (
            <label className="pa-check-chip" key={kind}>
              <input
                type="checkbox"
                checked={conditions.issueTypes?.includes(kind) ?? false}
                onChange={() =>
                  setConditions((current) => ({
                    ...current,
                    issueTypes: toggle(current.issueTypes, kind),
                  }))
                }
              />
              {kindName}
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
                  setConditions((current) => ({
                    ...current,
                    priorities: toggle(current.priorities, priority),
                  }))
                }
              />
              {PRIORITY_LABELS[priority]}
            </label>
          ))}
        </div>
        {labels.length > 0 && (
          <div
            className="pa-chip-group"
            role="group"
            aria-label="Label includes"
          >
            <span className="pa-chip-label">Label includes</span>
            {labels.map((label) => (
              <label className="pa-check-chip" key={label.id}>
                <input
                  type="checkbox"
                  checked={conditions.labelIds?.includes(label.id) ?? false}
                  onChange={() =>
                    setConditions((current) => ({
                      ...current,
                      labelIds: toggle(current.labelIds, label.id),
                    }))
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
              setConditions((current) => ({
                ...current,
                assigneeEmpty: event.target.checked || undefined,
              }))
            }
          />
          Assignee is empty
        </label>
        <label className="pa-checkbox">
          <input
            type="checkbox"
            checked={conditions.allSubtasksDone ?? false}
            onChange={(event) =>
              setConditions((current) => ({
                ...current,
                allSubtasksDone: event.target.checked || undefined,
              }))
            }
          />
          All sibling subtasks are done
        </label>
      </section>

      <section className="pa-rule-step">
        <h4>
          <span className="pa-step-tag pa-step-then">Then</span> Actions
        </h4>
        <ol className="pa-action-list">
          {actions.map((action, index) => (
            <li key={index}>
              <select
                aria-label="Action"
                value={action.type}
                onChange={(event) =>
                  setActions((current) =>
                    current.map((existing, position) =>
                      position === index
                        ? defaultAction(
                            event.target.value as AutomationActionType,
                          )
                        : existing,
                    ),
                  )
                }
              >
                {(Object.keys(ACTION_LABELS) as AutomationActionType[]).map(
                  (type) => (
                    <option key={type} value={type}>
                      {ACTION_LABELS[type]}
                    </option>
                  ),
                )}
              </select>
              <ActionEditor
                action={action}
                onChange={(next) =>
                  setActions((current) =>
                    current.map((existing, position) =>
                      position === index ? next : existing,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Remove action"
                onClick={() =>
                  setActions((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        {actions.length < 10 && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setActions((current) => [
                ...current,
                defaultAction("SET_PRIORITY"),
              ])
            }
          >
            <Plus size={13} aria-hidden="true" /> Add action
          </button>
        )}
      </section>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <div className="pa-dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save rule"}
        </button>
      </div>
    </form>
  );
}

const BLANK_RULE: AutomationRuleInput = {
  name: "",
  enabled: true,
  trigger: "ISSUE_CREATED",
  conditions: {},
  actions: [{ type: "SET_PRIORITY", priority: "HIGH" }],
};

type EditorState =
  | { mode: "create"; initial: AutomationRuleInput }
  | { mode: "edit"; rule: AutomationRule }
  | null;

export function AutomationSettings({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const {
    items: rules,
    setItems,
    isLoading,
    error,
  } = useProjectResource<AutomationRule>(projectId, "automation");
  const workflow = useWorkflow(projectId);
  const [editor, setEditor] = useState<EditorState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const base = `/api/projects/${encodeURIComponent(projectId)}/automation`;

  const upsert = (rule: AutomationRule) =>
    setItems((current) =>
      current.some((existing) => existing.id === rule.id)
        ? current.map((existing) => (existing.id === rule.id ? rule : existing))
        : [...current, rule],
    );

  const toggleRule = async (rule: AutomationRule) => {
    setActionError(null);
    upsert({ ...rule, enabled: !rule.enabled });
    try {
      upsert(
        await apiRequest<AutomationRule>(`${base}/${rule.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !rule.enabled }),
        }),
      );
    } catch (toggleError) {
      upsert(rule);
      setActionError(errorMessage(toggleError, "Rule could not be updated"));
    }
  };

  const deleteRule = async (rule: AutomationRule) => {
    if (!window.confirm(`Delete the rule “${rule.name}”?`)) return;
    setActionError(null);
    try {
      await apiRequest(`${base}/${rule.id}`, { method: "DELETE" });
      setItems((current) =>
        current.filter((existing) => existing.id !== rule.id),
      );
    } catch (deleteError) {
      setActionError(errorMessage(deleteError, "Rule could not be deleted"));
    }
  };

  return (
    <div className="pa-settings-form">
      <div className="pa-section-header">
        <div>
          <h3 className="pa-section-title">Rules</h3>
          <p className="pa-muted">
            Rules run when something happens to an issue in this project.
            Automation changes never trigger other rules.
          </p>
        </div>
        {!readOnly && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setEditor({ mode: "create", initial: BLANK_RULE })}
          >
            <Plus size={16} aria-hidden="true" />
            Create rule
          </button>
        )}
      </div>

      {(error || actionError) && (
        <p className="form-submit-error" role="alert">
          {error ?? actionError}
        </p>
      )}

      {isLoading ? (
        <WorkspaceLoading label="rules" />
      ) : rules.length === 0 ? (
        <div className="empty-state">
          <Zap size={22} aria-hidden="true" />
          <h2>No rules yet</h2>
          <p>Start from a template below or build your own rule.</p>
        </div>
      ) : (
        <ul className="pa-rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className={rule.enabled ? undefined : "disabled"}>
              <label className="pa-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={rule.enabled}
                  disabled={readOnly}
                  onChange={() => toggleRule(rule)}
                  aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                />
                <span aria-hidden="true" />
              </label>
              <div className="pa-rule-body">
                <strong>{rule.name}</strong>
                <p className="pa-rule-summary">
                  <span className="pa-step-tag pa-step-when">When</span>
                  {TRIGGER_LABELS[rule.trigger]}
                  {describeConditions(rule.conditions, workflow).map((part) => (
                    <span key={part} className="pa-rule-part">
                      <span className="pa-step-tag pa-step-if">If</span>
                      {part}
                    </span>
                  ))}
                  <span className="pa-step-tag pa-step-then">Then</span>
                  {rule.actions
                    .map((action) => ACTION_LABELS[action.type])
                    .join(", ")}
                </p>
                <span className="pa-muted">
                  Ran {rule.runCount} time{rule.runCount === 1 ? "" : "s"}
                  {rule.lastRunAt ? ` · last ${formatDay(rule.lastRunAt)}` : ""}
                </span>
              </div>
              {!readOnly && (
                <div className="pa-actions-cell">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${rule.name}`}
                    onClick={() => setEditor({ mode: "edit", rule })}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${rule.name}`}
                    onClick={() => deleteRule(rule)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <section>
          <h3 className="pa-section-title">Templates</h3>
          <ul className="pa-template-grid">
            {AUTOMATION_TEMPLATES.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="pa-template"
                  onClick={() =>
                    setEditor({ mode: "create", initial: template.rule })
                  }
                >
                  <Zap size={15} aria-hidden="true" />
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdminDialog
        wide
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        title={editor?.mode === "edit" ? "Edit rule" : "Create rule"}
      >
        {editor && (
          <RuleBuilder
            key={editor.mode === "edit" ? editor.rule.id : editor.initial.name}
            initial={
              editor.mode === "edit"
                ? {
                    name: editor.rule.name,
                    enabled: editor.rule.enabled,
                    trigger: editor.rule.trigger,
                    conditions: editor.rule.conditions,
                    actions: editor.rule.actions,
                  }
                : editor.initial
            }
            onCancel={() => setEditor(null)}
            onSubmit={async (input) => {
              const saved = await apiRequest<AutomationRule>(
                editor.mode === "edit" ? `${base}/${editor.rule.id}` : base,
                {
                  method: editor.mode === "edit" ? "PATCH" : "POST",
                  body: JSON.stringify(input),
                },
              );
              upsert(saved);
              setEditor(null);
            }}
          />
        )}
      </AdminDialog>
    </div>
  );
}
