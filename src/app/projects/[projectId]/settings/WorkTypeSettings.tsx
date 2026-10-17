"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { useWorkflow, useWorkflows } from "../../../WorkflowProvider";
import {
  WorkTypeGlyph,
  typeIconStyle,
} from "../../../components/IssueVisuals";
import {
  WORKFLOW_COLORS,
  WORK_TYPE_ICONS,
  isBuiltinKind,
  type ProjectWorkflow,
  type TypeLevel,
  type WorkTypeConfig,
} from "../../../data/workflow";
import { AdminDialog, errorMessage } from "./adminUi";
import {
  groupTypes,
  levelName,
  typeDeleteBlocker,
  typeReplacementOptions,
} from "./workflowEditor";

const LEVEL_HELP: Record<string, string> = {
  "1": "Epics group many work items toward a larger goal. They sit at the top of the hierarchy and cannot have a parent.",
  "0": "Stories, tasks and bugs are the everyday work items. They can belong to an epic and contain subtasks.",
  "-1": "Subtasks break a standard work item into smaller steps. They always need a standard parent.",
};

const TYPE_COLORS = [...new Set(["#987dff", "#8fbe35", "#39c6d0", "#e94f75", ...WORKFLOW_COLORS])];

type TypeDraft = {
  key: string | null;
  name: string;
  level: TypeLevel;
  icon: string;
  color: string;
  description: string;
};

function TypeBadge({ type }: { type: Pick<WorkTypeConfig, "icon" | "color" | "name"> }) {
  return (
    <span className="kind-icon kind-custom" style={typeIconStyle(type.color)} title={type.name}>
      <WorkTypeGlyph icon={type.icon} />
    </span>
  );
}

