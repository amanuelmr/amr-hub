"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { useWorkflow, useWorkflows } from "../../../WorkflowProvider";
import {
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  WORKFLOW_COLORS,
  allowedTransitions,
  statusName,
  type ProjectWorkflow,
  type StatusCategory,
  type WorkflowStatusConfig,
  type WorkflowTransitionConfig,
} from "../../../data/workflow";
import { AdminDialog, errorMessage } from "./adminUi";
import {
  globalTransitionTo,
  groupStatuses,
  hasRestrictedExits,
  reorderStatusKeys,
  specificTransitions,
  statusDeleteBlocker,
  statusReplacementOptions,
} from "./workflowEditor";

const CATEGORY_TONE: Record<StatusCategory, string> = {
  TODO: "wf-todo",
  IN_PROGRESS: "wf-progress",
  DONE: "wf-done",
};

export function WorkflowLozenge({
  status,
}: {
  status: Pick<WorkflowStatusConfig, "name" | "category" | "color">;
}) {
  const style: CSSProperties | undefined = status.color
    ? {
        color: status.color,
        borderColor: status.color,
        background: `color-mix(in srgb, ${status.color} 14%, transparent)`,
      }
    : undefined;
  return (
    <span className={`wf-lozenge ${CATEGORY_TONE[status.category]}`} style={style}>
      {status.name}
    </span>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
  allowDefault = true,
  label,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
  allowDefault?: boolean;
  label: string;
}) {
  return (
    <div className="wf-colors" role="radiogroup" aria-label={label}>
      {allowDefault && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="Category default color"
          className={value === null ? "wf-color wf-color-default selected" : "wf-color wf-color-default"}
          disabled={disabled}
          onClick={() => onChange(null)}
        />
      )}
      {WORKFLOW_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value?.toLowerCase() === color}
          aria-label={color}
          className={value?.toLowerCase() === color ? "wf-color selected" : "wf-color"}
          style={{ background: color }}
          disabled={disabled}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

function useWorkflowApi(projectId: string) {
  const { setProjectWorkflow } = useWorkflows();
  const { refreshProjects } = useProjects();
  const base = `/api/projects/${encodeURIComponent(projectId)}/workflow`;
  return async (
    path: string,
    method: string,
    body?: unknown,
    options: { refreshBoard?: boolean } = {},
  ) => {
    const workflow = await apiRequest<ProjectWorkflow>(`${base}${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    setProjectWorkflow(projectId, workflow);
    // Status changes also touch the board column mapping on the server.
    if (options.refreshBoard) void refreshProjects();
    return workflow;
  };
}

function StatusRow({
  status,
  workflow,
  readOnly,
  busy,
  onRename,
  onRecolor,
  onToggleGlobal,
  onDelete,
}: {
  status: WorkflowStatusConfig;
  workflow: ProjectWorkflow;
  readOnly: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onRecolor: (color: string | null) => void;
  onToggleGlobal: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.key, disabled: readOnly });
  const [name, setName] = useState(status.name);
  const [showColors, setShowColors] = useState(false);
  const global = globalTransitionTo(workflow.transitions, status.key);
  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(status.name);
      return;
    }
    if (trimmed !== status.name) onRename(trimmed);
  };

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "wf-status-row dragging" : "wf-status-row"}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="wf-status-main">
        <button
          type="button"
          className="icon-button pa-drag-handle"
          aria-label={`Reorder ${status.name}`}
          disabled={readOnly}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <WorkflowLozenge status={status} />
        {readOnly ? (
          <span className="wf-status-name">{status.name}</span>
        ) : (
          <input
            className="wf-status-input"
            value={name}
            maxLength={40}
            aria-label={`Rename ${status.name}`}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
              if (event.key === "Escape") setName(status.name);
            }}
          />
        )}
        {!readOnly && (
          <div className="wf-row-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={`Change color of ${status.name}`}
              aria-expanded={showColors}
              onClick={() => setShowColors((open) => !open)}
            >
              <span
                className="wf-color-dot"
                style={{ background: status.color ?? "var(--gray-400)" }}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Delete ${status.name}`}
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {showColors && !readOnly && (
        <ColorPicker
          label={`Color for ${status.name}`}
          value={status.color}
          disabled={busy}
          onChange={(color) => {
            onRecolor(color);
            setShowColors(false);
          }}
        />
      )}
      <label className="wf-global-toggle">
        <span className="pa-switch">
          <input
            type="checkbox"
            role="switch"
            checked={Boolean(global)}
            disabled={readOnly || busy}
            onChange={(event) => onToggleGlobal(event.target.checked)}
            aria-label={`Allow all statuses to transition to ${status.name}`}
          />
          <span aria-hidden="true" />
        </span>
        <span>Allow all statuses to transition to this one</span>
      </label>
      {hasRestrictedExits(workflow.transitions, status.key) && (
        <p className="wf-row-note">
          Restricted: only its own transitions
          {workflow.transitions.some((t) => t.fromKey === null) ? " and global ones" : ""}{" "}
          apply.
        </p>
      )}
    </li>
  );
}

type TransitionDraft = {
  id: string | null;
  name: string;
  fromKey: string;
  toKey: string;
};

function TransitionDialog({
  draft,
  statuses,
  onClose,
  onSubmit,
}: {
  draft: TransitionDraft;
  statuses: WorkflowStatusConfig[];
  onClose: () => void;
  onSubmit: (draft: TransitionDraft) => Promise<void>;
}) {
  const [value, setValue] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (value.fromKey === value.toKey) {
      setError("A transition must change the status.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError, "Transition could not be saved"));
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={draft.id ? "Edit transition" : "Add transition"}
      description="Transitions are the paths work can take between statuses."
    >
      <form className="pa-form" onSubmit={submit} noValidate>
        <label className="form-field">
          <span>Name</span>
          <input
            value={value.name}
            maxLength={60}
            placeholder="e.g. Send to QA"
            onChange={(event) => setValue({ ...value, name: event.target.value })}
          />
        </label>
        <div className="pa-form-row">
          <label className="form-field">
            <span>From status</span>
            <select
              value={value.fromKey}
              onChange={(event) =>
                setValue({ ...value, fromKey: event.target.value })
              }
            >
              {statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>To status</span>
            <select
              value={value.toKey}
              onChange={(event) => setValue({ ...value, toKey: event.target.value })}
            >
              {statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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
            {saving ? "Saving..." : draft.id ? "Save transition" : "Add transition"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function AddStatusDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    category: StatusCategory;
    color: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("IN_PROGRESS");
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the status a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), category, color });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError, "Status could not be added"));
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add status"
      description="The category decides how reports, boards and resolution treat this status."
    >
      <form className="pa-form" onSubmit={submit} noValidate>
        <label className="form-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={40}
            autoFocus
            placeholder="e.g. QA"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <fieldset className="pa-choice">
          <legend>Category</legend>
          {STATUS_CATEGORIES.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="status-category"
                checked={category === value}
                onChange={() => setCategory(value)}
              />
              <WorkflowLozenge
                status={{ name: STATUS_CATEGORY_LABELS[value], category: value, color: null }}
              />
              <span className="pa-muted">
                {value === "TODO"
                  ? "Work that has not started."
                  : value === "IN_PROGRESS"
                    ? "Work someone is actively doing."
                    : "Finished work; entering it resolves the issue."}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-field">
          <span>Color</span>
          <ColorPicker label="Status color" value={color} onChange={setColor} />
        </div>
        {name.trim() && (
          <p className="pa-muted">
            Preview: <WorkflowLozenge status={{ name: name.trim(), category, color }} />
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
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Adding..." : "Add status"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function DeleteStatusDialog({
  status,
  statuses,
  onClose,
  onSubmit,
}: {
  status: WorkflowStatusConfig;
  statuses: WorkflowStatusConfig[];
  onClose: () => void;
  onSubmit: (replacementKey: string) => Promise<void>;
}) {
  const options = statusReplacementOptions(statuses, status.key);
  const blocker = statusDeleteBlocker(statuses, status.key);
  const [replacement, setReplacement] = useState(options[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(replacement);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError, "Status could not be deleted"));
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${status.name}?`}
      description="Work items in this status move to the replacement. Transitions to and from it are removed."
    >
      <form className="pa-form" onSubmit={submit} noValidate>
        {blocker ? (
          <p className="form-submit-error" role="alert">
            {blocker}
          </p>
        ) : (
          <label className="form-field">
            <span>Move existing work items to</span>
            <select
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name} ({STATUS_CATEGORY_LABELS[option.category]})
                </option>
              ))}
            </select>
          </label>
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
            disabled={saving || Boolean(blocker) || !replacement}
          >
            {saving ? "Deleting..." : "Delete status"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

/** Compact diagram: each status with the statuses it can move to. */
function TransitionMap({ workflow }: { workflow: ProjectWorkflow }) {
  const groups = groupStatuses(workflow.statuses);
  return (
    <div className="wf-diagram" aria-label="Workflow diagram">
      {STATUS_CATEGORIES.map((category) => (
        <div className="wf-diagram-column" key={category}>
          <h4>{STATUS_CATEGORY_LABELS[category]}</h4>
          {groups[category].map((status) => {
            const exits = allowedTransitions(workflow, status.key);
            const restricted = hasRestrictedExits(workflow.transitions, status.key);
            return (
              <div className="wf-node" key={status.key}>
                <WorkflowLozenge status={status} />
                {globalTransitionTo(workflow.transitions, status.key) && (
                  <span className="wf-node-badge" title="Any status can move here">
                    ALL →
                  </span>
                )}
                <ul className="wf-edges">
                  {!restricted && exits.length === workflow.statuses.length - 1 ? (
                    <li className="pa-muted">
                      <ArrowRight size={12} aria-hidden="true" /> any status
                    </li>
                  ) : exits.length === 0 ? (
                    <li className="pa-muted">No way out</li>
                  ) : (
                    exits.map((exit) => (
                      <li key={exit.toKey}>
                        <ArrowRight size={12} aria-hidden="true" />
                        {exit.name &&
                        exit.name !== statusName(exit.toKey, workflow.statuses) ? (
                          <>
                            <em>{exit.name}</em> ·{" "}
                          </>
                        ) : null}
                        {statusName(exit.toKey, workflow.statuses)}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function WorkflowSettings({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const workflow = useWorkflow(projectId);
  const { isLoading } = useWorkflows();
  const mutate = useWorkflowApi(projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<WorkflowStatusConfig | null>(null);
  const [transitionDraft, setTransitionDraft] = useState<TransitionDraft | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groups = groupStatuses(workflow.statuses);
  const specific = specificTransitions(workflow.transitions, workflow.statuses);
  const ordered = STATUS_CATEGORIES.flatMap((category) => groups[category]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(errorMessage(actionError, fallback));
    } finally {
      setBusy(false);
    }
  };

  const statusPath = (key: string) => `/statuses/${encodeURIComponent(key)}`;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const keys = reorderStatusKeys(
      workflow.statuses,
      String(active.id),
      String(over.id),
    );
    if (!keys) return;
    void run(() => mutate("/statuses", "PUT", { keys }), "Statuses could not be reordered");
  };

  const toggleGlobal = (status: WorkflowStatusConfig, enabled: boolean) => {
    const existing = globalTransitionTo(workflow.transitions, status.key);
    void run(
      () =>
        enabled
          ? mutate("/transitions", "POST", {
              name: status.name,
              fromKey: null,
              toKey: status.key,
            })
          : existing
            ? mutate(`/transitions/${encodeURIComponent(existing.id)}`, "DELETE")
            : Promise.resolve(),
      "Transition could not be updated",
    );
  };

  const deleteTransition = (transition: WorkflowTransitionConfig) =>
    run(
      () => mutate(`/transitions/${encodeURIComponent(transition.id)}`, "DELETE"),
      "Transition could not be deleted",
    );

  if (isLoading && workflow.statuses.length === 0) {
    return <p className="pa-muted">Loading workflow…</p>;
  }

  return (
    <div className="wf-settings">
      <section className="wf-intro">
        <p className="pa-muted">
          Statuses are the steps work moves through. Each belongs to a category:{" "}
          <strong>To do</strong>, <strong>In progress</strong> or{" "}
          <strong>Done</strong>. Categories drive board progress, reports and
          resolution — entering a done status resolves the work item.
        </p>
        {!readOnly && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setAdding(true)}
          >
            <Plus size={15} aria-hidden="true" />
            Add status
          </button>
        )}
      </section>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="wf-categories">
          {STATUS_CATEGORIES.map((category) => (
            <section className="wf-category" key={category}>
              <h3 className="pa-section-title">
                <WorkflowLozenge
                  status={{
                    name: STATUS_CATEGORY_LABELS[category],
                    category,
                    color: null,
                  }}
                />
                <span className="pa-muted">{groups[category].length}</span>
              </h3>
              <SortableContext
                items={groups[category].map((status) => status.key)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="wf-status-list">
                  {groups[category].length === 0 && (
                    <li className="pa-muted wf-empty">No statuses in this category.</li>
                  )}
                  {groups[category].map((status) => (
                    <StatusRow
                      key={`${status.key}:${status.name}`}
                      status={status}
                      workflow={workflow}
                      readOnly={readOnly}
                      busy={busy}
                      onRename={(name) =>
                        void run(
                          () => mutate(statusPath(status.key), "PATCH", { name }),
                          "Status could not be renamed",
                        )
                      }
                      onRecolor={(color) =>
                        void run(
                          () => mutate(statusPath(status.key), "PATCH", { color }),
                          "Status color could not be changed",
                        )
                      }
                      onToggleGlobal={(enabled) => toggleGlobal(status, enabled)}
                      onDelete={() => setDeleting(status)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </section>
          ))}
        </div>
      </DndContext>

      <section className="wf-transitions">
        <div className="pa-section-header">
          <h3 className="pa-section-title">Transitions</h3>
          {!readOnly && ordered.length > 1 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setTransitionDraft({
                  id: null,
                  name: "",
                  fromKey: ordered[0].key,
                  toKey: ordered[1].key,
                })
              }
            >
              <Plus size={15} aria-hidden="true" />
              Add transition
            </button>
          )}
        </div>
        <p className="pa-muted">
          Like Jira: when a status has no specific outgoing transitions, work can
          move from it to any status. Once you add a transition <em>from</em> a
          status, only its transitions plus the global “allow all” transitions
          are available from it.
        </p>
        {specific.length === 0 ? (
          <p className="wf-empty-box">
            No specific transitions — every status can move to every other status.
          </p>
        ) : (
          <div className="pa-table-wrap wf-table-wrap">
            <table className="pa-table wf-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>From</th>
                  <th aria-label="to" />
                  <th>To</th>
                  {!readOnly && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {specific.map((transition) => {
                  const from = workflow.statuses.find(
                    (status) => status.key === transition.fromKey,
                  );
                  const to = workflow.statuses.find(
                    (status) => status.key === transition.toKey,
                  );
                  return (
                    <tr key={transition.id}>
                      <td data-label="Name">{transition.name || "—"}</td>
                      <td data-label="From">
                        {from ? <WorkflowLozenge status={from} /> : transition.fromKey}
                      </td>
                      <td aria-hidden="true">
                        <ArrowRight size={13} />
                      </td>
                      <td data-label="To">
                        {to ? <WorkflowLozenge status={to} /> : transition.toKey}
                      </td>
                      {!readOnly && (
                        <td className="pa-actions-cell">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Edit ${transition.name}`}
                            onClick={() =>
                              setTransitionDraft({
                                id: transition.id,
                                name: transition.name,
                                fromKey: transition.fromKey ?? ordered[0].key,
                                toKey: transition.toKey,
                              })
                            }
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Delete ${transition.name}`}
                            disabled={busy}
                            onClick={() => void deleteTransition(transition)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="pa-section-title">Workflow diagram</h3>
        <TransitionMap workflow={workflow} />
      </section>

      {adding && (
        <AddStatusDialog
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await mutate("/statuses", "POST", input, { refreshBoard: true });
          }}
        />
      )}
      {deleting && (
        <DeleteStatusDialog
          status={deleting}
          statuses={workflow.statuses}
          onClose={() => setDeleting(null)}
          onSubmit={async (replacementKey) => {
            await mutate(
              `${statusPath(deleting.key)}?replacement=${encodeURIComponent(replacementKey)}`,
              "DELETE",
              undefined,
              { refreshBoard: true },
            );
          }}
        />
      )}
      {transitionDraft && (
        <TransitionDialog
          draft={transitionDraft}
          statuses={ordered}
          onClose={() => setTransitionDraft(null)}
          onSubmit={async (draft) => {
            const body = {
              name: draft.name.trim(),
              fromKey: draft.fromKey,
              toKey: draft.toKey,
            };
            await (draft.id
              ? mutate(`/transitions/${encodeURIComponent(draft.id)}`, "PATCH", body)
              : mutate("/transitions", "POST", body));
          }}
        />
      )}
    </div>
  );
}
