"use client";

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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import {
  addableFieldKinds,
  createField,
  FORM_FIELD_KIND_LABELS,
  OPTION_FIELD_KINDS,
  type FormField,
} from "./formModel";

function FieldCard({
  field,
  isSelected,
  onSelect,
  onChange,
  onRemove,
}: {
  field: FormField;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (field: FormField) => void;
  onRemove: () => void;
}) {
  const isSummary = field.kind === "SUMMARY";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: isSummary,
  });
  const inputId = `builder-${field.id}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        "gf-field-card",
        isSelected ? "selected" : "",
        isDragging ? "dragging" : "",
      ].join(" ")}
    >
      <div className="gf-field-card-head">
        {isSummary ? (
          <span className="gf-drag-handle locked" title="Summary is always the first field">
            <Lock size={13} aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            className="gf-drag-handle"
            aria-label={`Reorder ${field.label}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="gf-field-card-summary"
          aria-expanded={isSelected}
          onClick={onSelect}
        >
          <span className="gf-field-card-label">
            {field.label || "Untitled field"}
            {field.required && <span className="gf-required">*</span>}
          </span>
          <span className="gf-field-kind">{FORM_FIELD_KIND_LABELS[field.kind]}</span>
        </button>
        {!isSummary && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${field.label}`}
            title="Remove field"
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {isSelected && (
        <div className="gf-field-card-body">
          <label className="form-field" htmlFor={`${inputId}-label`}>
            <span>Label</span>
            <input
              id={`${inputId}-label`}
              value={field.label}
              maxLength={120}
              onChange={(event) => onChange({ ...field, label: event.target.value })}
            />
          </label>
          <label className="form-field" htmlFor={`${inputId}-help`}>
            <span>Help text</span>
            <input
              id={`${inputId}-help`}
              value={field.help}
              maxLength={300}
              placeholder="Shown under the label"
              onChange={(event) => onChange({ ...field, help: event.target.value })}
            />
          </label>
          {OPTION_FIELD_KINDS.includes(field.kind) && (
            <label className="form-field" htmlFor={`${inputId}-options`}>
              <span>Options (one per line)</span>
              <textarea
                id={`${inputId}-options`}
                rows={4}
                value={field.options.join("\n")}
                onChange={(event) =>
                  onChange({ ...field, options: event.target.value.split("\n") })
                }
              />
            </label>
          )}
          <label className="gf-toggle-row">
            <input
              type="checkbox"
              checked={field.required}
              disabled={isSummary}
              onChange={(event) => onChange({ ...field, required: event.target.checked })}
            />
            <span>{isSummary ? "Required (always)" : "Required"}</span>
          </label>
        </div>
      )}
    </li>
  );
}

export function FormFieldList({
  fields,
  selectedId,
  onSelect,
  onChange,
}: {
  fields: FormField[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (fields: FormField[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((field) => field.id === active.id);
    let to = fields.findIndex((field) => field.id === over.id);
    if (from < 0 || to < 0) return;
    if (to === 0) to = 1; // Summary stays first.
    onChange(arrayMove(fields, from, to));
  };

  const addable = addableFieldKinds(fields);

  return (
    <div className="gf-field-list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <ol className="gf-field-cards">
            {fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                isSelected={selectedId === field.id}
                onSelect={() => onSelect(selectedId === field.id ? null : field.id)}
                onChange={(next) =>
                  onChange(fields.map((candidate) => (candidate.id === field.id ? next : candidate)))
                }
                onRemove={() => {
                  onChange(fields.filter((candidate) => candidate.id !== field.id));
                  if (selectedId === field.id) onSelect(null);
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="secondary-button gf-add-field" disabled={fields.length >= 40}>
            <Plus size={14} aria-hidden="true" />
            Add field
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="shell-menu" align="start" sideOffset={6}>
            {addable.map((kind) => (
              <DropdownMenu.Item
                key={kind}
                className="shell-menu-item"
                onSelect={() => {
                  const field = createField(kind);
                  onChange([...fields, field]);
                  onSelect(field.id);
                }}
              >
                {FORM_FIELD_KIND_LABELS[kind]}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
