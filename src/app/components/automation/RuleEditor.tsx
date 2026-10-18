"use client";

import { FormEvent, useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeft,
  Bot,
  Clock,
  GitBranch,
  Play,
  Plus,
  Split,
  Trash2,
  Zap,
} from "lucide-react";
import { useIssues } from "../../IssueProvider";
import type { ProjectWorkflow } from "../../data/workflow";
import {
  ACTION_LABELS,
  AUTOMATION_ACTOR_NAME,
  BRANCH_LABELS,
  TRIGGER_LABELS,
  canRunNow,
  describeAction,
  describeCheck,
  describeConditions,
  describeSchedule,
  type AutomationAction,
  type AutomationConditions,
  type AutomationRule,
  type AutomationSchedule,
  type AutomationTriggerType,
  type ConditionCheck,
  type IfConditions,
  type LeafAction,
  type LeafActionType,
} from "../../../server/automationRules";
import { AutomationAuditLog } from "./AutomationAuditLog";
import {
  BasicConditionsEditor,
  CHECK_LABELS,
  CheckEditor,
  LEAF_ACTION_HINTS,
  LEAF_ACTION_TYPES,
  LeafActionEditor,
  NestedActionList,
  TriggerEditor,
  defaultCheck,
  defaultLeafAction,
  leafActionProblem,
  useAutomationLookups,
} from "./ComponentEditors";

export type RuleDraft = {
  name: string;
  enabled: boolean;
  trigger: AutomationTriggerType;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  schedule: AutomationSchedule | null;
};

type Selection =
  | { kind: "trigger" }
  | { kind: "basic" }
  | { kind: "check"; index: number }
  | { kind: "action"; index: number }
  | { kind: "details" };

const BASIC_KEYS = [
  "issueTypes",
  "priorities",
  "labelIds",
  "assigneeEmpty",
  "allSubtasksDone",
] as const;

