"use client";

import { useMemo, useState } from "react";
import { Clock, Play, Plus, Trash2, Zap } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { useWorkflow } from "../../../WorkflowProvider";
import { AutomationAuditLog } from "../../../components/automation/AutomationAuditLog";
import {
  RuleEditor,
  type RuleDraft,
} from "../../../components/automation/RuleEditor";
import {
  AUTOMATION_TEMPLATES,
  RUN_STATUS_LABELS,
  TRIGGER_LABELS,
  describeAction,
  describeConditions,
  describeSchedule,
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationRunStatus,
  type AutomationTemplate,
} from "../../../../server/automationRules";
import { errorMessage, formatDay, useProjectResource } from "./adminUi";

const BLANK_RULE: RuleDraft = {
  name: "",
  enabled: true,
  trigger: "ISSUE_CREATED",
  conditions: {},
  actions: [{ type: "SET_PRIORITY", priority: "HIGH" }],
  schedule: null,
};

function draftFromInput(input: AutomationRuleInput): RuleDraft {
  // Templates are written as schema input; round-trip through JSON so the
  // editor owns a fresh copy.
  const copy = JSON.parse(JSON.stringify(input)) as AutomationRuleInput;
  return {
    name: copy.name,
    enabled: copy.enabled ?? true,
    trigger: copy.trigger,
    conditions: (copy.conditions ?? {}) as RuleDraft["conditions"],
    actions: copy.actions as RuleDraft["actions"],
    schedule: (copy.schedule ?? null) as RuleDraft["schedule"],
  };
}

function draftFromRule(rule: AutomationRule): RuleDraft {
  return {
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger,
    conditions: rule.conditions,
    actions: rule.actions,
    schedule: rule.schedule,
  };
}

type View =
  | { mode: "list" }
  | { mode: "edit"; ruleId: string }
  | { mode: "create"; draft: RuleDraft; key: string };

type Tab = "rules" | "audit" | "templates";