function TypeDialog({
  draft,
  onClose,
  onSubmit,
}: {
  draft: TypeDraft;
  onClose: () => void;
  onSubmit: (draft: TypeDraft) => Promise<void>;
}) {
  const [value, setValue] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = draft.key !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.name.trim()) {
      setError("Give the work type a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...value, name: value.name.trim() });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError, "Work type could not be saved"));
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? `Edit ${draft.name}` : "Add work type"}
      description="Work types describe the kind of work and where it sits in the hierarchy."
    >
      <form className="pa-form" onSubmit={submit} noValidate>
        <div className="wt-preview">
          <TypeBadge type={value} />
          <strong>{value.name.trim() || "New work type"}</strong>
          <span className="pa-muted">{levelName(value.level)}</span>
        </div>
        <label className="form-field">
          <span>Name</span>
          <input
            value={value.name}
            maxLength={40}
            autoFocus
            placeholder="e.g. Spike"
            onChange={(event) => setValue({ ...value, name: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Hierarchy level</span>
          <select
            value={value.level}
            disabled={isEdit}
            onChange={(event) =>
              setValue({ ...value, level: Number(event.target.value) as TypeLevel })
            }
          >
            <option value={1}>Epic level</option>
            <option value={0}>Standard</option>
            <option value={-1}>Subtask level</option>
          </select>
          <small className="pa-muted">
            {isEdit
              ? "The level is fixed once a work type exists."
              : LEVEL_HELP[String(value.level)]}
          </small>
        </label>
        <div className="form-field">
          <span>Icon</span>
          <div className="wt-icons" role="radiogroup" aria-label="Icon">
            {WORK_TYPE_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                role="radio"
                aria-checked={value.icon === icon}
                aria-label={icon}
                className={value.icon === icon ? "wt-icon selected" : "wt-icon"}
                onClick={() => setValue({ ...value, icon })}
              >
                <WorkTypeGlyph icon={icon} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <span>Color</span>
          <div className="wf-colors" role="radiogroup" aria-label="Color">
            {TYPE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={value.color.toLowerCase() === color}
                aria-label={color}
                className={value.color.toLowerCase() === color ? "wf-color selected" : "wf-color"}
                style={{ background: color }}
                onClick={() => setValue({ ...value, color })}
              />
            ))}
          </div>
        </div>
        <label className="form-field">
          <span>Description</span>
          <textarea
            rows={2}
            maxLength={500}
            value={value.description}
            onChange={(event) =>
              setValue({ ...value, description: event.target.value })
            }
          />
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
            {saving ? "Saving..." : isEdit ? "Save work type" : "Add work type"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function DeleteTypeDialog({
  type,
  types,
  onClose,
  onSubmit,
}: {
  type: WorkTypeConfig;
  types: WorkTypeConfig[];
  onClose: () => void;
  onSubmit: (replacementKey: string | null) => Promise<void>;
}) {
  const blocker = typeDeleteBlocker(types, type.key);
  const options = typeReplacementOptions(types, type.key);
  const [replacement, setReplacement] = useState(options[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(replacement || null);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError, "Work type could not be deleted"));
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${type.name}?`}
      description="Existing work items of this type change to the replacement type."
    >
      <form className="pa-form" onSubmit={submit} noValidate>
        {blocker ? (
          <p className="form-submit-error" role="alert">
            {blocker}
          </p>
        ) : options.length > 0 ? (
          <label className="form-field">
            <span>Change existing work items to</span>
            <select
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="pa-muted">
            No other {levelName(type.level).toLowerCase()} type exists, so this
            type can only be deleted while no work items use it.
          </p>
        )}
        {error && (
          <p className="form-submit-error" role="alert">
            {error}
          </p>
        )}
        <div className="pa-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button pa-danger"
            type="submit"
            disabled={saving || Boolean(blocker)}
          >
            {saving ? "Deleting..." : "Delete work type"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

export function WorkTypeSettings({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const workflow = useWorkflow(projectId);
  const { setProjectWorkflow } = useWorkflows();
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [deleting, setDeleting] = useState<WorkTypeConfig | null>(null);
  const base = `/api/projects/${encodeURIComponent(projectId)}/workflow/types`;

  const mutate = async (path: string, method: string, body?: unknown) => {
    const next = await apiRequest<ProjectWorkflow>(`${base}${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    setProjectWorkflow(projectId, next);
  };

  return (
    <div className="wt-settings">
      <section className="wf-intro">
        <p className="pa-muted">
          Work types let your team track different kinds of work. Each type sits
          at one hierarchy level, which decides what it can contain.
        </p>
        {!readOnly && (
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              setDraft({
                key: null,
                name: "",
                level: 0,
                icon: "square-check",
                color: "#39c6d0",
                description: "",
              })
            }
          >
            <Plus size={15} aria-hidden="true" />
            Add work type
          </button>
        )}
      </section>

      <aside className="wt-hierarchy" aria-label="Work type hierarchy">
        <h3 className="pa-section-title">Hierarchy</h3>
        <ol>
          {[1, 0, -1].map((level) => (
            <li key={level} className={`wt-level wt-level-${level === -1 ? "sub" : level}`}>
              <strong>{levelName(level as TypeLevel)}</strong>
              <span className="pa-muted">{LEVEL_HELP[String(level)]}</span>
            </li>
          ))}
        </ol>
      </aside>

      {groupTypes(workflow.types).map((group) => (
        <section key={group.level} className="wt-group">
          <h3 className="pa-section-title">
            {levelName(group.level)}{" "}
            <span className="pa-muted">{group.types.length}</span>
          </h3>
          {group.types.length === 0 ? (
            <p className="wf-empty-box">No work types at this level.</p>
          ) : (
            <ul className="wt-list">
              {group.types.map((type) => (
                <li key={type.key} className="wt-row">
                  <TypeBadge type={type} />
                  <div className="wt-row-text">
                    <strong>
                      {type.name}
                      {isBuiltinKind(type.key) && (
                        <span className="wt-builtin">Built-in</span>
                      )}
                    </strong>
                    <span className="pa-muted">
                      {type.description || levelName(type.level)}
                    </span>
                  </div>
                  {!readOnly && (
                    <div className="wf-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${type.name}`}
                        onClick={() =>
                          setDraft({
                            key: type.key,
                            name: type.name,
                            level: type.level,
                            icon: type.icon,
                            color: type.color,
                            description: type.description ?? "",
                          })
                        }
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${type.name}`}
                        onClick={() => setDeleting(type)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {draft && (
        <TypeDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSubmit={async (value) => {
            const description = value.description.trim() || null;
            if (value.key) {
              await mutate(`/${encodeURIComponent(value.key)}`, "PATCH", {
                name: value.name,
                icon: value.icon,
                color: value.color,
                description,
              });
            } else {
              await mutate("", "POST", {
                name: value.name,
                level: value.level,
                icon: value.icon,
                color: value.color,
                description,
              });
            }
          }}
        />
      )}
      {deleting && (
        <DeleteTypeDialog
          type={deleting}
          types={workflow.types}
          onClose={() => setDeleting(null)}
          onSubmit={(replacementKey) =>
            mutate(
              `/${encodeURIComponent(deleting.key)}${
                replacementKey
                  ? `?replacement=${encodeURIComponent(replacementKey)}`
                  : ""
              }`,
              "DELETE",
            )
          }
        />
      )}
    </div>
  );
}
