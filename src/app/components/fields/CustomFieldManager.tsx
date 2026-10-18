"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, EyeOff, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_HELP,
  CUSTOM_FIELD_TYPE_LABELS,
  isOptionField,
  type CustomFieldDefinition,
  type CustomFieldType,
} from "../../data/customFields";
import { DEFAULT_WORKFLOW, type WorkTypeConfig } from "../../data/workflow";
import { useWorkflows } from "../../WorkflowProvider";
import { reloadCustomFields } from "./customFieldStore";

type Scope = "global" | { projectId: string };

type OptionDraft = { key: string; id?: string; value: string; disabled: boolean };

type FieldDraft = {
  id: string | null;
  name: string;
  type: CustomFieldType;
  description: string;
  required: boolean;
  issueTypes: string[];
  options: OptionDraft[];
};

let draftCounter = 0;
const draftKey = () => `draft-${(draftCounter += 1)}`;

/** fetch wrapper that surfaces zod field errors from the API. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    fields?: Record<string, string[] | undefined>;
  };
  if (!response.ok) {
    const details = Object.values(payload.fields ?? {})
      .flat()
      .filter(Boolean);
    throw new Error(details.length ? details.join(" ") : (payload.error ?? "Request failed"));
  }
  return payload as T;
}

function baseUrl(scope: Scope) {
  return scope === "global"
    ? "/api/custom-fields"
    : `/api/projects/${encodeURIComponent(scope.projectId)}/fields`;
}

function SortableRow({
  id,
  disabled,
  children,
  label,
}: {
  id: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "cf-row dragging" : "cf-row"}
    >
      {!disabled && (
        <button
          type="button"
          className="cf-drag-handle"
          aria-label={`Reorder ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
      )}
      {children}
    </li>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
}) {
  const [newValue, setNewValue] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const add = () => {
    const value = newValue.trim();
    if (!value) return;
    onChange([...options, { key: draftKey(), value, disabled: false }]);
    setNewValue("");
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = options.findIndex((option) => option.key === active.id);
    const to = options.findIndex((option) => option.key === over.id);
    onChange(arrayMove(options, from, to));
  };

  return (
    <div className="cf-options">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={options.map((option) => option.key)} strategy={verticalListSortingStrategy}>
          <ul className="cf-option-list">
            {options.map((option, index) => (
              <SortableRow key={option.key} id={option.key} disabled={false} label={option.value || "option"}>
                <input
                  className={option.disabled ? "cf-option-input disabled" : "cf-option-input"}
                  value={option.value}
                  maxLength={120}
                  aria-label={`Option ${index + 1}`}
                  onChange={(event) =>
                    onChange(
                      options.map((candidate) =>
                        candidate.key === option.key ? { ...candidate, value: event.target.value } : candidate,
                      ),
                    )
                  }
                />
                {option.disabled && <span className="cf-badge">Disabled</span>}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={option.disabled ? `Enable ${option.value}` : `Disable ${option.value}`}
                  title={
                    option.disabled
                      ? "Enable this option"
                      : "Disable: hide it from pickers but keep it on existing issues"
                  }
                  onClick={() =>
                    onChange(
                      options.map((candidate) =>
                        candidate.key === option.key ? { ...candidate, disabled: !candidate.disabled } : candidate,
                      ),
                    )
                  }
                >
                  {option.disabled ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${option.value}`}
                  title={option.id ? "Delete: removes this value from issues" : "Remove"}
                  onClick={() => onChange(options.filter((candidate) => candidate.key !== option.key))}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="cf-option-add">
        <input
          value={newValue}
          maxLength={120}
          placeholder="Add an option"
          aria-label="New option"
          onChange={(event) => setNewValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button className="secondary-button" type="button" onClick={add} disabled={!newValue.trim()}>
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  );
}

function FieldDialog({
  draft,
  types,
  scope,
  onClose,
  onSaved,
}: {
  draft: FieldDraft;
  types: WorkTypeConfig[];
  scope: Scope;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = draft.id !== null;
  const hasOptions = isOptionField(value.type);
  const removedOptions = draft.options.filter(
    (option) => option.id && !value.options.some((candidate) => candidate.id === option.id),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = value.name.trim();
    if (!name) return setError("Give the field a name.");
    const options = value.options
      .map((option) => ({ ...option, value: option.value.trim() }))
      .filter((option) => option.value);
    if (hasOptions && !options.some((option) => !option.disabled)) {
      return setError("Add at least one enabled option.");
    }
    const lower = options.map((option) => option.value.toLowerCase());
    if (new Set(lower).size !== lower.length) return setError("Option names must be unique.");

    setSaving(true);
    setError(null);
    const body = {
      name,
      description: value.description.trim() || null,
      required: value.required,
      issueTypes: value.issueTypes,
      ...(hasOptions
        ? {
            options: options.map((option) => ({
              ...(option.id ? { id: option.id } : {}),
              value: option.value,
              ...(option.disabled ? { disabled: true } : {}),
            })),
          }
        : {}),
    };
    try {
      if (isEdit) {
        await request(`${baseUrl(scope)}/${encodeURIComponent(draft.id ?? "")}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await request(baseUrl(scope), {
          method: "POST",
          body: JSON.stringify({ ...body, type: value.type }),
        });
      }
      onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The field could not be saved");
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="pa-dialog-overlay" />
        <Dialog.Content className="pa-dialog pa-dialog-wide cf-dialog" aria-describedby={undefined}>
          <header className="pa-dialog-header">
            <div>
              <Dialog.Title>{isEdit ? `Edit ${draft.name}` : "Create custom field"}</Dialog.Title>
              <Dialog.Description>
                {scope === "global"
                  ? "Global fields are available in every project."
                  : "This field is only available in this project."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <form className="pa-form cf-form" onSubmit={submit} noValidate>
            <label className="form-field">
              <span>
                Name <span className="create-issue-required">*</span>
              </span>
              <input
                value={value.name}
                maxLength={80}
                autoFocus
                onChange={(event) => setValue({ ...value, name: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Field type</span>
              <select
                value={value.type}
                disabled={isEdit}
                onChange={(event) => {
                  const type = event.target.value as CustomFieldType;
                  setValue({ ...value, type, options: isOptionField(type) ? value.options : [] });
                }}
              >
                {CUSTOM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CUSTOM_FIELD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <small className="field-meta">
                {isEdit
                  ? "The field type cannot be changed after the field is created."
                  : CUSTOM_FIELD_TYPE_HELP[value.type]}
              </small>
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Help text shown with the field"
                value={value.description}
                onChange={(event) => setValue({ ...value, description: event.target.value })}
              />
            </label>
            {hasOptions && (
              <div className="form-field">
                <span>Options</span>
                <OptionsEditor
                  options={value.options}
                  onChange={(options) => setValue({ ...value, options })}
                />
                {removedOptions.length > 0 && (
                  <small className="field-error">
                    Deleting {removedOptions.map((option) => `'${option.value}'`).join(", ")} removes
                    {removedOptions.length === 1 ? " it" : " them"} from every issue. Disable an option
                    instead to keep existing values.
                  </small>
                )}
              </div>
            )}
            <fieldset className="form-field cf-types">
              <span>Work types</span>
              <small className="field-meta">
                Leave all unticked to use this field for every work type.
              </small>
              <div className="cf-type-grid">
                {types.map((type) => (
                  <label key={type.key} className="cf-choice">
                    <input
                      type="checkbox"
                      checked={value.issueTypes.includes(type.key)}
                      onChange={(event) =>
                        setValue({
                          ...value,
                          issueTypes: event.target.checked
                            ? [...value.issueTypes, type.key]
                            : value.issueTypes.filter((key) => key !== type.key),
                        })
                      }
                    />
                    <span>{type.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="issue-checkbox">
              <input
                type="checkbox"
                checked={value.required}
                onChange={(event) => setValue({ ...value, required: event.target.checked })}
              />
              Required: work items cannot be created or saved without a value
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
                {saving ? "Saving..." : isEdit ? "Save field" : "Create field"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteFieldDialog({
  field,
  scope,
  onClose,
  onDeleted,
}: {
  field: CustomFieldDefinition;
  scope: Scope;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const count = field.usageCount ?? 0;

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await request(`${baseUrl(scope)}/${encodeURIComponent(field.id)}`, { method: "DELETE" });
      onDeleted();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The field could not be deleted");
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="pa-dialog-overlay" />
        <Dialog.Content className="pa-dialog" aria-describedby={undefined}>
          <header className="pa-dialog-header">
            <div>
              <Dialog.Title>Delete {field.name}?</Dialog.Title>
              <Dialog.Description>
                {count > 0
                  ? `${count} work item${count === 1 ? " has" : "s have"} a value for this field. Deleting it permanently removes those values.`
                  : "No work items have a value for this field yet."}
              </Dialog.Description>
            </div>
          </header>
          {error && (
            <p className="form-submit-error" role="alert">
              {error}
            </p>
          )}
          <div className="pa-dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button pa-danger" type="button" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Deleting..." : "Delete field"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function toDraft(field: CustomFieldDefinition): FieldDraft {
  return {
    id: field.id,
    name: field.name,
    type: field.type,
    description: field.description ?? "",
    required: field.required,
    issueTypes: field.issueTypes,
    options: field.options.map((option) => ({
      key: option.id,
      id: option.id,
      value: option.value,
      disabled: Boolean(option.disabled),
    })),
  };
}

const EMPTY_DRAFT: FieldDraft = {
  id: null,
  name: "",
  type: "TEXT",
  description: "",
  required: false,
  issueTypes: [],
  options: [],
};

/**
 * Lists, creates, edits, reorders (drag) and deletes custom fields for one
 * context: the workspace (global fields) or a single project.
 */