function hasBasicConditions(conditions: IfConditions) {
  return BASIC_KEYS.some((key) => {
    const value = conditions[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

function withoutBasic<T extends IfConditions>(conditions: T): T {
  const next = { ...conditions };
  for (const key of BASIC_KEYS) delete next[key];
  return next;
}

/** Drops empty arrays / undefined so the stored JSON stays tidy. */
function cleanConditions(
  conditions: AutomationConditions,
  trigger: AutomationTriggerType,
): AutomationConditions {
  const next: AutomationConditions = JSON.parse(JSON.stringify(conditions));
  for (const key of Object.keys(next) as (keyof AutomationConditions)[]) {
    const value = next[key];
    if (value === null || (Array.isArray(value) && value.length === 0))
      delete next[key];
  }
  if (trigger !== "STATUS_CHANGED") {
    delete next.fromStatus;
    delete next.toStatus;
  }
  if (trigger !== "FIELD_CHANGED") delete next.fields;
  return next;
}

function cleanLeaf(action: LeafAction): LeafAction {
  if (action.type === "CREATE_SUBTASKS") {
    return {
      ...action,
      summaries: action.summaries.map((s) => s.trim()).filter(Boolean),
    };
  }
  return action;
}

function cleanActions(actions: AutomationAction[]): AutomationAction[] {
  return actions.map((action) => {
    if (action.type === "IF_ELSE") {
      return {
        ...action,
        conditions: cleanConditions(
          action.conditions,
          "MANUAL",
        ) as IfConditions,
        then: action.then.map(cleanLeaf),
        else: (action.else ?? []).map(cleanLeaf),
      };
    }
    if (action.type === "BRANCH")
      return { ...action, actions: action.actions.map(cleanLeaf) };
    return cleanLeaf(action);
  });
}

function draftProblem(draft: RuleDraft): string | null {
  if (draft.name.trim().length < 2)
    return "Give the rule a name (Rule details).";
  if (draft.actions.length === 0) return "Add at least one action.";
  if (draft.trigger === "SCHEDULED" && !draft.schedule)
    return "Choose a schedule.";
  for (const check of draft.conditions.checks ?? []) {
    if (check.type === "JQL" && !check.jql.trim())
      return "Enter the JQL for the JQL condition.";
  }
  const leaves = draft.actions.flatMap((action) =>
    action.type === "IF_ELSE"
      ? [...action.then, ...(action.else ?? [])]
      : action.type === "BRANCH"
        ? action.actions
        : [action],
  );
  for (const action of draft.actions) {
    if (action.type === "IF_ELSE" && action.then.length === 0) {
      return "Add at least one action to the If block.";
    }
    if (action.type === "BRANCH") {
      if (action.actions.length === 0)
        return "Add at least one action to the branch.";
      if (action.scope === "JQL" && !action.jql?.trim())
        return "Enter the branch JQL.";
    }
  }
  for (const leaf of leaves) {
    const problem = leafActionProblem(leaf);
    if (problem) return problem;
  }
  return null;
}

function triggerSummary(
  draft: RuleDraft,
  workflow: Pick<ProjectWorkflow, "statuses">,
) {
  if (draft.trigger === "SCHEDULED") return describeSchedule(draft.schedule);
  const parts = describeConditions(
    {
      fromStatus: draft.conditions.fromStatus,
      toStatus: draft.conditions.toStatus,
      fields:
        draft.trigger === "FIELD_CHANGED" ? draft.conditions.fields : undefined,
    },
    workflow,
  );
  if (draft.trigger === "FIELD_CHANGED" && !draft.conditions.fields?.length) {
    parts.push("any field");
  }
  return parts.join(" · ");
}

function ComponentCard({
  tone,
  label,
  title,
  summary,
  selected,
  icon,
  onSelect,
  onRemove,
  children,
}: {
  tone: "when" | "if" | "then" | "branch";
  label: string;
  title: string;
  summary?: string;
  selected: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li className={`au-card au-card-${tone}${selected ? " selected" : ""}`}>
      <button
        type="button"
        className="au-card-main"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className={`au-card-icon au-icon-${tone}`} aria-hidden="true">
          {icon}
        </span>
        <span className="au-card-text">
          <span className="au-card-label">{label}</span>
          <strong>{title}</strong>
          {summary && <span className="au-card-summary">{summary}</span>}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="icon-button au-card-remove"
          aria-label={`Remove ${title}`}
          onClick={onRemove}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
      {children}
    </li>
  );
}

export function RuleEditor({
  projectId,
  rule,
  initial,
  workflow,
  readOnly,
  onSave,
  onBack,
  onRunNow,
}: {
  projectId: string;
  /** The saved rule, when editing (enables the audit log tab). */
  rule: AutomationRule | null;
  initial: RuleDraft;
  workflow: ProjectWorkflow;
  readOnly: boolean;
  onSave: (draft: RuleDraft) => Promise<void>;
  onBack: () => void;
  onRunNow?: (rule: AutomationRule) => Promise<string>;
}) {
  const { members } = useIssues();
  const lookups = useAutomationLookups(projectId);
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [selection, setSelection] = useState<Selection>(
    rule ? { kind: "trigger" } : { kind: "details" },
  );
  const [tab, setTab] = useState<"rule" | "audit">("rule");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [auditKey, setAuditKey] = useState(0);
  const memberNames = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.name])),
    [members],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const update = (patch: Partial<RuleDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setNotice(null);
  };
  const setConditions = (conditions: AutomationConditions) =>
    update({ conditions });
  const checks = draft.conditions.checks ?? [];
  const setChecks = (next: ConditionCheck[]) =>
    setConditions({ ...draft.conditions, checks: next });
  const setActions = (actions: AutomationAction[]) => update({ actions });
  const replaceAction = (index: number, action: AutomationAction) =>
    setActions(
      draft.actions.map((existing, position) =>
        position === index ? action : existing,
      ),
    );

  const addCheck = (type: ConditionCheck["type"]) => {
    setChecks([...checks, defaultCheck(type)]);
    setSelection({ kind: "check", index: checks.length });
  };
  const addBasic = () => {
    if (!hasBasicConditions(draft.conditions)) {
      setConditions({
        ...draft.conditions,
        issueTypes: [workflow.types[0]?.key ?? "TASK"],
      });
    }
    setSelection({ kind: "basic" });
  };
  const addAction = (action: AutomationAction) => {
    if (draft.actions.length >= 10) {
      setError("A rule can have at most 10 top-level components.");
      return;
    }
    setActions([...draft.actions, action]);
    setSelection({ kind: "action", index: draft.actions.length });
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        conditions: cleanConditions(draft.conditions, draft.trigger),
        actions: cleanActions(draft.actions),
        schedule: draft.trigger === "SCHEDULED" ? draft.schedule : null,
      });
      setNotice("Rule saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Rule could not be saved",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const runNow = async () => {
    if (!rule || !onRunNow) return;
    setIsRunning(true);
    setError(null);
    try {
      setNotice(await onRunNow(rule));
      setAuditKey((key) => key + 1);
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Rule could not be run",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const selectedAction =
    selection.kind === "action" ? draft.actions[selection.index] : undefined;
  const selectedCheck =
    selection.kind === "check" ? checks[selection.index] : undefined;

  const configPanel = (() => {
    if (selection.kind === "details") {
      return (
        <div className="au-config-body">
          <h3>Rule details</h3>
          <fieldset className="au-fieldset" disabled={readOnly}>
            <label className="form-field">
              <span>Name</span>
              <input
                value={draft.name}
                maxLength={120}
                placeholder="e.g. Close parent when subtasks are done"
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className="pa-checkbox">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
              Rule is enabled
            </label>
          </fieldset>
          <dl className="au-details">
            <dt>Actor</dt>
            <dd>
              <Bot size={13} aria-hidden="true" /> {AUTOMATION_ACTOR_NAME}
            </dd>
            <dt>Scope</dt>
            <dd>This project</dd>
            <dt>Loop protection</dt>
            <dd>Changes made by automation never trigger other rules.</dd>
            {rule && (
              <>
                <dt>Executions</dt>
                <dd>
                  {rule.runCount} successful
                  {rule.lastRunAt
                    ? ` · last run ${new Date(rule.lastRunAt).toLocaleString()}`
                    : ""}
                </dd>
              </>
            )}
            {rule?.nextRunAt && (
              <>
                <dt>Next run</dt>
                <dd>{new Date(rule.nextRunAt).toLocaleString()}</dd>
              </>
            )}
          </dl>
        </div>
      );
    }
    if (selection.kind === "trigger") {
      return (
        <div className="au-config-body">
          <h3>When: {TRIGGER_LABELS[draft.trigger]}</h3>
          <TriggerEditor
            trigger={draft.trigger}
            conditions={draft.conditions}
            schedule={draft.schedule}
            workflow={workflow}
            disabled={readOnly}
            onTrigger={(trigger) =>
              update({
                trigger,
                schedule:
                  trigger === "SCHEDULED"
                    ? (draft.schedule ?? { frequency: "DAILY", time: "09:00" })
                    : draft.schedule,
              })
            }
            onConditions={setConditions}
            onSchedule={(schedule) => update({ schedule })}
          />
        </div>
      );
    }
    if (selection.kind === "basic") {
      return (
        <div className="au-config-body">
          <h3>If: issue matches</h3>
          <BasicConditionsEditor
            conditions={draft.conditions}
            workflow={workflow}
            disabled={readOnly}
            onChange={(next) => setConditions(next as AutomationConditions)}
          />
        </div>
      );
    }
    if (selectedCheck && selection.kind === "check") {
      return (
        <div className="au-config-body">
          <h3>If: {CHECK_LABELS[selectedCheck.type]}</h3>
          <CheckEditor
            check={selectedCheck}
            disabled={readOnly}
            onChange={(next) =>
              setChecks(
                checks.map((existing, index) =>
                  index === selection.index ? next : existing,
                ),
              )
            }
          />
        </div>
      );
    }
    if (selectedAction && selection.kind === "action") {
      const index = selection.index;
      if (selectedAction.type === "IF_ELSE") {
        return (
          <div className="au-config-body">
            <h3>If / else block</h3>
            <span className="au-label">If the issue matches</span>
            <BasicConditionsEditor
              conditions={selectedAction.conditions}
              workflow={workflow}
              disabled={readOnly}
              onChange={(conditions) =>
                replaceAction(index, { ...selectedAction, conditions })
              }
            />
            {(selectedAction.conditions.checks ?? []).map(
              (check, checkIndex) => (
                <div className="au-nested" key={checkIndex}>
                  <div className="au-nested-head">
                    <strong>{CHECK_LABELS[check.type]}</strong>
                    {!readOnly && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${CHECK_LABELS[check.type]}`}
                        onClick={() =>
                          replaceAction(index, {
                            ...selectedAction,
                            conditions: {
                              ...selectedAction.conditions,
                              checks: (
                                selectedAction.conditions.checks ?? []
                              ).filter(
                                (_, position) => position !== checkIndex,
                              ),
                            },
                          })
                        }
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <CheckEditor
                    check={check}
                    disabled={readOnly}
                    onChange={(next) =>
                      replaceAction(index, {
                        ...selectedAction,
                        conditions: {
                          ...selectedAction.conditions,
                          checks: (selectedAction.conditions.checks ?? []).map(
                            (existing, position) =>
                              position === checkIndex ? next : existing,
                          ),
                        },
                      })
                    }
                  />
                </div>
              ),
            )}
            {!readOnly && (
              <div className="au-inline">
                {(["FIELD", "JQL", "USER"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="text-button"
                    onClick={() =>
                      replaceAction(index, {
                        ...selectedAction,
                        conditions: {
                          ...selectedAction.conditions,
                          checks: [
                            ...(selectedAction.conditions.checks ?? []),
                            defaultCheck(type),
                          ],
                        },
                      })
                    }
                  >
                    <Plus size={12} aria-hidden="true" /> {CHECK_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
            <NestedActionList
              label="Then"
              actions={selectedAction.then}
              workflow={workflow}
              lookups={lookups}
              disabled={readOnly}
              onChange={(then) =>
                replaceAction(index, { ...selectedAction, then })
              }
            />
            <NestedActionList
              label="Else"
              actions={selectedAction.else ?? []}
              workflow={workflow}
              lookups={lookups}
              disabled={readOnly}
              onChange={(elseActions) =>
                replaceAction(index, { ...selectedAction, else: elseActions })
              }
            />
          </div>
        );
      }
      if (selectedAction.type === "BRANCH") {
        return (
          <div className="au-config-body">
            <h3>Branch rule / related issues</h3>
            <fieldset className="au-fieldset" disabled={readOnly}>
              <label className="form-field">
                <span>Type of related issues</span>
                <select
                  value={selectedAction.scope}
                  onChange={(event) =>
                    replaceAction(index, {
                      ...selectedAction,
                      scope: event.target.value as
                        "SUBTASKS" | "PARENT" | "JQL",
                    })
                  }
                >
                  {(
                    Object.keys(BRANCH_LABELS) as (keyof typeof BRANCH_LABELS)[]
                  ).map((scope) => (
                    <option key={scope} value={scope}>
                      {BRANCH_LABELS[scope]}
                    </option>
                  ))}
                </select>
              </label>
              {selectedAction.scope === "JQL" && (
                <label className="form-field">
                  <span>JQL</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={selectedAction.jql ?? ""}
                    placeholder="e.g. parent = {{issue.key}} AND statusCategory != Done"
                    onChange={(event) =>
                      replaceAction(index, {
                        ...selectedAction,
                        jql: event.target.value,
                      })
                    }
                  />
                  <span className="field-meta">
                    Searches this project. Smart values work here.
                  </span>
                </label>
              )}
            </fieldset>
            <NestedActionList
              label="Actions for each issue"
              actions={selectedAction.actions}
              workflow={workflow}
              lookups={lookups}
              disabled={readOnly}
              onChange={(actions) =>
                replaceAction(index, { ...selectedAction, actions })
              }
            />
          </div>
        );
      }
      return (
        <div className="au-config-body">
          <h3>Then: {ACTION_LABELS[selectedAction.type]}</h3>
          <p className="pa-muted">{LEAF_ACTION_HINTS[selectedAction.type]}</p>
          <LeafActionEditor
            action={selectedAction}
            workflow={workflow}
            lookups={lookups}
            disabled={readOnly}
            onChange={(next) => replaceAction(index, next)}
          />
        </div>
      );
    }
    return <p className="pa-muted">Select a component to configure it.</p>;
  })();

  const isSelected = (candidate: Selection) =>
    candidate.kind === selection.kind &&
    ("index" in candidate
      ? "index" in selection && candidate.index === selection.index
      : true);

  return (
    <form className="au-editor" onSubmit={handleSubmit} noValidate>
      <header className="au-editor-header">
        <button type="button" className="text-button" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> Rules
        </button>
        <div className="au-editor-title">
          <h3>{draft.name.trim() || "New rule"}</h3>
          <span className={draft.enabled ? "au-state au-state-on" : "au-state"}>
            {draft.enabled ? "Enabled" : "Disabled"}
          </span>
          {dirty && (
            <span className="au-state au-state-draft">Unsaved changes</span>
          )}
        </div>
        <div className="au-editor-actions">
          {rule &&
            canRunNow(rule.trigger) &&
            rule.trigger === "SCHEDULED" &&
            onRunNow &&
            !readOnly && (
              <button
                type="button"
                className="secondary-button"
                disabled={isRunning || dirty}
                title={dirty ? "Save your changes first" : undefined}
                onClick={runNow}
              >
                <Play size={14} aria-hidden="true" />{" "}
                {isRunning ? "Running..." : "Run rule now"}
              </button>
            )}
          {!readOnly && (
            <button
              className="primary-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : rule ? "Save rule" : "Turn on rule"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="au-notice" role="status">
          {notice}
        </p>
      )}

      {rule && (
        <div className="au-tabs" role="tablist" aria-label="Rule views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "rule"}
            className={tab === "rule" ? "active" : undefined}
            onClick={() => setTab("rule")}
          >
            Rule details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "audit"}
            className={tab === "audit" ? "active" : undefined}
            onClick={() => setTab("audit")}
          >
            Audit log
          </button>
        </div>
      )}

      {tab === "audit" && rule ? (
        <AutomationAuditLog
          projectId={projectId}
          ruleId={rule.id}
          refreshKey={auditKey}
        />
      ) : (
        <div className="au-builder">
          <div className="au-flow-column">
            <ol className="au-flow">
              <ComponentCard
                tone="when"
                label="Rule details"
                title={draft.name.trim() || "Untitled rule"}
                summary={`Actor: ${AUTOMATION_ACTOR_NAME}`}
                icon={<Bot size={14} />}
                selected={isSelected({ kind: "details" })}
                onSelect={() => setSelection({ kind: "details" })}
              />
              <ComponentCard
                tone="when"
                label="When"
                title={TRIGGER_LABELS[draft.trigger]}
                summary={triggerSummary(draft, workflow) || undefined}
                icon={
                  draft.trigger === "SCHEDULED" ? (
                    <Clock size={14} />
                  ) : (
                    <Zap size={14} />
                  )
                }
                selected={isSelected({ kind: "trigger" })}
                onSelect={() => setSelection({ kind: "trigger" })}
              />
              {hasBasicConditions(draft.conditions) && (
                <ComponentCard
                  tone="if"
                  label="If"
                  title="Issue matches"
                  summary={describeConditions(
                    Object.fromEntries(
                      BASIC_KEYS.map((key) => [key, draft.conditions[key]]),
                    ) as IfConditions,
                    workflow,
                  ).join(" · ")}
                  icon={<Split size={14} />}
                  selected={isSelected({ kind: "basic" })}
                  onSelect={() => setSelection({ kind: "basic" })}
                  onRemove={
                    readOnly
                      ? undefined
                      : () => {
                          setConditions(withoutBasic(draft.conditions));
                          setSelection({ kind: "trigger" });
                        }
                  }
                />
              )}
              {checks.map((check, index) => (
                <ComponentCard
                  key={`check-${index}`}
                  tone="if"
                  label="If"
                  title={CHECK_LABELS[check.type]}
                  summary={describeCheck(check, memberNames)}
                  icon={<Split size={14} />}
                  selected={isSelected({ kind: "check", index })}
                  onSelect={() => setSelection({ kind: "check", index })}
                  onRemove={
                    readOnly
                      ? undefined
                      : () => {
                          setChecks(
                            checks.filter((_, position) => position !== index),
                          );
                          setSelection({ kind: "trigger" });
                        }
                  }
                />
              ))}
              {draft.actions.map((action, index) => (
                <ComponentCard
                  key={`action-${index}`}
                  tone={
                    action.type === "BRANCH" || action.type === "IF_ELSE"
                      ? "branch"
                      : "then"
                  }
                  label={
                    action.type === "BRANCH"
                      ? "Branch"
                      : action.type === "IF_ELSE"
                        ? "If / else"
                        : "Then"
                  }
                  title={
                    action.type === "BRANCH"
                      ? BRANCH_LABELS[action.scope]
                      : ACTION_LABELS[action.type]
                  }
                  summary={
                    action.type === "BRANCH" || action.type === "IF_ELSE"
                      ? describeAction(action)
                      : undefined
                  }
                  icon={
                    action.type === "BRANCH" || action.type === "IF_ELSE" ? (
                      <GitBranch size={14} />
                    ) : (
                      <Play size={14} />
                    )
                  }
                  selected={isSelected({ kind: "action", index })}
                  onSelect={() => setSelection({ kind: "action", index })}
                  onRemove={
                    readOnly
                      ? undefined
                      : () => {
                          setActions(
                            draft.actions.filter(
                              (_, position) => position !== index,
                            ),
                          );
                          setSelection({ kind: "trigger" });
                        }
                  }
                >
                  {action.type === "IF_ELSE" && (
                    <ul className="au-card-children">
                      {action.then.map((nested, nestedIndex) => (
                        <li key={`t${nestedIndex}`}>
                          <span className="pa-step-tag pa-step-then">Then</span>
                          {ACTION_LABELS[nested.type]}
                        </li>
                      ))}
                      {(action.else ?? []).map((nested, nestedIndex) => (
                        <li key={`e${nestedIndex}`}>
                          <span className="pa-step-tag pa-step-if">Else</span>
                          {ACTION_LABELS[nested.type]}
                        </li>
                      ))}
                    </ul>
                  )}
                  {action.type === "BRANCH" && (
                    <ul className="au-card-children">
                      {action.actions.map((nested, nestedIndex) => (
                        <li key={nestedIndex}>
                          <span className="pa-step-tag pa-step-then">Then</span>
                          {ACTION_LABELS[nested.type]}
                        </li>
                      ))}
                    </ul>
                  )}
                </ComponentCard>
              ))}
            </ol>

            {!readOnly && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className="au-add-component">
                    <Plus size={14} aria-hidden="true" /> Add component
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="issue-menu au-add-menu"
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                  >
                    <DropdownMenu.Label className="au-menu-label">
                      New condition
                    </DropdownMenu.Label>
                    <DropdownMenu.Item
                      className="issue-menu-item"
                      onSelect={addBasic}
                    >
                      Work type / priority / label
                    </DropdownMenu.Item>
                    {(["FIELD", "JQL", "USER"] as const).map((type) => (
                      <DropdownMenu.Item
                        key={type}
                        className="issue-menu-item"
                        onSelect={() => addCheck(type)}
                      >
                        {CHECK_LABELS[type]}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Item
                      className="issue-menu-item"
                      onSelect={() =>
                        addAction({
                          type: "IF_ELSE",
                          conditions: { priorities: ["HIGH", "URGENT"] },
                          then: [{ type: "SET_FLAG", flagged: true }],
                          else: [],
                        })
                      }
                    >
                      If / else block
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="issue-menu-separator" />
                    <DropdownMenu.Label className="au-menu-label">
                      New action
                    </DropdownMenu.Label>
                    {LEAF_ACTION_TYPES.map((type: LeafActionType) => (
                      <DropdownMenu.Item
                        key={type}
                        className="issue-menu-item"
                        onSelect={() =>
                          addAction(defaultLeafAction(type, workflow))
                        }
                      >
                        {ACTION_LABELS[type]}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="issue-menu-separator" />
                    <DropdownMenu.Label className="au-menu-label">
                      New branch
                    </DropdownMenu.Label>
                    {(
                      Object.keys(
                        BRANCH_LABELS,
                      ) as (keyof typeof BRANCH_LABELS)[]
                    ).map((scope) => (
                      <DropdownMenu.Item
                        key={scope}
                        className="issue-menu-item"
                        onSelect={() =>
                          addAction({
                            type: "BRANCH",
                            scope,
                            ...(scope === "JQL"
                              ? { jql: "statusCategory != Done" }
                              : {}),
                            actions: [
                              {
                                type: "ADD_COMMENT",
                                body: "Updated by {{rule.name}}",
                              },
                            ],
                          })
                        }
                      >
                        {BRANCH_LABELS[scope]}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>

          <aside className="au-config" aria-label="Component configuration">
            {configPanel}
          </aside>
        </div>
      )}

      {rule && tab === "rule" && (
        <section className="au-recent">
          <h4>Recent runs</h4>
          <AutomationAuditLog
            projectId={projectId}
            ruleId={rule.id}
            refreshKey={auditKey}
            compact
          />
        </section>
      )}
    </form>
  );
}