function TemplateGallery({
  onPick,
}: {
  onPick: (template: AutomationTemplate | null) => void;
}) {
  const categories = [
    ...new Set(AUTOMATION_TEMPLATES.map((template) => template.category)),
  ];
  return (
    <div className="au-templates">
      <button
        type="button"
        className="pa-template au-blank"
        onClick={() => onPick(null)}
      >
        <Plus size={15} aria-hidden="true" />
        <strong>Create from scratch</strong>
        <span>Pick a trigger, add conditions and actions.</span>
      </button>
      {categories.map((category) => (
        <section key={category}>
          <h4 className="au-template-heading">{category}</h4>
          <ul className="pa-template-grid">
            {AUTOMATION_TEMPLATES.filter(
              (template) => template.category === category,
            ).map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="pa-template"
                  onClick={() => onPick(template)}
                >
                  {template.rule.trigger === "SCHEDULED" ? (
                    <Clock size={15} aria-hidden="true" />
                  ) : (
                    <Zap size={15} aria-hidden="true" />
                  )}
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

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
  const [view, setView] = useState<View>({ mode: "list" });
  const [tab, setTab] = useState<Tab>("rules");
  const [query, setQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/api/projects/${encodeURIComponent(projectId)}/automation`;

  const upsert = (rule: AutomationRule) =>
    setItems((current) =>
      current.some((existing) => existing.id === rule.id)
        ? current.map((existing) => (existing.id === rule.id ? rule : existing))
        : [...current, rule],
    );

  const filtered = useMemo(
    () =>
      rules.filter(
        (rule) =>
          (!query.trim() ||
            rule.name.toLowerCase().includes(query.trim().toLowerCase())) &&
          (!triggerFilter || rule.trigger === triggerFilter),
      ),
    [query, rules, triggerFilter],
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
    if (
      !window.confirm(
        `Delete the rule “${rule.name}”? Its audit log is deleted too.`,
      )
    )
      return;
    setActionError(null);
    try {
      await apiRequest(`${base}/${rule.id}`, { method: "DELETE" });
      setItems((current) =>
        current.filter((existing) => existing.id !== rule.id),
      );
      if (view.mode === "edit" && view.ruleId === rule.id)
        setView({ mode: "list" });
    } catch (deleteError) {
      setActionError(errorMessage(deleteError, "Rule could not be deleted"));
    }
  };

  const runNow = async (rule: AutomationRule) => {
    const response = await apiRequest<{
      runs: { status: AutomationRunStatus; message: string }[];
    }>(`${base}/${rule.id}/run`, { method: "POST", body: "{}" });
    const refreshed = await apiRequest<{ rule: AutomationRule }>(
      `${base}/${rule.id}`,
    );
    upsert(refreshed.rule);
    const counts = response.runs.reduce<Record<string, number>>((all, run) => {
      all[run.status] = (all[run.status] ?? 0) + 1;
      return all;
    }, {});
    return `Rule ran: ${
      Object.entries(counts)
        .map(
          ([status, count]) =>
            `${count} ${RUN_STATUS_LABELS[status as AutomationRunStatus].toLowerCase()}`,
        )
        .join(", ") || "no runs"
    }. See the audit log for details.`;
  };

  const startCreate = (template: AutomationTemplate | null) => {
    setActionError(null);
    setView({
      mode: "create",
      draft: template ? draftFromInput(template.rule) : BLANK_RULE,
      key: template?.id ?? `blank-${Date.now()}`,
    });
  };

  if (view.mode !== "list") {
    const rule =
      view.mode === "edit"
        ? rules.find((candidate) => candidate.id === view.ruleId)
        : null;
    if (view.mode === "edit" && !rule) {
      return <WorkspaceLoading label="rule" />;
    }
    return (
      <RuleEditor
        key={view.mode === "edit" ? `${view.ruleId}` : view.key}
        projectId={projectId}
        rule={rule ?? null}
        initial={
          rule ? draftFromRule(rule) : (view as { draft: RuleDraft }).draft
        }
        workflow={workflow}
        readOnly={readOnly}
        onBack={() => setView({ mode: "list" })}
        onRunNow={runNow}
        onSave={async (draft) => {
          const saved = await apiRequest<AutomationRule>(
            rule ? `${base}/${rule.id}` : base,
            {
              method: rule ? "PATCH" : "POST",
              body: JSON.stringify(draft),
            },
          );
          upsert(saved);
          if (!rule) {
            setNotice(
              `“${saved.name}” is ${saved.enabled ? "on" : "saved (disabled)"}.`,
            );
            setView({ mode: "list" });
          } else {
            setView({ mode: "edit", ruleId: saved.id });
          }
        }}
      />
    );
  }

  return (
    <div className="pa-settings-form au-settings">
      <div className="pa-section-header">
        <div>
          <p className="pa-muted">
            Rules run when something happens in this project, on a schedule or
            on demand. Changes made by automation never trigger other rules.
          </p>
        </div>
        {!readOnly && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setTab("templates")}
          >
            <Plus size={16} aria-hidden="true" />
            Create rule
          </button>
        )}
      </div>

      <div className="au-tabs" role="tablist" aria-label="Automation views">
        {(
          [
            ["rules", "Rules"],
            ["audit", "Audit log"],
            ...(readOnly ? [] : [["templates", "Templates"]]),
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : undefined}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {(error || actionError) && (
        <p className="form-submit-error" role="alert">
          {error ?? actionError}
        </p>
      )}
      {notice && (
        <p className="au-notice" role="status">
          {notice}
        </p>
      )}

      {tab === "audit" ? (
        <AutomationAuditLog projectId={projectId} rules={rules} />
      ) : tab === "templates" ? (
        <TemplateGallery onPick={startCreate} />
      ) : isLoading ? (
        <WorkspaceLoading label="rules" />
      ) : rules.length === 0 ? (
        <div className="empty-state">
          <Zap size={22} aria-hidden="true" />
          <h2>No rules yet</h2>
          <p>
            Automate repetitive work: start from a template or build your own
            rule.
          </p>
          {!readOnly && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTab("templates")}
            >
              Browse templates
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="au-list-filters">
            <input
              type="search"
              aria-label="Search rules"
              placeholder="Search rules"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Filter by trigger"
              value={triggerFilter}
              onChange={(event) => setTriggerFilter(event.target.value)}
            >
              <option value="">All triggers</option>
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {filtered.length === 0 ? (
            <p className="pa-muted">No rules match.</p>
          ) : (
            <ul className="pa-rule-list">
              {filtered.map((rule) => (
                <li
                  key={rule.id}
                  className={rule.enabled ? undefined : "disabled"}
                >
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
                    <button
                      type="button"
                      className="au-rule-name"
                      onClick={() => setView({ mode: "edit", ruleId: rule.id })}
                    >
                      {rule.name}
                    </button>
                    <p className="pa-rule-summary">
                      <span className="pa-step-tag pa-step-when">When</span>
                      {TRIGGER_LABELS[rule.trigger]}
                      {rule.trigger === "SCHEDULED" &&
                        ` · ${describeSchedule(rule.schedule)}`}
                      {describeConditions(rule.conditions, workflow).map(
                        (part) => (
                          <span key={part} className="pa-rule-part">
                            <span className="pa-step-tag pa-step-if">If</span>
                            {part}
                          </span>
                        ),
                      )}
                      <span className="pa-step-tag pa-step-then">Then</span>
                      {rule.actions.map(describeAction).join(", ")}
                    </p>
                    <span className="pa-muted">
                      {rule.runCount} successful run
                      {rule.runCount === 1 ? "" : "s"}
                      {rule.lastRunAt
                        ? ` · last run ${formatDay(rule.lastRunAt)}`
                        : ""}
                      {rule.nextRunAt && rule.enabled
                        ? ` · next ${new Date(rule.nextRunAt).toLocaleString()}`
                        : ""}
                    </span>
                  </div>
                  <div className="pa-actions-cell">
                    {!readOnly &&
                      rule.trigger === "SCHEDULED" &&
                      rule.enabled && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Run ${rule.name} now`}
                          title="Run rule now"
                          onClick={async () => {
                            setActionError(null);
                            try {
                              setNotice(await runNow(rule));
                            } catch (runError) {
                              setActionError(
                                errorMessage(runError, "Rule could not be run"),
                              );
                            }
                          }}
                        >
                          <Play size={14} aria-hidden="true" />
                        </button>
                      )}
                    {!readOnly && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${rule.name}`}
                        onClick={() => deleteRule(rule)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