export function CustomFieldManager({ scope, readOnly }: { scope: Scope; readOnly: boolean }) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [deleting, setDeleting] = useState<CustomFieldDefinition | null>(null);
  const { workflows } = useWorkflows();
  const projectId = scope === "global" ? null : scope.projectId;
  const listUrl = scope === "global" ? "/api/custom-fields?scope=global" : baseUrl(scope);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const types = useMemo(() => {
    const sources = projectId
      ? [workflows[projectId] ?? DEFAULT_WORKFLOW]
      : [DEFAULT_WORKFLOW, ...Object.values(workflows)];
    const byKey = new Map<string, WorkTypeConfig>();
    for (const workflow of sources) {
      for (const type of workflow.types) if (!byKey.has(type.key)) byKey.set(type.key, type);
    }
    return [...byKey.values()];
  }, [projectId, workflows]);
  const typeName = (key: string) => types.find((type) => type.key === key)?.name ?? key;

  const load = useCallback(async () => {
    try {
      setFields(await request<CustomFieldDefinition[]>(listUrl));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Fields could not be loaded");
    } finally {
      setIsLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    // Initial load; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const changed = () => {
    void load();
    void reloadCustomFields();
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((field) => field.id === active.id);
    const to = fields.findIndex((field) => field.id === over.id);
    const next = arrayMove(fields, from, to);
    setFields(next);
    setActionError(null);
    try {
      await request(`${scope === "global" ? "/api/custom-fields" : baseUrl(scope)}/reorder`, {
        method: "POST",
        body: JSON.stringify({ ids: next.map((field) => field.id) }),
      });
      void reloadCustomFields();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The order could not be saved");
      void load();
    }
  };

  return (
    <div className="cf-manager">
      <section className="cf-intro">
        <p className="pa-muted">
          {scope === "global"
            ? "Custom fields capture information that the standard fields don't. Global fields appear on work items in every project; drag to set the order they appear in."
            : "Fields that only this project uses. Global fields from workspace settings also appear on this project's work items."}
        </p>
        {!readOnly && (
          <button className="primary-button" type="button" onClick={() => setDraft(EMPTY_DRAFT)}>
            <Plus size={15} aria-hidden="true" />
            Create field
          </button>
        )}
      </section>

      {actionError && (
        <p className="form-submit-error" role="alert">
          {actionError}
        </p>
      )}

      {isLoading ? (
        <p className="pa-muted">Loading fields…</p>
      ) : loadError ? (
        <p className="form-submit-error" role="alert">
          {loadError}
        </p>
      ) : fields.length === 0 ? (
        <div className="cf-empty">
          <h3>No custom fields yet</h3>
          <p className="pa-muted">
            {readOnly
              ? "No fields have been added."
              : "Create a field to track things like severity, customer, or effort."}
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
          <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
            <ul className="cf-list" aria-label="Custom fields">
              {fields.map((field) => (
                <SortableRow key={field.id} id={field.id} disabled={readOnly} label={field.name}>
                  <div className="cf-row-text">
                    <strong>
                      {field.name}
                      {field.required && <span className="cf-badge cf-badge-required">Required</span>}
                    </strong>
                    <span className="pa-muted">
                      {CUSTOM_FIELD_TYPE_LABELS[field.type]}
                      {" · "}
                      {field.issueTypes.length === 0
                        ? "All work types"
                        : field.issueTypes.map(typeName).join(", ")}
                      {isOptionField(field.type) &&
                        ` · ${field.options.filter((option) => !option.disabled).length} options`}
                    </span>
                    {field.description && <span className="cf-row-description">{field.description}</span>}
                  </div>
                  <span className="cf-usage" title="Work items with a value">
                    {field.usageCount ?? 0} {field.usageCount === 1 ? "item" : "items"}
                  </span>
                  {!readOnly && (
                    <div className="wf-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${field.name}`}
                        onClick={() => setDraft(toDraft(field))}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${field.name}`}
                        onClick={() => setDeleting(field)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </SortableRow>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {draft && (
        <FieldDialog
          draft={draft}
          types={types}
          scope={scope}
          onClose={() => setDraft(null)}
          onSaved={changed}
        />
      )}
      {deleting && (
        <DeleteFieldDialog
          field={deleting}
          scope={scope}
          onClose={() => setDeleting(null)}
          onDeleted={changed}
        />
      )}
    </div>
  );
}
